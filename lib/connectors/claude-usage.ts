/**
 * This machine's Claude seat, read from the transcripts Claude Code already
 * writes: every assistant message in ~/.claude/projects/**\/*.jsonl carries a
 * `usage` block with real token counts and the model that earned them.
 *
 * The board polls this every ~10s, and the projects dir here is 566MB, so the
 * scan is incremental: per file we remember the byte offset of the last
 * complete line we folded, plus the running day/model totals, and each poll
 * reads only the appended tail. Transcripts are append-only; a file that
 * SHRANK was rewritten, and its totals are rebuilt from zero rather than
 * double-counted. First contact with a big file streams it once and never
 * again.
 *
 * What this lane cannot know: Anthropic's official weekly-limit percentage.
 * The formula is unpublished and this box's Keychain holds no claudeAiOauth
 * token to ask with. So the seat reports honest raw burn -- in/out/cache-write
 * by day and model, cache reads separately -- and labels itself an estimate.
 * If CLAUDE_OAUTH_TOKEN ever lands in the env, `officialClaudeUsage` starts
 * decorating the same seat with the real gauge; nothing else changes.
 */
import fs from 'node:fs';
import { claudeSessions } from '@/lib/oauth/claude-sessions';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import {
  USAGE_WINDOW_DAYS,
  dayKey,
  emptyDays,
  parseClaudeLine,
  type OfficialWindow,
  type SeatUsage,
} from '@/lib/usage';

/** Only files touched inside the window (plus a day of slack) are scanned. */
const MTIME_SLACK_DAYS = USAGE_WINDOW_DAYS + 1;

type Tot = { in: number; out: number; cacheWrite: number; cacheRead: number };
type FileState = {
  offset: number;
  size: number;
  perDay: Record<string, Tot>;
  /** model totals PER DAY, so the merged model split respects the window. */
  perDayModel: Record<string, Record<string, Tot>>;
  lastTs: string | null;
};

export type ScanCache = { files: Map<string, FileState> };

export function newScanCache(): ScanCache {
  return { files: new Map() };
}

/** Module-level cache: the route handler is re-entered per poll, the fold work
    must not be. */
const GLOBAL_CACHE = newScanCache();

export function defaultProjectsDir(): string {
  return process.env.CLAUDE_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects');
}

export function seatId(): string {
  const host = os.hostname().replace(/\.local$/i, '');
  return process.env.FOUNDER_OS_SEAT_ID || `claude-${host.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

export function seatLabel(): string {
  return process.env.FOUNDER_OS_SEAT_LABEL || `Claude · ${os.hostname().replace(/\.local$/, '')}`;
}

function listJsonl(dir: string, newerThanMs: number): string[] {
  const out: string[] = [];
  const walk = (d: string, depth: number) => {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.isFile() && e.name.endsWith('.jsonl')) {
        try {
          if (fs.statSync(p).mtimeMs >= newerThanMs) out.push(p);
        } catch {
          /* raced deletion */
        }
      }
    }
  };
  walk(dir, 0);
  return out;
}

/** Fold the bytes of `file` from `state.offset` onward into `state`, stopping
    at the last complete line. Returns the new offset. */
async function foldTail(file: string, state: FileState): Promise<void> {
  const size = fs.statSync(file).size;
  if (size < state.size) {
    // rewritten shorter: everything we folded is suspect
    state.offset = 0;
    state.size = 0;
    state.perDay = {};
    state.perDayModel = {};
    state.lastTs = null;
  }
  if (size === state.offset) {
    state.size = size;
    return;
  }

  const stream = fs.createReadStream(file, { start: state.offset, encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let consumed = state.offset;
  for await (const line of rl) {
    const bytes = Buffer.byteLength(line, 'utf8') + 1; // + newline
    if (consumed + bytes > size) break; // partial final line: fold it next poll, once complete
    // cheap reject before JSON.parse: most lines are user/tool traffic
    if (line.includes('"type":"assistant"')) {
      const p = parseClaudeLine(line);
      if (p) {
        const dk = dayKey(p.ts);
        const b = (state.perDay[dk] ??= { in: 0, out: 0, cacheWrite: 0, cacheRead: 0 });
        b.in += p.in;
        b.out += p.out;
        b.cacheWrite += p.cacheWrite;
        b.cacheRead += p.cacheRead;
        const dm = (state.perDayModel[dk] ??= {});
        const m = (dm[p.model] ??= { in: 0, out: 0, cacheWrite: 0, cacheRead: 0 });
        m.in += p.in;
        m.out += p.out;
        m.cacheWrite += p.cacheWrite;
        m.cacheRead += p.cacheRead;
        if (!state.lastTs || p.ts > state.lastTs) state.lastTs = p.ts;
      }
    }
    consumed += bytes;
  }
  state.offset = consumed;
  state.size = size;
}

/** The local Claude seat: burn by day and model across every project on this
    machine, incremental after the first pass. */
export async function scanClaudeProjects(
  dir: string,
  now: Date = new Date(),
  cache: ScanCache = GLOBAL_CACHE,
): Promise<SeatUsage> {
  const newerThan = now.getTime() - MTIME_SLACK_DAYS * 24 * 3600_000;
  const files = listJsonl(dir, newerThan);

  for (const f of files) {
    const state =
      cache.files.get(f) ?? { offset: 0, size: 0, perDay: {}, perDayModel: {}, lastTs: null };
    try {
      await foldTail(f, state);
      cache.files.set(f, state);
    } catch {
      /* unreadable file: skip, keep prior state */
    }
  }
  // evict files that fell out of the mtime window so memory stays bounded
  for (const key of cache.files.keys()) {
    if (!files.includes(key)) cache.files.delete(key);
  }

  const days = emptyDays(now, USAGE_WINDOW_DAYS);
  const byModel: SeatUsage['byModel'] = {};
  let lastTs: string | null = null;
  for (const state of cache.files.values()) {
    for (const d of days) {
      const b = state.perDay[d.day];
      if (b) {
        d.in += b.in;
        d.out += b.out;
        d.cacheWrite += b.cacheWrite;
        d.cacheRead += b.cacheRead;
      }
      // model split honors the same window as the day columns -- a still-open
      // file from last month must not inflate this week's per-model numbers
      for (const [m, t] of Object.entries(state.perDayModel[d.day] ?? {})) {
        if (t.in + t.out + t.cacheWrite + t.cacheRead === 0) continue;
        const agg = (byModel[m] ??= { in: 0, out: 0, cacheWrite: 0, cacheRead: 0 });
        agg.in += t.in;
        agg.out += t.out;
        agg.cacheWrite += t.cacheWrite;
        agg.cacheRead += t.cacheRead;
      }
    }
    if (state.lastTs && (!lastTs || state.lastTs > lastTs)) lastTs = state.lastTs;
  }

  return {
    id: seatId(),
    kind: 'claude',
    label: seatLabel(),
    source: 'local',
    capturedAt: now.toISOString(),
    days,
    byModel,
    lastActivity: lastTs,
    official: await officialClaudeUsage(),
    note:
      files.length === 0
        ? 'no transcripts found — is this the right CLAUDE_PROJECTS_DIR?'
        : 'local burn estimate; Anthropic does not expose the official weekly % on this box',
  };
}

// ── official gauge (optional) ───────────────────────────────────────────────

let officialCache: { at: number; value: SeatUsage['official'] } | null = null;

/** Best-effort official usage, only when a token is explicitly provided.
    Fails to null fast and silently: the burn estimate must never wait on it. */
export async function officialClaudeUsage(): Promise<SeatUsage['official']> {
  const token = claudeSessions()[0]?.token;
  if (!token || process.env.VITEST) return null;
  if (officialCache && Date.now() - officialCache.at < 60_000) return officialCache.value;
  return officialUsageForToken(token);
}

/**
 * The same gauge for one specific token. Split out of the cached single-token
 * path so several sessions can be read at once without fighting over one
 * module-level cache entry.
 */
export async function officialUsageForToken(token: string): Promise<SeatUsage['official']> {
  try {
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as Record<string, unknown>;
    const win = (o: unknown): OfficialWindow | undefined => {
      const w = o as { utilization?: unknown; used_percent?: unknown; resets_at?: unknown } | undefined;
      const pct = typeof w?.utilization === 'number' ? w.utilization : typeof w?.used_percent === 'number' ? w.used_percent : undefined;
      if (pct === undefined) return undefined;
      return { usedPercent: pct, windowMinutes: 0, resetsAt: typeof w?.resets_at === 'string' ? w.resets_at : null };
    };
    const session = win(body.five_hour);
    const weekly = win(body.seven_day);
    const value = session || weekly ? { session, weekly } : null;
    officialCache = { at: Date.now(), value };
    return value;
  } catch {
    officialCache = { at: Date.now(), value: null };
    return null;
  }
}

/**
 * Every configured Claude OAuth session with its live plan gauge, so /usage
 * can show two subscriptions side by side instead of one. Reads run together;
 * a session whose token has gone stale reports a null gauge rather than
 * taking the others down.
 */
export async function claudeSessionGauges(): Promise<
  { id: string; label: string; official: SeatUsage['official'] }[]
> {
  if (process.env.VITEST) return [];
  return Promise.all(
    claudeSessions().map(async (s) => ({
      id: s.id,
      label: s.label,
      official: await officialUsageForToken(s.token).catch(() => null),
    })),
  );
}
