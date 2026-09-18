/**
 * Token-burn accounting across the model subscriptions the operator actually pays
 * for: two Claude seats (this box + the host), the Codex plan, and Ollama.
 *
 * Why this exists: the weekly-limit burn. Two 300k+ sessions ate
 * 73% of a week's Claude allowance before anyone noticed, because the only
 * gauge was `/usage` inside a running session. This module turns the local
 * evidence every CLI already writes to disk into one board, so "which seat do
 * I burn next" is a glance, not an incident.
 *
 * Sources are deliberately free and local -- no LLM, no paid API in the
 * refresh path:
 * - Claude Code appends per-message `usage` blocks to
 * ~/.claude/projects/**\/*.jsonl. Raw tokens, by model, by day. That is a
 * burn ESTIMATE: Anthropic does not publish the weekly-limit formula, and
 * this box's Keychain carries no OAuth token to ask the official number.
 * - Codex logs `token_count` events that include the plan's OFFICIAL
 * `used_percent` for the 5-hour and 7-day windows. Those are real gauge
 * values, just as stale as the last time the CLI ran.
 * - Ollama publishes no usage API at all; its lane is status-only and says
 * so rather than faking a bar.
 *
 * Everything here is pure and fed by the connectors; the one impure surface
 * is the repo (usage_snapshots) where OTHER machines push their seat reading.
 */
import { z } from 'zod';

// ── shapes ──────────────────────────────────────────────────────────────────

export const OfficialWindowSchema = z.object({
  usedPercent: z.number().min(0),
  windowMinutes: z.number().int().positive(),
  resetsAt: z.string().nullable(),
});
export type OfficialWindow = z.infer<typeof OfficialWindowSchema>;

export const DayBucketSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  in: z.number().min(0),
  out: z.number().min(0),
  cacheWrite: z.number().min(0),
  cacheRead: z.number().min(0),
});
export type DayBucket = z.infer<typeof DayBucketSchema>;

const ModelTotalsSchema = z.record(
  z.object({ in: z.number(), out: z.number(), cacheWrite: z.number(), cacheRead: z.number() }),
);

export const UsageSnapshotSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['claude', 'codex']),
  label: z.string().min(1),
  /** 'local' = computed on this box just now; 'push' = another machine sent it. */
  source: z.enum(['local', 'push']),
  capturedAt: z.string().min(1),
  /** Oldest → today. Fixed length so cards line up across seats. */
  days: z.array(DayBucketSchema),
  byModel: ModelTotalsSchema,
  lastActivity: z.string().nullable(),
  /** Real plan gauges when a CLI recorded them; null means estimate-only. */
  official: z
    .object({ session: OfficialWindowSchema.optional(), weekly: OfficialWindowSchema.optional() })
    .nullable(),
  note: z.string().optional(),
});
export type SeatUsage = z.infer<typeof UsageSnapshotSchema>;

export const USAGE_WINDOW_DAYS = 7;
/** A pushed snapshot older than this cannot enter a rotation comparison. */
export const STALE_PUSH_MS = 24 * 3600_000;

// ── day math ────────────────────────────────────────────────────────────────

/** Local-timezone calendar day for an ISO timestamp: the day the operator lived. */
export function dayKey(ts: string): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function emptyDays(now: Date, days: number): DayBucket[] {
  const out: DayBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600_000);
    out.push({ day: dayKey(d.toISOString()), in: 0, out: 0, cacheWrite: 0, cacheRead: 0 });
  }
  return out;
}

// ── Claude transcript lines ─────────────────────────────────────────────────

export type ParsedUsageLine = {
  ts: string;
  model: string;
  in: number;
  out: number;
  cacheWrite: number;
  cacheRead: number;
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** One transcript JSONL line → token counters, or null for anything that is
    not an assistant message with a usage block. Zeros are not evidence. */
export function parseClaudeLine(line: string): ParsedUsageLine | null {
  if (!line.trim()) return null;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (d.type !== 'assistant' || typeof d.timestamp !== 'string') return null;
  const msg = d.message as { model?: unknown; usage?: Record<string, unknown> } | undefined;
  const usage = msg?.usage;
  if (!usage) return null;
  return {
    ts: d.timestamp,
    model: typeof msg?.model === 'string' ? msg.model : 'unknown',
    in: num(usage.input_tokens),
    out: num(usage.output_tokens),
    cacheWrite: num(usage.cache_creation_input_tokens),
    cacheRead: num(usage.cache_read_input_tokens),
  };
}

/** Mutating fold: cheap, and the connector folds millions of lines. Entries
    outside the day window are dropped, never misfiled onto an edge day. */
export function foldInto(days: DayBucket[], byModel: SeatUsage['byModel'], p: ParsedUsageLine): void {
  const key = dayKey(p.ts);
  const bucket = days.find((d) => d.day === key);
  if (!bucket) return;
  bucket.in += p.in;
  bucket.out += p.out;
  bucket.cacheWrite += p.cacheWrite;
  bucket.cacheRead += p.cacheRead;
  const m = (byModel[p.model] ??= { in: 0, out: 0, cacheWrite: 0, cacheRead: 0 });
  m.in += p.in;
  m.out += p.out;
  m.cacheWrite += p.cacheWrite;
  m.cacheRead += p.cacheRead;
}

/** "Burn" = tokens that are new work for the provider: input + output + cache
    writes. Cache READS are shown separately -- they are re-read context, the
    88%-of-spend problem, but they are not the same axis. */
export function burnOf(b: { in: number; out: number; cacheWrite: number }): number {
  return b.in + b.out + b.cacheWrite;
}

export function totalBurn(days: DayBucket[]): number {
  return days.reduce((s, d) => s + burnOf(d), 0);
}

// ── Codex session events ────────────────────────────────────────────────────

export type CodexRateLimits = { session?: OfficialWindow; weekly?: OfficialWindow };
export type ParsedCodexLine = {
  ts: string;
  /** Cumulative for the session, as Codex reports it -- NOT a delta. */
  cumulative: { in: number; out: number; cacheRead: number };
  rateLimits: CodexRateLimits | null;
};

function codexWindow(w: unknown): OfficialWindow | undefined {
  const o = w as { used_percent?: unknown; window_minutes?: unknown; resets_at?: unknown } | undefined;
  if (!o || typeof o.used_percent !== 'number' || typeof o.window_minutes !== 'number') return undefined;
  return {
    usedPercent: o.used_percent,
    windowMinutes: o.window_minutes,
    resetsAt: typeof o.resets_at === 'number' ? new Date(o.resets_at * 1000).toISOString() : null,
  };
}

export function parseCodexLine(line: string): ParsedCodexLine | null {
  if (!line.trim()) return null;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  const payload = d.payload as
    | { type?: unknown; info?: { total_token_usage?: Record<string, unknown> }; rate_limits?: Record<string, unknown> }
    | undefined;
  if (d.type !== 'event_msg' || payload?.type !== 'token_count') return null;
  const t = payload.info?.total_token_usage;
  if (!t) return null;
  const rl = payload.rate_limits;
  const session = rl ? codexWindow(rl.primary) : undefined;
  const weekly = rl ? codexWindow(rl.secondary) : undefined;
  return {
    ts: typeof d.timestamp === 'string' ? d.timestamp : '',
    cumulative: { in: num(t.input_tokens), out: num(t.output_tokens), cacheRead: num(t.cached_input_tokens) },
    rateLimits: session || weekly ? { session, weekly } : null,
  };
}

/** A session's worth of token_count events → its final totals plus the last
    rate-limit gauge the CLI printed. Cumulative counters: last one wins. */
export function codexSessionFold(events: ParsedCodexLine[]): {
  ts: string;
  cumulative: ParsedCodexLine['cumulative'];
  rateLimits: CodexRateLimits | null;
} {
  let ts = '';
  let cumulative = { in: 0, out: 0, cacheRead: 0 };
  let rateLimits: CodexRateLimits | null = null;
  for (const e of events) {
    ts = e.ts || ts;
    cumulative = e.cumulative;
    if (e.rateLimits) rateLimits = e.rateLimits;
  }
  return { ts, cumulative, rateLimits };
}

// ── rotation verdict ────────────────────────────────────────────────────────

export type Verdict = { recommend: string | null; reason: string };

/**
 * Which Claude seat should take the next heavy session. Official weekly
 * percentages win when both seats have them; otherwise local burn totals are
 * compared, clearly named as an estimate. One-sided data never produces a
 * recommendation -- a missing seat is a fact to surface, not a win by forfeit.
 */
export function seatVerdict(seats: SeatUsage[], now: Date = new Date()): Verdict {
  const claude = seats.filter((s) => s.kind === 'claude');
  if (claude.length < 2) return { recommend: null, reason: 'only one Claude seat configured' };

  const stale = claude.filter(
    (s) => s.source === 'push' && now.getTime() - new Date(s.capturedAt).getTime() > STALE_PUSH_MS,
  );
  const live = claude.filter((s) => !stale.includes(s));
  if (live.length < 2) {
    const names = stale.map((s) => s.label).join(', ');
    return { recommend: null, reason: `stale snapshot from ${names} — push a fresh reading before rotating` };
  }

  const official = live.filter((s) => s.official?.weekly);
  if (official.length === live.length) {
    const best = [...official].sort((a, b) => a.official!.weekly!.usedPercent - b.official!.weekly!.usedPercent)[0];
    return {
      recommend: best.id,
      reason: `lowest official weekly usage (${best.official!.weekly!.usedPercent.toFixed(0)}%)`,
    };
  }

  const withData = live.filter((s) => totalBurn(s.days) > 0 || s.lastActivity);
  if (withData.length < live.length) {
    const missing = live.filter((s) => !withData.includes(s)).map((s) => s.label);
    return { recommend: null, reason: `no data from ${missing.join(', ')}` };
  }
  const best = [...withData].sort((a, b) => totalBurn(a.days) - totalBurn(b.days))[0];
  return { recommend: best.id, reason: `lowest 7-day local burn estimate (${fmtTokens(totalBurn(best.days))})` };
}

/** 1234567 → "1.2M" -- the board is a gauge, not an invoice. */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
