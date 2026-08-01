import { describe, expect, test } from 'vitest';
import { growthOver, growthAllTime, windowDelta, mergeSeriesSum, type GrowthPoint } from '@/lib/growth';

const pt = (capturedAt: string, value: number): GrowthPoint => ({ capturedAt, value });

describe('growth math (generic series)', () => {
  test('growthOver returns null without two points', () => {
    expect(growthOver([], 30)).toBeNull();
    expect(growthOver([pt('2026-06-12', 100)], 30)).toBeNull();
  });

  test('growthOver compares latest to the baseline at/before the window start', () => {
    const series = [
      pt('2026-05-13', 200),
      pt('2026-05-27', 230),
      pt('2026-06-12', 250),
    ];
    // 30d window from 2026-06-12 starts 2026-05-13 → baseline 200 → +25%
    expect(growthOver(series, 30)).toBeCloseTo(25, 5);
  });

  test('growthOver is null when history does not reach back to the window', () => {
    const series = [pt('2026-06-10', 100), pt('2026-06-12', 110)];
    expect(growthOver(series, 30)).toBeNull();
  });

  test('growthOver never divides by a zero baseline', () => {
    const series = [pt('2026-05-01', 0), pt('2026-06-12', 50)];
    expect(growthOver(series, 30)).toBeNull();
  });

  test('growthAllTime spans first to last', () => {
    const series = [pt('2026-04-01', 100), pt('2026-05-01', 120), pt('2026-06-01', 150)];
    expect(growthAllTime(series)).toBeCloseTo(50, 5);
  });

  test('windowDelta returns the current and baseline values for aggregation', () => {
    const series = [pt('2026-05-13', 28000), pt('2026-06-12', 30000)];
    expect(windowDelta(series, 30)).toEqual({ current: 30000, baseline: 28000 });
  });

  test('windowDelta is null when no baseline reaches the window', () => {
    expect(windowDelta([pt('2026-06-12', 30000)], 30)).toBeNull();
  });

  test('growthOver supports a 60-day window boundary', () => {
    const series = [
      pt('2026-04-13', 1000), // exactly 60 days before 2026-06-12
      pt('2026-05-20', 1100),
      pt('2026-06-12', 1300),
    ];
    // 60d window from 2026-06-12 starts 2026-04-13 → baseline 1000 → +30%
    expect(growthOver(series, 60)).toBeCloseTo(30, 5);
    // a snapshot one day too late doesn't reach the 60-day window
    expect(growthOver([pt('2026-04-14', 1000), pt('2026-06-12', 1300)], 60)).toBeNull();
  });
});

describe('mergeSeriesSum (carry-forward aggregation)', () => {
  test('sums channels across the union of dates, carrying each forward', () => {
    const a = [pt('2026-06-01', 100), pt('2026-06-10', 120)];
    const b = [pt('2026-06-05', 50)];
    const merged = mergeSeriesSum([a, b]);
    expect(merged).toEqual([
      { capturedAt: '2026-06-01', value: 100 }, // only a has a value yet
      { capturedAt: '2026-06-05', value: 150 }, // a(100, carried) + b(50)
      { capturedAt: '2026-06-10', value: 170 }, // a(120) + b(50, carried)
    ]);
  });

  test('the latest merged value equals the sum of each channel’s latest', () => {
    const a = [pt('2026-05-01', 40000), pt('2026-06-12', 42000)];
    const b = [pt('2026-06-12', 30000)];
    const merged = mergeSeriesSum([a, b]);
    expect(merged.at(-1)).toEqual({ capturedAt: '2026-06-12', value: 72000 });
  });

  test('handles empty input', () => {
    expect(mergeSeriesSum([])).toEqual([]);
    expect(mergeSeriesSum([[], []])).toEqual([]);
  });
});
