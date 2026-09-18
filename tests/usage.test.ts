import { describe, expect, test } from 'vitest';
import {
  UsageSnapshotSchema,
  burnOf,
  codexSessionFold,
  dayKey,
  emptyDays,
  foldInto,
  parseClaudeLine,
  parseCodexLine,
  seatVerdict,
  totalBurn,
  type DayBucket,
  type SeatUsage,
} from '@/lib/usage';
import { openDb } from '@/lib/db';

const NOW = new Date('2026-09-05T15:00:00.000Z');

function claudeLine(over: Record<string, unknown> = {}, usage: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: '2026-09-05T14:00:00.000Z',
    message: {
      model: 'claude-opus-5',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 1000,
        ...usage,
      },
    },
    ...over,
  });
}

describe('parseClaudeLine', () => {
  test('extracts model and the four token counters from an assistant line', () => {
    const p = parseClaudeLine(claudeLine());
    expect(p).toEqual({
      ts: '2026-09-05T14:00:00.000Z',
      model: 'claude-opus-5',
      in: 100,
      out: 50,
      cacheWrite: 20,
      cacheRead: 1000,
    });
  });

  test('ignores non-assistant lines, blank lines, and garbage', () => {
    expect(parseClaudeLine(JSON.stringify({ type: 'user', timestamp: 'x' }))).toBeNull();
    expect(parseClaudeLine('')).toBeNull();
    expect(parseClaudeLine('{not json')).toBeNull();
  });

  test('ignores an assistant line with no usage block rather than counting zeros', () => {
    expect(parseClaudeLine(JSON.stringify({ type: 'assistant', timestamp: 'x', message: { model: 'm' } }))).toBeNull();
  });

  test('treats missing counters as zero, not NaN', () => {
    const p = parseClaudeLine(claudeLine({}, { cache_creation_input_tokens: undefined, cache_read_input_tokens: undefined }));
    expect(p!.cacheWrite).toBe(0);
    expect(p!.cacheRead).toBe(0);
  });
});

describe('day bucketing', () => {
  test('emptyDays ends today and spans the requested window', () => {
    const days = emptyDays(NOW, 7);
    expect(days).toHaveLength(7);
    expect(days[6].day).toBe(dayKey(NOW.toISOString()));
    expect(new Set(days.map((d) => d.day)).size).toBe(7);
  });

  test('foldInto lands tokens on the right day and model', () => {
    const days = emptyDays(NOW, 7);
    const byModel: SeatUsage['byModel'] = {};
    foldInto(days, byModel, parseClaudeLine(claudeLine())!);
    foldInto(days, byModel, parseClaudeLine(claudeLine())!);
    const today = days[6];
    expect(today.in).toBe(200);
    expect(today.out).toBe(100);
    expect(today.cacheWrite).toBe(40);
    expect(today.cacheRead).toBe(2000);
    expect(byModel['claude-opus-5'].in).toBe(200);
  });

  test('foldInto drops entries outside the window instead of misfiling them', () => {
    const days = emptyDays(NOW, 7);
    const byModel: SeatUsage['byModel'] = {};
    foldInto(days, byModel, { ...parseClaudeLine(claudeLine())!, ts: '2026-08-01T00:00:00.000Z' });
    expect(totalBurn(days)).toBe(0);
    expect(Object.keys(byModel)).toHaveLength(0);
  });

  test('burn counts fresh tokens, not cache reads', () => {
    const b = { in: 100, out: 50, cacheWrite: 20, cacheRead: 99999 };
    expect(burnOf(b)).toBe(170);
  });
});

describe('parseCodexLine + codexSessionFold', () => {
  const codexEvent = (totals: Record<string, number>, rateLimits?: unknown, ts = '2026-09-05T12:00:00.000Z') =>
    JSON.stringify({
      timestamp: ts,
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { total_token_usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, total_tokens: 0, ...totals } },
        ...(rateLimits ? { rate_limits: rateLimits } : {}),
      },
    });

  test('reads cumulative totals and optional rate limits from a token_count event', () => {
    const p = parseCodexLine(
      codexEvent(
        { input_tokens: 500, cached_input_tokens: 200, output_tokens: 100 },
        { primary: { used_percent: 12.5, window_minutes: 300, resets_at: 1788274423 }, secondary: { used_percent: 40, window_minutes: 10080, resets_at: 1788274423 } },
      ),
    );
    expect(p!.cumulative).toEqual({ in: 500, cacheRead: 200, out: 100 });
    expect(p!.rateLimits!.weekly!.usedPercent).toBe(40);
    expect(p!.rateLimits!.session!.windowMinutes).toBe(300);
    expect(p!.rateLimits!.weekly!.resetsAt).toBe(new Date(1788274423 * 1000).toISOString());
  });

  test('ignores other event shapes', () => {
    expect(parseCodexLine(JSON.stringify({ type: 'response_item', payload: { type: 'function_call' } }))).toBeNull();
    expect(parseCodexLine('nope')).toBeNull();
  });

  test('codexSessionFold keeps the LAST cumulative totals and the last rate limits seen', () => {
    const fold = codexSessionFold([
      parseCodexLine(codexEvent({ input_tokens: 100, output_tokens: 10 }))!,
      parseCodexLine(codexEvent({ input_tokens: 900, output_tokens: 90 }, { primary: { used_percent: 3, window_minutes: 300, resets_at: 1 }, secondary: { used_percent: 7, window_minutes: 10080, resets_at: 1 } }, '2026-09-05T13:00:00.000Z'))!,
    ]);
    expect(fold.cumulative).toEqual({ in: 900, cacheRead: 0, out: 90 });
    expect(fold.ts).toBe('2026-09-05T13:00:00.000Z');
    expect(fold.rateLimits!.weekly!.usedPercent).toBe(7);
  });
});

function seat(id: string, over: Partial<SeatUsage> = {}): SeatUsage {
  return UsageSnapshotSchema.parse({
    id,
    kind: 'claude',
    label: id,
    source: 'local',
    capturedAt: NOW.toISOString(),
    days: emptyDays(NOW, 7),
    byModel: {},
    lastActivity: null,
    official: null,
    ...over,
  });
}

describe('seatVerdict', () => {
  test('prefers official weekly percentages when both seats have them', () => {
    const a = seat('claude-macbook', { official: { weekly: { usedPercent: 80, windowMinutes: 10080, resetsAt: null } } });
    const b = seat('claude-mini', { official: { weekly: { usedPercent: 20, windowMinutes: 10080, resetsAt: null } } });
    const v = seatVerdict([a, b], NOW);
    expect(v.recommend).toBe('claude-mini');
    expect(v.reason).toMatch(/official/i);
  });

  test('falls back to comparing local burn when no official numbers exist', () => {
    const hot = seat('claude-macbook');
    hot.days[6].in = 5_000_000;
    const cold = seat('claude-mini', { source: 'push' });
    cold.days[6].in = 1_000;
    const v = seatVerdict([hot, cold], NOW);
    expect(v.recommend).toBe('claude-mini');
    expect(v.reason).toMatch(/burn/i);
  });

  test('refuses to recommend on one-sided data, and says which side is missing', () => {
    const only = seat('claude-macbook');
    only.days[6].in = 10;
    const silent = seat('claude-mini', { source: 'push' });
    const v = seatVerdict([only, silent], NOW);
    expect(v.recommend).toBeNull();
    expect(v.reason).toMatch(/claude-mini/);
  });

  test('a stale pushed snapshot does not win a comparison it is not part of', () => {
    const fresh = seat('claude-macbook');
    fresh.days[6].in = 5_000_000;
    const stale = seat('claude-mini', {
      source: 'push',
      capturedAt: new Date(NOW.getTime() - 48 * 3600_000).toISOString(),
    });
    const v = seatVerdict([fresh, stale], NOW);
    expect(v.recommend).toBeNull();
    expect(v.reason).toMatch(/stale/i);
  });
});

describe('usage snapshots repo', () => {
  test('round-trips a pushed snapshot through SQLite with validation on the way out', () => {
    const db = openDb(':memory:');
    const snap = seat('claude-mini', { source: 'push' });
    db.usageSnapshots.upsert(snap);
    db.usageSnapshots.upsert({ ...snap, lastActivity: '2026-09-05T10:00:00.000Z' }); // upsert replaces
    const all = db.usageSnapshots.all();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('claude-mini');
    expect(all[0].lastActivity).toBe('2026-09-05T10:00:00.000Z');
  });

  test('rejects malformed rows instead of serving them', () => {
    expect(() => UsageSnapshotSchema.parse({ id: 'x' })).toThrow();
  });
});
