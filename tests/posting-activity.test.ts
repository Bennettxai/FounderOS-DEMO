import { describe, it, expect } from 'vitest';
import { dateAxis, bucketPostingByDay, forwardFill, postSeriesFromDays, type PostDay } from '@/lib/posting-activity';

describe('dateAxis', () => {
  it('lists every day inclusive of both ends', () => {
    expect(dateAxis('2026-06-01', '2026-06-04')).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
    ]);
  });

  it('handles month boundaries', () => {
    expect(dateAxis('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
  });

  it('returns a single day when start === end', () => {
    expect(dateAxis('2026-06-19', '2026-06-19')).toEqual(['2026-06-19']);
  });

  it('returns [] when start is after end', () => {
    expect(dateAxis('2026-06-19', '2026-06-18')).toEqual([]);
  });
});

describe('bucketPostingByDay', () => {
  const posts: PostDay[] = [
    { date: '2026-06-02', platforms: ['instagram', 'tiktok', 'youtube'] }, // cross-post
    { date: '2026-06-02', platforms: ['instagram'] },
    { date: '2026-06-04', platforms: ['twitter'] },
    { date: '2026-05-01', platforms: ['instagram'] }, // outside axis -> ignored
  ];
  const axis = dateAxis('2026-06-01', '2026-06-04');

  it('counts each platform of a post, including cross-posts', () => {
    const days = bucketPostingByDay(posts, axis);
    const d2 = days.find((d) => d.date === '2026-06-02')!;
    expect(d2.counts.instagram).toBe(2);
    expect(d2.counts.tiktok).toBe(1);
    expect(d2.counts.youtube).toBe(1);
    expect(d2.total).toBe(4); // 2 ig + 1 tt + 1 yt
  });

  it('emits a row for every axis day, zero when nothing posted', () => {
    const days = bucketPostingByDay(posts, axis);
    expect(days).toHaveLength(4);
    const d3 = days.find((d) => d.date === '2026-06-03')!;
    expect(d3.total).toBe(0);
    expect(d3.counts).toEqual({});
  });

  it('ignores posts whose date is not on the axis', () => {
    const days = bucketPostingByDay(posts, axis);
    expect(days.every((d) => d.date !== '2026-05-01')).toBe(true);
  });
});

describe('postSeriesFromDays', () => {
  const posts: PostDay[] = [
    { date: '2026-06-19', platforms: ['instagram', 'tiktok'] },
    { date: '2026-06-19', platforms: ['instagram'] },
    { date: '2026-06-17', platforms: ['youtube'] },
  ];

  it('emits one series per requested platform over the window with correct totals', () => {
    const s = postSeriesFromDays(posts, '2026-06-19', 5, ['instagram', 'tiktok', 'youtube']);
    expect(s.map((x) => x.key)).toEqual(['instagram', 'tiktok', 'youtube']);
    const ig = s.find((x) => x.key === 'instagram')!;
    expect(ig.points).toHaveLength(5);
    expect(ig.points.at(-1)).toEqual({ date: '2026-06-19', count: 2 });
    expect(ig.total).toBe(2);
    expect(s.find((x) => x.key === 'tiktok')!.total).toBe(1);
    expect(s.find((x) => x.key === 'youtube')!.total).toBe(1);
  });

  it('returns an all-zero series for a platform with no posts in the window', () => {
    const s = postSeriesFromDays(posts, '2026-06-19', 5, ['linkedin']);
    expect(s[0].total).toBe(0);
    expect(s[0].points.every((p) => p.count === 0)).toBe(true);
  });
});

describe('forwardFill', () => {
  const axis = dateAxis('2026-06-01', '2026-06-05');

  it('carries the last known value forward across gaps', () => {
    const filled = forwardFill(
      [
        { date: '2026-06-02', value: 100 },
        { date: '2026-06-04', value: 130 },
      ],
      axis,
    );
    // 06-01 has no prior value -> null; then 100,100,130,130
    expect(filled).toEqual([null, 100, 100, 130, 130]);
  });

  it('is all-null when there are no points', () => {
    expect(forwardFill([], axis)).toEqual([null, null, null, null, null]);
  });

  it('uses the exact value on a matching day', () => {
    const filled = forwardFill([{ date: '2026-06-03', value: 42 }], dateAxis('2026-06-03', '2026-06-03'));
    expect(filled).toEqual([42]);
  });
});
