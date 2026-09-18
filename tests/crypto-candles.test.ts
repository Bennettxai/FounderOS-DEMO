import { describe, expect, test } from 'vitest';
import {
  parseCoinbaseRows,
  parseCandleCsv,
  toCsv,
  resample,
  fetchCoinbaseCandles,
  type Candle,
} from '@/lib/crypto-candles';

/**
 * Candles are the only input the crypto strategy ever sees, in the backtest
 * and live, so the loader has to be exact: one malformed bar and every signal
 * downstream is wrong without anyone noticing.
 */

const c = (t: number, o: number, h: number, l: number, cl: number, v = 1): Candle => ({
  time: t, open: o, high: h, low: l, close: cl, volume: v,
});

describe('parseCoinbaseRows', () => {
  test('maps Coinbase [time, low, high, open, close, volume] rows and sorts ascending', () => {
    const rows = [
      [1800, 9, 12, 10, 11, 5],
      [900, 8, 11, 9, 10, 4],
    ];
    expect(parseCoinbaseRows(rows)).toEqual([c(900, 9, 11, 8, 10, 4), c(1800, 10, 12, 9, 11, 5)]);
  });

  test('drops duplicate timestamps and rows that are not six finite numbers', () => {
    const rows = [[900, 8, 11, 9, 10, 4], [900, 8, 11, 9, 10, 4], [1800, 'x', 1, 1, 1, 1], [2700, 1, 2]];
    expect(parseCoinbaseRows(rows as number[][])).toEqual([c(900, 9, 11, 8, 10, 4)]);
  });
});

describe('csv round trip', () => {
  test('toCsv then parseCandleCsv is the identity', () => {
    const candles = [c(900, 1, 2, 0.5, 1.5, 10), c(1800, 1.5, 3, 1, 2, 12)];
    expect(parseCandleCsv(toCsv(candles))).toEqual(candles);
  });

  test('parseCandleCsv ignores blank lines and a header row', () => {
    const csv = 'time,open,high,low,close,volume\n900,1,2,0.5,1.5,10\n\n';
    expect(parseCandleCsv(csv)).toEqual([c(900, 1, 2, 0.5, 1.5, 10)]);
  });
});

describe('resample', () => {
  test('folds four 15m bars into one 1h bar aligned to the hour', () => {
    const base = 3600 * 100; // an exact hour boundary
    const bars = [
      c(base, 10, 12, 9, 11, 1),
      c(base + 900, 11, 15, 10, 14, 2),
      c(base + 1800, 14, 14, 8, 9, 3),
      c(base + 2700, 9, 10, 8.5, 9.5, 4),
    ];
    expect(resample(bars, 3600)).toEqual([c(base, 10, 15, 8, 9.5, 10)]);
  });

  test('an incomplete trailing bucket is dropped, never emitted half-formed', () => {
    const base = 3600 * 100;
    const bars = [
      c(base, 10, 12, 9, 11, 1), c(base + 900, 11, 15, 10, 14, 2),
      c(base + 1800, 14, 14, 8, 9, 3), c(base + 2700, 9, 10, 8.5, 9.5, 4),
      c(base + 3600, 9.5, 11, 9, 10, 1),
    ];
    expect(resample(bars, 3600)).toHaveLength(1);
  });

  test('a bucket with a missing 15m bar is dropped too', () => {
    const base = 3600 * 100;
    const bars = [c(base, 10, 12, 9, 11, 1), c(base + 900, 11, 15, 10, 14, 2), c(base + 2700, 9, 10, 8.5, 9.5, 4)];
    expect(resample(bars, 3600)).toEqual([]);
  });
});

describe('fetchCoinbaseCandles', () => {
  test('pages backwards 300 bars at a time and returns one ascending, de-duplicated series', async () => {
    const calls: string[] = [];
    const doFetch = (async (url: string) => {
      calls.push(url);
      const u = new URL(url);
      const start = Math.floor(Date.parse(u.searchParams.get('start')!) / 1000);
      const end = Math.floor(Date.parse(u.searchParams.get('end')!) / 1000);
      const rows: number[][] = [];
      for (let t = end; t >= start; t -= 900) rows.push([t, 1, 2, 1, 1.5, 1]);
      return { ok: true, status: 200, json: async () => rows } as Response;
    }) as unknown as typeof fetch;
    const end = 3600 * 1000;
    const start = end - 600 * 900; // 600 bars = 2 pages
    const out = await fetchCoinbaseCandles('SOL-USD', 900, start, end, doFetch);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('/products/SOL-USD/candles?granularity=900');
    expect(out[0].time).toBe(start);
    expect(out[out.length - 1].time).toBe(end);
    expect(new Set(out.map((b) => b.time)).size).toBe(out.length);
  });

  test('a non-OK page throws instead of returning a series with a hole in it', async () => {
    const doFetch = (async () => ({ ok: false, status: 429, json: async () => [] })) as unknown as typeof fetch;
    await expect(fetchCoinbaseCandles('SOL-USD', 900, 0, 900 * 10, doFetch, { retries: 0 })).rejects.toThrow(/429/);
  });
});
