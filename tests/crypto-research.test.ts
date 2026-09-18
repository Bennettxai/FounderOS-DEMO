import { describe, expect, test } from 'vitest';
import type { Candle } from '@/lib/crypto-candles';
import type { Trade } from '@/lib/crypto-backtest';
import { expandGrid, monteCarloDrawdown, buyAndHoldPct, fmtPct } from '@/lib/crypto-research';

const bar = (time: number, c: number): Candle => ({ time, open: c, high: c + 1, low: c - 1, close: c, volume: 1 });
const trade = (pnlUsd: number, i: number): Trade => ({
  symbol: 'X', entryIdx: i, exitIdx: i + 1, entryTime: i, exitTime: i + 1, entryPx: 100, exitPx: 100 + pnlUsd,
  qty: 1, notionalUsd: 100, pnlUsd, pnlPct: pnlUsd / 100, reason: 'end', bars: 1,
});

describe('expandGrid', () => {
  test('produces the cartesian product of every listed value over a base', () => {
    const out = expandGrid({ a: 1, b: 'x', c: true }, { a: [1, 2], b: ['x', 'y'] });
    expect(out).toHaveLength(4);
    expect(out).toContainEqual({ a: 2, b: 'y', c: true });
    expect(out.every((p) => p.c === true)).toBe(true);
  });
});

describe('monteCarloDrawdown', () => {
  test('reshuffling the trade order gives a drawdown distribution at least as bad as the observed path at the 95th percentile', () => {
    const trades = [10, -8, 12, -9, 11, -10, 9, -7].map(trade);
    const mc = monteCarloDrawdown(trades, 100, 500, 1);
    expect(mc.samples).toBe(500);
    expect(mc.medianMaxDdPct).toBeGreaterThan(0);
    expect(mc.p95MaxDdPct).toBeGreaterThanOrEqual(mc.medianMaxDdPct);
    // worst case is every loser first: 100 → 66, dd = 34%
    expect(mc.worstMaxDdPct).toBeLessThanOrEqual(34 + 1e-9);
  });
  test('no trades means no drawdown', () => {
    expect(monteCarloDrawdown([], 100, 10, 1).p95MaxDdPct).toBe(0);
  });
});

describe('buyAndHoldPct', () => {
  test('is the close-to-close return over the index range, net of one round trip', () => {
    const candles = [bar(0, 100), bar(1, 105), bar(2, 120), bar(3, 110)];
    expect(buyAndHoldPct(candles, 1, 4, 0)).toBeCloseTo((110 / 105 - 1) * 100);
    expect(buyAndHoldPct(candles, 1, 4, 1)).toBeCloseTo((110 / 105 - 1) * 100 - 1);
  });
});

describe('fmtPct', () => {
  test('one decimal with an explicit sign', () => {
    expect(fmtPct(3.456)).toBe('+3.5%');
    expect(fmtPct(-0.04)).toBe('-0.0%');
  });
});
