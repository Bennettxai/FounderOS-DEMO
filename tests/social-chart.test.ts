import { describe, expect, test } from 'vitest';
import { followerBarModel, pieSlices } from '@/lib/social-chart';

const series = (counts: number[]): { date: string; followers: number }[] =>
  counts.map((followers, i) => ({ date: `2026-07-${String(i + 1).padStart(2, '0')}`, followers }));

describe('followerBarModel — bar-diagram geometry for follower history', () => {
  test('one bar per snapshot, heights normalized into (0, 1]', () => {
    const m = followerBarModel(series([100, 120, 140, 160]));
    expect(m.bars).toHaveLength(4);
    for (const b of m.bars) {
      expect(b.h).toBeGreaterThan(0);
      expect(b.h).toBeLessThanOrEqual(1);
    }
    // growth reads visibly: the newest bar is the tallest
    expect(m.bars[3].h).toBe(1);
    expect(m.bars[0].h).toBeLessThan(m.bars[3].h);
  });

  test('per-bar change vs previous drives the delta sign', () => {
    const m = followerBarModel(series([100, 150, 130]));
    expect(m.bars.map((b) => b.delta)).toEqual([null, 50, -20]);
  });

  test('flat history still renders visible bars (no divide-by-zero collapse)', () => {
    const m = followerBarModel(series([500, 500, 500]));
    for (const b of m.bars) {
      expect(Number.isFinite(b.h)).toBe(true);
      expect(b.h).toBeGreaterThan(0);
    }
  });

  test('y ticks span the data with round-ish values, oldest→newest x labels thin out', () => {
    const m = followerBarModel(series(Array.from({ length: 30 }, (_, i) => 1000 + i * 13)));
    expect(m.yTicks.length).toBeGreaterThanOrEqual(3);
    expect(Math.min(...m.yTicks)).toBeLessThanOrEqual(1000);
    expect(Math.max(...m.yTicks)).toBeGreaterThanOrEqual(1000 + 29 * 13);
    const labeled = m.bars.filter((b) => b.xLabel !== null);
    expect(labeled.length).toBeGreaterThan(2);
    expect(labeled.length).toBeLessThanOrEqual(10);
  });

  test('empty series yields an empty, well-formed model', () => {
    const m = followerBarModel([]);
    expect(m.bars).toEqual([]);
    expect(m.yTicks).toEqual([]);
  });
});

describe('pieSlices — audience share geometry', () => {
  const items = [
    { key: 'instagram', label: 'Instagram', value: 50000 },
    { key: 'tiktok', label: 'TikTok', value: 30000 },
    { key: 'email', label: 'Email list', value: 20000 },
  ];

  test('slices cover the full circle in order, shares sum to 1', () => {
    const slices = pieSlices(items);
    expect(slices).toHaveLength(3);
    expect(slices[0].startAngle).toBe(-90);
    expect(slices.at(-1)!.endAngle).toBeCloseTo(270, 5);
    for (let i = 1; i < slices.length; i++) expect(slices[i].startAngle).toBeCloseTo(slices[i - 1].endAngle, 5);
    expect(slices.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 5);
    expect(slices[0].share).toBeCloseTo(0.5, 5);
  });

  test('null and zero values drop out instead of rendering empty slivers', () => {
    const slices = pieSlices([...items, { key: 'x', label: 'X', value: 0 }, { key: 'yt', label: 'YouTube', value: null }]);
    expect(slices.map((s) => s.key)).toEqual(['instagram', 'tiktok', 'email']);
  });

  test('nothing to chart yields no slices', () => {
    expect(pieSlices([])).toEqual([]);
    expect(pieSlices([{ key: 'a', label: 'A', value: null }])).toEqual([]);
  });
});
