import { describe, expect, test } from 'vitest';
import { sma, ema, rsi, atr, bollinger, donchian, adx, macd, rollingVwap, slope } from '@/lib/crypto-indicators';
import type { Candle } from '@/lib/crypto-candles';

/**
 * Every indicator is checked against a value computed by hand (or by the
 * textbook definition), because a wrong indicator does not crash: it trades.
 * All series are index-aligned with the input and NaN before warm-up.
 */

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

const bar = (o: number, h: number, l: number, c: number, v = 1, i = 0): Candle => ({
  time: i * 900, open: o, high: h, low: l, close: c, volume: v,
});
const fromCloses = (closes: number[]): Candle[] =>
  closes.map((c, i) => bar(c, c + 1, c - 1, c, 1, i));

describe('sma / ema', () => {
  test('sma(3) of 1..5 is NaN,NaN,2,3,4', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([NaN, NaN, 2, 3, 4]);
  });
  test('ema(3) seeds with the sma and then applies k=2/(n+1)', () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out.slice(0, 2)).toEqual([NaN, NaN]);
    expect(out[2]).toBe(2);
    expect(near(out[3], 2 + (4 - 2) * 0.5)).toBe(true);
    expect(near(out[4], 3 + (5 - 3) * 0.5)).toBe(true);
  });
});

describe('rsi', () => {
  test('a series that only rises reads 100, one that only falls reads 0', () => {
    const up = rsi([1, 2, 3, 4, 5, 6, 7, 8], 3);
    expect(up[7]).toBe(100);
    const down = rsi([8, 7, 6, 5, 4, 3, 2, 1], 3);
    expect(down[7]).toBe(0);
  });
  test('Wilder smoothing: a flat tail freezes the ratio instead of drifting', () => {
    // Textbook Wilder RSI decays gains and losses at the same rate, so a flat
    // tail keeps the last RS ratio. It must not drift toward 50 (that would be
    // a cutoff-window RSI) and must not blow up when both averages shrink.
    const out = rsi([1, 2, 1, 2, 1, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2], 3);
    expect(out[3]).toBeCloseTo(66.667, 2); // avg gain 2/3, avg loss 1/3
    expect(out[29]).toBeCloseTo(out[7], 6);
    expect(out[29]).toBeGreaterThan(0);
    expect(out[29]).toBeLessThan(100);
  });
});

describe('atr', () => {
  test('true range uses the previous close; ATR is the Wilder average', () => {
    const candles = [bar(10, 11, 9, 10, 1, 0), bar(10, 12, 10, 12, 1, 1), bar(12, 12, 8, 9, 1, 2), bar(9, 10, 9, 10, 1, 3)];
    const out = atr(candles, 2);
    // TR: [2, 2, 4, 1]; first ATR at index 1 = mean(TR[0..1]) = 2; then Wilder: (2*1+4)/2 = 3; (3*1+1)/2 = 2
    expect(out[0]).toBeNaN();
    expect(out[1]).toBe(2);
    expect(out[2]).toBe(3);
    expect(out[3]).toBe(2);
  });
});

describe('bollinger / donchian', () => {
  test('bollinger returns mid, upper and lower with a population stdev', () => {
    const { mid, upper, lower } = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);
    expect(mid[7]).toBe(5);
    expect(upper[7]).toBe(9);
    expect(lower[7]).toBe(1);
  });
  test('donchian reports the prior N-bar high and low, excluding the current bar', () => {
    const candles = [bar(1, 5, 1, 3, 1, 0), bar(3, 7, 2, 4, 1, 1), bar(4, 6, 3, 5, 1, 2)];
    const { upper, lower } = donchian(candles, 2);
    expect(upper[2]).toBe(7);
    expect(lower[2]).toBe(1);
    expect(upper[1]).toBeNaN();
  });
});

describe('adx', () => {
  test('a clean straight-line uptrend produces a high ADX and +DI over -DI', () => {
    const candles = Array.from({ length: 60 }, (_, i) => bar(100 + i, 101 + i, 99.5 + i, 100.5 + i, 1, i));
    const { adx: a, plusDi, minusDi } = adx(candles, 14);
    expect(a[59]).toBeGreaterThan(50);
    expect(plusDi[59]).toBeGreaterThan(minusDi[59]);
  });
});

describe('macd', () => {
  test('macd line is fast ema minus slow ema; histogram is line minus signal', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const { line, signal, hist } = macd(closes, 12, 26, 9);
    const f = ema(closes, 12), s = ema(closes, 26);
    expect(near(line[59], f[59] - s[59])).toBe(true);
    expect(near(hist[59], line[59] - signal[59])).toBe(true);
  });
});

describe('rollingVwap / slope', () => {
  test('rolling vwap weights typical price by volume over the window', () => {
    const candles = [bar(1, 3, 1, 2, 10, 0), bar(2, 6, 2, 4, 30, 1)];
    const out = rollingVwap(candles, 2);
    // typical: (3+1+2)/3=2, (6+2+4)/3=4 → (2*10 + 4*30)/40 = 3.5
    expect(out[1]).toBeCloseTo(3.5);
  });
  test('slope is the change over n bars as a fraction of the older value', () => {
    expect(slope([100, 101, 102, 103], 3)[3]).toBeCloseTo(0.03);
  });
});

describe('warm-up alignment', () => {
  test('every series has the same length as its input', () => {
    const candles = fromCloses(Array.from({ length: 40 }, (_, i) => 50 + (i % 7)));
    const closes = candles.map((c) => c.close);
    expect(sma(closes, 5)).toHaveLength(40);
    expect(rsi(closes, 14)).toHaveLength(40);
    expect(atr(candles, 14)).toHaveLength(40);
    expect(adx(candles, 14).adx).toHaveLength(40);
  });
});
