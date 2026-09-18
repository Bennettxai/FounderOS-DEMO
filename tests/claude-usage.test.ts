import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { newScanCache, scanClaudeProjects } from '@/lib/connectors/claude-usage';
import { codexSeat } from '@/lib/connectors/codex-usage';

const NOW = new Date('2026-09-05T15:00:00.000Z');

const aline = (ts: string, tokens = 100) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: ts,
    message: { model: 'claude-opus-5', usage: { input_tokens: tokens, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 5 } },
  }) + '\n';
const noise = () => JSON.stringify({ type: 'user', timestamp: '2026-09-05T13:00:00.000Z', message: {} }) + '\n';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-test-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('scanClaudeProjects', () => {
  test('aggregates assistant usage across nested project files', async () => {
    fs.mkdirSync(path.join(dir, 'proj-a'));
    fs.writeFileSync(path.join(dir, 'proj-a', 's1.jsonl'), noise() + aline('2026-09-05T12:00:00.000Z', 100) + aline('2026-09-04T12:00:00.000Z', 200));
    fs.writeFileSync(path.join(dir, 'ignore.txt'), 'not a transcript');
    const cache = newScanCache();
    const seat = await scanClaudeProjects(dir, NOW, cache);
    expect(seat.days.at(-1)!.in).toBe(100);
    expect(seat.days.at(-2)!.in).toBe(200);
    expect(seat.byModel['claude-opus-5'].out).toBe(20);
    expect(seat.lastActivity).toBe('2026-09-05T12:00:00.000Z');
  });

  test('second scan reads only appended bytes and picks up new lines', async () => {
    const f = path.join(dir, 's1.jsonl');
    fs.writeFileSync(f, aline('2026-09-05T12:00:00.000Z', 100));
    const cache = newScanCache();
    await scanClaudeProjects(dir, NOW, cache);
    const offsetAfterFirst = [...cache.files.values()][0].offset;

    fs.appendFileSync(f, aline('2026-09-05T14:00:00.000Z', 50));
    const seat = await scanClaudeProjects(dir, NOW, cache);
    expect(seat.days.at(-1)!.in).toBe(150);
    expect([...cache.files.values()][0].offset).toBeGreaterThan(offsetAfterFirst);
  });

  test('a truncated (rewritten) file is rescanned from zero, not double-counted', async () => {
    const f = path.join(dir, 's1.jsonl');
    fs.writeFileSync(f, aline('2026-09-05T12:00:00.000Z', 100) + aline('2026-09-05T12:01:00.000Z', 100));
    const cache = newScanCache();
    await scanClaudeProjects(dir, NOW, cache);
    fs.writeFileSync(f, aline('2026-09-05T12:00:00.000Z', 30)); // shorter rewrite
    const seat = await scanClaudeProjects(dir, NOW, cache);
    expect(seat.days.at(-1)!.in).toBe(30);
  });

  test('a missing directory is an empty seat with a note, not a crash', async () => {
    const seat = await scanClaudeProjects(path.join(dir, 'nope'), NOW, newScanCache());
    expect(seat.days.every((d) => d.in === 0)).toBe(true);
    expect(seat.note).toMatch(/no transcripts/i);
  });
});

describe('codexSeat', () => {
  const codexLine = (ts: string, totalIn: number, rl = false) =>
    JSON.stringify({
      timestamp: ts,
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { total_token_usage: { input_tokens: totalIn, cached_input_tokens: 0, output_tokens: 5, total_tokens: totalIn + 5 } },
        ...(rl
          ? { rate_limits: { primary: { used_percent: 11, window_minutes: 300, resets_at: 1788274423 }, secondary: { used_percent: 42, window_minutes: 10080, resets_at: 1788274423 } } }
          : {}),
      },
    }) + '\n';

  test('buckets each session by its last event and carries the newest rate limits', async () => {
    const day = path.join(dir, '2026', '09', '05');
    fs.mkdirSync(day, { recursive: true });
    // cumulative counters: 300 is the session total, not 100+200+300
    fs.writeFileSync(path.join(day, 'rollout-a.jsonl'), codexLine('2026-09-05T10:00:00.000Z', 100) + codexLine('2026-09-05T10:05:00.000Z', 300, true));
    const seat = await codexSeat(dir, NOW);
    expect(seat).not.toBeNull();
    expect(seat!.days.at(-1)!.in).toBe(300);
    expect(seat!.official!.weekly!.usedPercent).toBe(42);
    expect(seat!.official!.session!.usedPercent).toBe(11);
    expect(seat!.capturedAt).toBe('2026-09-05T10:05:00.000Z');
  });

  test('rate limits survive from an older session even when this week is quiet', async () => {
    const day = path.join(dir, '2026', '08', '25');
    fs.mkdirSync(day, { recursive: true });
    fs.writeFileSync(path.join(day, 'rollout-old.jsonl'), codexLine('2026-08-25T10:00:00.000Z', 500, true));
    const seat = await codexSeat(dir, NOW);
    expect(seat!.official!.weekly!.usedPercent).toBe(42);
    expect(seat!.days.every((d) => d.in === 0)).toBe(true); // outside the 7-day window: true, and honest
    expect(seat!.capturedAt).toBe('2026-08-25T10:00:00.000Z');
  });

  test('no sessions directory means no codex lane', async () => {
    expect(await codexSeat(path.join(dir, 'missing'), NOW)).toBeNull();
  });
});

describe('partial final line', () => {
  test('an incomplete trailing line is held back and folded once completed', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-partial-'));
    const f = path.join(d, 's.jsonl');
    const full = aline('2026-09-05T12:00:00.000Z', 100);
    const half = aline('2026-09-05T13:00:00.000Z', 40);
    fs.writeFileSync(f, full + half.slice(0, 50)); // second line cut mid-JSON, no newline
    const cache = newScanCache();
    let seat = await scanClaudeProjects(d, NOW, cache);
    expect(seat.days.at(-1)!.in).toBe(100); // partial not counted, not corrupted

    fs.appendFileSync(f, half.slice(50)); // line completes
    seat = await scanClaudeProjects(d, NOW, cache);
    expect(seat.days.at(-1)!.in).toBe(140); // counted exactly once
    fs.rmSync(d, { recursive: true, force: true });
  });
});

describe('model split windowing', () => {
  test('byModel excludes lines outside the 7-day window even from active files', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-window-'));
    fs.writeFileSync(
      path.join(d, 's.jsonl'),
      aline('2026-08-01T12:00:00.000Z', 9999) + aline('2026-09-05T12:00:00.000Z', 100),
    );
    const seat = await scanClaudeProjects(d, NOW, newScanCache());
    expect(seat.byModel['claude-opus-5'].in).toBe(100); // the 9999 is history, not this week
    fs.rmSync(d, { recursive: true, force: true });
  });
});
