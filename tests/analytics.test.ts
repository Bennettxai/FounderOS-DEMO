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
