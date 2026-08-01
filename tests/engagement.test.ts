import { describe, expect, test } from 'vitest';
import { likeToViewRatio, averageLikeToView, formatRatioPct } from '@/lib/engagement';

describe('likeToViewRatio', () => {
  test('returns likes/views as a percentage', () => {
    expect(likeToViewRatio(1104, 12400)).toBeCloseTo(8.903, 2);
    expect(likeToViewRatio(50, 100)).toBe(50);
  });

  test('null when views is zero or negative (never divide by zero / fake a number)', () => {
    expect(likeToViewRatio(10, 0)).toBeNull();
    expect(likeToViewRatio(10, -5)).toBeNull();
  });

  test('null on non-finite input', () => {
    expect(likeToViewRatio(NaN, 100)).toBeNull();
    expect(likeToViewRatio(10, Infinity)).toBeNull();
  });
});

describe('averageLikeToView', () => {
  test('averages the ratio across posts that have positive views', () => {
    const avg = averageLikeToView([
      { likes: 50, views: 100 }, // 50%
      { likes: 10, views: 100 }, // 10%
    ]);
    expect(avg).toBe(30);
  });

  test('skips posts with no views, averages the rest', () => {
    const avg = averageLikeToView([
      { likes: 50, views: 100 }, // 50%
      { likes: 5, views: 0 }, // skipped
    ]);
    expect(avg).toBe(50);
  });

  test('null when no post has a usable ratio', () => {
    expect(averageLikeToView([])).toBeNull();
    expect(averageLikeToView([{ likes: 1, views: 0 }])).toBeNull();
  });
});

describe('formatRatioPct', () => {
  test('one decimal place with a percent sign', () => {
    expect(formatRatioPct(8.903)).toBe('8.9%');
    expect(formatRatioPct(50)).toBe('50.0%');
  });

  test('em dash for null', () => {
    expect(formatRatioPct(null)).toBe('—');
  });
});
