import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { MetricSnapshotSchema } from '@/lib/schemas';
import { recordOperatingSnapshots, sparkSeries, type MetricInput } from '@/lib/operating-metrics';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

describe('metric_snapshots repo — per-metric history for real sparklines', () => {
  test('records values and returns per-day LAST value, ascending', () => {
    db = openDb(':memory:');
    db.metricSnapshots.record('audience', 100, '2026-07-20T09:00:00Z');
    db.metricSnapshots.record('audience', 105, '2026-07-20T18:00:00Z'); // later same day wins
    db.metricSnapshots.record('audience', 111, '2026-07-21T09:00:00Z');
    db.metricSnapshots.record('stripe', 900, '2026-07-21T09:00:00Z'); // other metric, ignored
    const hist = db.metricSnapshots.history('audience', 7, '2026-07-23');
    expect(hist.map((h) => h.date)).toEqual(['2026-07-20', '2026-07-21']);
    expect(hist.map((h) => h.value)).toEqual([105, 111]);
    for (const h of hist) MetricSnapshotSchema.parse({ metricId: 'audience', capturedAt: h.date, value: h.value });
  });

  test('history window drops points older than N days and re-recording a timestamp overwrites', () => {
    db = openDb(':memory:');
    db.metricSnapshots.record('subs', 1, '2026-07-01T00:00:00Z');
    db.metricSnapshots.record('subs', 50, '2026-07-22T00:00:00Z');
    db.metricSnapshots.record('subs', 51, '2026-07-22T00:00:00Z'); // same instant → overwrite
    const hist = db.metricSnapshots.history('subs', 7, '2026-07-23');
    expect(hist).toEqual([{ date: '2026-07-22', value: 51 }]);
  });
});

describe('recordOperatingSnapshots', () => {
  test('writes every live input, skips honest-pending nulls', () => {
    db = openDb(':memory:');
    const inputs: MetricInput[] = [
      { id: 'audience', label: 'Audience', unit: 'followers', source: 'Zernio', value: 50000 },
      { id: 'stripe', label: 'Stripe', unit: 'usd', source: 'Stripe', value: 2308 },
      { id: 'pipeline', label: 'Pipeline', unit: 'deals', source: 'Attio', value: null },
    ];
    const n = recordOperatingSnapshots(db.metricSnapshots, inputs, '2026-07-23T10:00:00Z');
    expect(n).toBe(2);
    expect(db.metricSnapshots.history('audience', 7, '2026-07-23')).toEqual([
      { date: '2026-07-23', value: 50000 },
    ]);
    expect(db.metricSnapshots.history('pipeline', 7, '2026-07-23')).toEqual([]);
  });
});

describe('sparkSeries — real history when it exists, honest placeholder until then', () => {
  test('two or more history points render as-is', () => {
    expect(sparkSeries([100, 105, 111], 'audience', 111)).toEqual([100, 105, 111]);
  });
  test('thin history falls back to the deterministic placeholder shape', () => {
    const fallback = sparkSeries([], 'audience', 111);
    expect(fallback).toHaveLength(7);
    // deterministic: same id + value → same shape
    expect(sparkSeries([111], 'audience', 111)).toEqual(fallback);
    expect(fallback.every((v) => v >= 0)).toBe(true);
  });
});
