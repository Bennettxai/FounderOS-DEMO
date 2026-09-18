import { describe, expect, test } from 'vitest';
import type { Candle } from '@/lib/crypto-candles';
import { MONDAY_OFFSET_SEC, parseStooqCsv, parseYahooChart, resampleCalendar } from '@/lib/etf-candles';

describe('parseStooqCsv', () => {
  const csv = [
    'Date,Open,High,Low,Close,Volume',
    '2024-01-02,472.16,473.67,470.49,472.65,123488300',
    '2024-01-03,470.43,471.19,468.17,468.79,103585900',
    'bad,row,here,x,y,z',
    '2024-01-04,468.30,470.96,467.05,467.28,84232200',
  ].join('\n');

  test('parses rows to candles with UTC-midnight unix times, ascending, skipping junk', () => {
    const out = parseStooqCsv(csv);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({
      time: Date.UTC(2024, 0, 2) / 1000,
      open: 472.16, high: 473.67, low: 470.49, close: 472.65, volume: 123488300,
    });
    expect(out.map((c) => c.time)).toEqual([...out.map((c) => c.time)].sort((a, b) => a - b));
  });

  test('an empty or header-only file parses to no candles', () => {
    expect(parseStooqCsv('')).toEqual([]);
    expect(parseStooqCsv('Date,Open,High,Low,Close,Volume\n')).toEqual([]);
  });
});

describe('parseYahooChart', () => {
  const payload = {
    chart: {
      result: [{
        timestamp: [1704205800, 1704209400, 1704213000],
        indicators: {
          quote: [{
            open: [472.1, 471.5, null],
            high: [472.9, 472.0, 471.0],
            low: [471.8, 470.9, 470.2],
            close: [472.5, 471.1, 470.6],
            volume: [1000, 2000, 3000],
          }],
        },
      }],
    },
  };

  test('maps timestamps and quote arrays to candles, skipping bars with null fields', () => {
    const out = parseYahooChart(payload);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ time: 1704205800, open: 472.1, high: 472.9, low: 471.8, close: 472.5, volume: 1000 });
    expect(out[1].time).toBe(1704209400);
  });

  test('a malformed payload parses to no candles instead of throwing', () => {
    expect(parseYahooChart({})).toEqual([]);
    expect(parseYahooChart({ chart: { result: [] } })).toEqual([]);
    expect(parseYahooChart(null)).toEqual([]);
  });
});

describe('resampleCalendar', () => {
  const day = 86400;
  const bar = (time: number, o: number, h: number, l: number, c: number, v: number): Candle => ({ time, open: o, high: h, low: l, close: c, volume: v });
  // Two trading weeks starting Mon 2024-01-08 UTC; the second week is short (holiday).
  const mon1 = Date.UTC(2024, 0, 8) / 1000;
  const mon2 = Date.UTC(2024, 0, 15) / 1000;
  const daily = [
    bar(mon1 + 0 * day, 10, 12, 9, 11, 100),
    bar(mon1 + 1 * day, 11, 13, 10, 12, 100),
    bar(mon1 + 2 * day, 12, 14, 11, 13, 100),
    bar(mon1 + 3 * day, 13, 15, 12, 14, 100),
    bar(mon1 + 4 * day, 14, 16, 13, 15, 100),
    // Short week: Tue-Fri only.
    bar(mon2 + 1 * day, 15, 17, 14, 16, 100),
    bar(mon2 + 2 * day, 16, 18, 15, 17, 100),
    bar(mon2 + 3 * day, 17, 19, 16, 18, 100),
    bar(mon2 + 4 * day, 18, 20, 17, 19, 100),
  ];

  // Epoch weeks anchor on Thursday; MONDAY_OFFSET_SEC shifts buckets to trading weeks.
  test('weekly buckets keep partial (holiday) weeks, unlike the strict resample', () => {
    const weekly = resampleCalendar(daily, 7 * day, MONDAY_OFFSET_SEC);
    expect(weekly).toHaveLength(2);
    expect(weekly[0].open).toBe(10);
    expect(weekly[0].high).toBe(16);
    expect(weekly[0].low).toBe(9);
    expect(weekly[0].close).toBe(15);
    expect(weekly[0].volume).toBe(500);
    expect(weekly[1].open).toBe(15);
    expect(weekly[1].close).toBe(19);
    expect(weekly[1].volume).toBe(400);
  });

  test('bucket times are floored to Monday so alignHtf sees a fixed close time', () => {
    const weekly = resampleCalendar(daily, 7 * day, MONDAY_OFFSET_SEC);
    expect(weekly[0].time).toBe(mon1);
    for (const w of weekly) expect((w.time - MONDAY_OFFSET_SEC) % (7 * day)).toBe(0);
  });

  test('hourly session bars fold into one daily bar per session', () => {
    const h = 3600;
    // A 7-bar RTH session starting 14:30 UTC.
    const sessionStart = Date.UTC(2024, 0, 8, 14, 30) / 1000;
    const hourly = Array.from({ length: 7 }, (_, i) => bar(sessionStart + i * h, 100 + i, 101 + i, 99 + i, 100.5 + i, 10));
    const dailyOut = resampleCalendar(hourly, day);
    expect(dailyOut).toHaveLength(1);
    expect(dailyOut[0].open).toBe(100);
    expect(dailyOut[0].close).toBe(106.5);
    expect(dailyOut[0].volume).toBe(70);
  });

  test('fewer than one bar returns nothing', () => {
    expect(resampleCalendar([], 7 * day)).toEqual([]);
  });
});
