import { describe, expect, test } from 'vitest';
import { agentRunVolume, runsWithin } from '@/lib/analytics';

const runs = [
  { startedAt: '2026-06-13T11:22:53.404Z' },
  { startedAt: '2026-06-13T11:22:52.480Z' },
  { startedAt: '2026-06-13T09:00:00.000Z' },
  { startedAt: '2026-06-10T08:00:00.000Z' },
  { startedAt: '2026-05-20T08:00:00.000Z' }, // outside a 14-day window ending 06-14
];

describe('agentRunVolume', () => {
  test('returns one bucket per day for the trailing window, ending on endDate', () => {
    const v = agentRunVolume(runs, '2026-06-14', 14);
    expect(v).toHaveLength(14);
    expect(v[0].date).toBe('2026-06-01');
    expect(v[13].date).toBe('2026-06-14');
  });

  test('counts runs by their started-at calendar day', () => {
    const v = agentRunVolume(runs, '2026-06-14', 14);
    const byDate = Object.fromEntries(v.map((p) => [p.date, p.count]));
    expect(byDate['2026-06-13']).toBe(3);
    expect(byDate['2026-06-10']).toBe(1);
    expect(byDate['2026-06-14']).toBe(0);
  });

  test('ignores runs that fall outside the window', () => {
    const v = agentRunVolume(runs, '2026-06-14', 14);
    const total = v.reduce((s, p) => s + p.count, 0);
    expect(total).toBe(4); // the 05-20 run is excluded
  });

  test('empty log yields an all-zero series of the right length', () => {
    const v = agentRunVolume([], '2026-06-14', 7);
    expect(v).toHaveLength(7);
    expect(v.every((p) => p.count === 0)).toBe(true);
  });
});

describe('runsWithin', () => {
  test('counts runs on or after the cutoff (inclusive of endDate day)', () => {
    expect(runsWithin(runs, '2026-06-14', 7)).toBe(4); // three on 06-13 + one on 06-10
    expect(runsWithin(runs, '2026-06-14', 14)).toBe(4);
    expect(runsWithin(runs, '2026-06-14', 60)).toBe(5);
  });
});

/**
 * Mock 5i polish (the operator, 2026-09-07): the run-volume card grows the 7d/14d/30d
 * range chips, hoverable per-day bars, and the "hover a day / today" footer from
 * the mock. Interactivity means a client component: the server page hands it the
 * real 30-day run log and the card slices per range.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('/analytics mock-5i run-volume card', () => {
  const card = read('components/RunVolumeCard.tsx');
  const page = read('app/analytics/page.tsx');

  test('the card is a client component with 7d / 14d / 30d range chips, 14d default', () => {
    expect(card).toContain("'use client'");
    expect(card).toMatch(/from '@\/components\/Pressable'/);
    // chips render {r}d over the ranges array, so pin the array + template
    expect(card).toMatch(/RANGES[^=]*= \[7, 14, 30\]/);
    expect(card).toMatch(/\{r\}d/);
    expect(card).toMatch(/useState[^;]*14/);
  });

  test('per-day bars respond to hover and zero days keep an honest stub', () => {
    expect(card).toMatch(/setHovered/);
    expect(card).toMatch(/Math\.max\(2,/);
  });

  test('the footer reads first day / hover a day / today', () => {
    expect(card).toMatch(/hover a day/);
    expect(card).toMatch(/today/);
  });

  test('the page feeds the card the real 30-day run log and retires the inline chart', () => {
    expect(page).toContain('RunVolumeCard');
    expect(page).toMatch(/agentRunVolume\(runs, today, 30\)/);
    expect(page).not.toContain('RunVolumeChart');
    expect(page).not.toContain('runs7d'); // computed and never used
  });
});
