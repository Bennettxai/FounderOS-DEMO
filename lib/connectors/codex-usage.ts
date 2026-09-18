/**
 * The Codex (OpenAI) plan lane, read from the session rollouts the codex CLI
 * writes under ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl.
 *
 * Codex is generous here in a way Claude Code is not: its `token_count`
 * events embed the plan's OFFICIAL rate-limit gauge -- `used_percent` for a
 * 300-minute window and a 10,080-minute (weekly) window, with reset times.
 * So this lane shows real percentages, exactly as fresh as the last time the
 * CLI ran; `capturedAt` carries that timestamp and the UI must show its age
 * rather than pretend the gauge is live.
 *
 * Token counters in those events are CUMULATIVE per session, so a session
 * contributes its final total to the day of its last event -- never the sum
 * of every event. Whole files are parsed once and memoized by (size, mtime).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  USAGE_WINDOW_DAYS,
  codexSessionFold,
  dayKey,
  emptyDays,
  parseCodexLine,
  type CodexRateLimits,
  type SeatUsage,
} from '@/lib/usage';

export function defaultCodexDir(): string {
  return process.env.CODEX_SESSIONS_DIR || path.join(os.homedir(), '.codex', 'sessions');
}

type SessionSummary = { ts: string; in: number; out: number; cacheRead: number; rateLimits: CodexRateLimits | null };
const fileCache = new Map<string, { size: number; mtimeMs: number; summary: SessionSummary }>();

function listSessions(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, depth: number) => {
    if (depth > 4) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
    }
  };
  walk(dir, 0);
  return out;
}

function summarize(file: string): SessionSummary | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  const hit = fileCache.get(file);
  if (hit && hit.size === stat.size && hit.mtimeMs === stat.mtimeMs) return hit.summary;
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const events = [];
  for (const line of raw.split('\n')) {
    if (!line.includes('token_count')) continue;
    const p = parseCodexLine(line);
    if (p) events.push(p);
  }
  if (events.length === 0) return null;
  const fold = codexSessionFold(events);
  const summary: SessionSummary = { ts: fold.ts, ...fold.cumulative, rateLimits: fold.rateLimits };
  fileCache.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, summary });
  return summary;
}

/** The whole Codex lane, or null when no sessions exist at all. */
export async function codexSeat(dir: string = defaultCodexDir(), now: Date = new Date()): Promise<SeatUsage | null> {
  const files = listSessions(dir);
  if (files.length === 0) return null;

  const days = emptyDays(now, USAGE_WINDOW_DAYS);
  let newest: SessionSummary | null = null;
  let lastActivity: string | null = null;

  for (const f of files) {
    const s = summarize(f);
    if (!s || !s.ts) continue;
    if (!lastActivity || s.ts > lastActivity) lastActivity = s.ts;
    if (s.rateLimits && (!newest || s.ts > newest.ts)) newest = s;
    const bucket = days.find((d) => d.day === dayKey(s.ts));
    if (bucket) {
      bucket.in += s.in;
      bucket.out += s.out;
      bucket.cacheRead += s.cacheRead;
    }
  }

  return {
    id: 'codex',
    kind: 'codex',
    label: 'Codex · OpenAI plan',
    source: 'local',
    capturedAt: newest?.ts ?? lastActivity ?? now.toISOString(),
    days,
    byModel: {},
    lastActivity,
    official: newest?.rateLimits ?? null,
    note: newest
      ? 'official plan gauge, as of the last codex run'
      : 'no rate-limit events found in recent sessions',
  };
}
