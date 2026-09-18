import { describe, expect, test } from 'vitest';
import type { Candle } from '@/lib/crypto-candles';
import {
  backtest,
  computeMetrics,
  walkForward,
  type Plan,
  type Trade,
} from '@/lib/crypto-backtest';

/**
 * The simulator is the thing that turns "this looks good" into a number, so
 * every fill rule is pinned here: signals fill at the NEXT bar's open (no
 * look-ahead), stops and targets are checked against the bar's high/low with
 * the stop winning ties, costs are charged half on each side, and one position
 * per symbol at a time.
 */

const bar = (i: number, o: number, h: number, l: number, c: number, v = 1): Candle => ({
  time: 1_700_000_000 + i * 900, open: o, high: h, low: l, close: c, volume: v,
});
const flat = (n: number, px = 100) => Array.from({ length: n }, (_, i) => bar(i, px, px, px, px));
const noPlan = (n: number): Plan[] => Array.from({ length: n }, () => ({}));

describe('fills', () => {
  test('an entry signal at bar i fills at bar i+1 open, plus half the round-trip cost', () => {
    const candles = flat(6);
    candles[4] = bar(4, 100, 125, 100, 100);
    const plans = noPlan(6);
    plans[1] = { enter: { stopUsd: 90, targetUsd: 120 } };
    const { trades } = backtest(candles, plans, { costRoundTripPct: 2, startEquityUsd: 600, notionalUsd: 100 });
    expect(trades).toHaveLength(1);
    const t = trades[0];
    expect(t.entryIdx).toBe(2);
    expect(t.entryPx).toBeCloseTo(101); // 100 * (1 + 1%)
    expect(t.exitIdx).toBe(4);
    expect(t.reason).toBe('target');
    expect(t.exitPx).toBeCloseTo(118.8); // 120 * (1 - 1%)
    expect(t.qty).toBeCloseTo(100 / 101);
    expect(t.pnlUsd).toBeCloseTo((118.8 - 101) * (100 / 101));
    expect(t.pnlPct).toBeCloseTo(118.8 / 101 - 1);
  });

  test('when a bar touches both the stop and the target, the stop wins', () => {
    const candles = flat(5);
    candles[3] = bar(3, 100, 130, 85, 100);
    const plans = noPlan(5);
    plans[1] = { enter: { stopUsd: 90, targetUsd: 120 } };
    const { trades } = backtest(candles, plans, { costRoundTripPct: 0, startEquityUsd: 600, notionalUsd: 100 });
    expect(trades[0].reason).toBe('stop');
    expect(trades[0].exitPx).toBe(90);
  });

  test('a gap through the stop fills at the open, not at the stop price', () => {
    const candles = flat(5);
    candles[3] = bar(3, 80, 82, 78, 80);
    const plans = noPlan(5);
    plans[1] = { enter: { stopUsd: 90 } };
    const { trades } = backtest(candles, plans, { costRoundTripPct: 0, startEquityUsd: 600, notionalUsd: 100 });
    expect(trades[0].reason).toBe('stop');
    expect(trades[0].exitPx).toBe(80);
  });

  test('a trailing stop ratchets up from prior highs and never moves down', () => {
    const candles = flat(7);
    candles[3] = bar(3, 100, 110, 100, 108); // trail moves to 110 - 5 = 105
    candles[4] = bar(4, 108, 109, 106, 107); // still above trail; high lower so trail stays 105
    candles[5] = bar(5, 107, 107, 104, 105); // touches 105 → exit
    const plans = noPlan(7);
    plans[1] = { enter: { stopUsd: 90, trailUsd: 5 } };
    const { trades } = backtest(candles, plans, { costRoundTripPct: 0, startEquityUsd: 600, notionalUsd: 100 });
    expect(trades[0].reason).toBe('trail');
    expect(trades[0].exitIdx).toBe(5);
    expect(trades[0].exitPx).toBe(105);
  });

  test('a time stop closes at the close of the bar where the hold reaches maxBars', () => {
    const candles = flat(8);
    candles[5] = bar(5, 100, 101, 99, 103);
    const plans = noPlan(8);
    plans[1] = { enter: { stopUsd: 90, maxBars: 3 } }; // entry idx 2, held bars 3 → exit at idx 5 close
    const { trades } = backtest(candles, plans, { costRoundTripPct: 0, startEquityUsd: 600, notionalUsd: 100 });
    expect(trades[0].reason).toBe('time');
    expect(trades[0].exitIdx).toBe(5);
    expect(trades[0].exitPx).toBe(103);
  });

  test('an exit signal fills at the next open, and a second entry while in a position is ignored', () => {
    const candles = flat(8);
    candles[5] = bar(5, 104, 104, 104, 104);
    const plans = noPlan(8);
    plans[1] = { enter: { stopUsd: 90 } };
    plans[3] = { enter: { stopUsd: 95 } }; // ignored: already long
    plans[4] = { exit: true };
    const { trades } = backtest(candles, plans, { costRoundTripPct: 0, startEquityUsd: 600, notionalUsd: 100 });
    expect(trades).toHaveLength(1);
    expect(trades[0].reason).toBe('signal');
    expect(trades[0].exitIdx).toBe(5);
    expect(trades[0].exitPx).toBe(104);
  });

  test('a position still open at the end of the data is closed at the last close', () => {
    const candles = flat(4);
    candles[3] = bar(3, 100, 100, 100, 99);
    const plans = noPlan(4);
    plans[1] = { enter: { stopUsd: 90 } };
    const { trades } = backtest(candles, plans, { costRoundTripPct: 0, startEquityUsd: 600, notionalUsd: 100 });
    expect(trades[0].reason).toBe('end');
    expect(trades[0].exitPx).toBe(99);
  });

  test('sizePct sizes each trade from current equity, so the curve compounds', () => {
    const candles = flat(9);
    candles[3] = bar(3, 100, 100, 100, 110);
    candles[7] = bar(7, 100, 100, 100, 110);
    const plans = noPlan(9);
    plans[1] = { enter: { stopUsd: 90, maxBars: 1 } };
    plans[5] = { enter: { stopUsd: 90, maxBars: 1 } };
    const { trades, equityCurve } = backtest(candles, plans, { costRoundTripPct: 0, startEquityUsd: 600, sizePct: 50 });
    expect(trades[0].notionalUsd).toBeCloseTo(300);
    expect(trades[0].pnlUsd).toBeCloseTo(30);
    expect(trades[1].notionalUsd).toBeCloseTo(315); // 50% of 630
    expect(equityCurve[equityCurve.length - 1]).toBeCloseTo(661.5);
  });
});

describe('computeMetrics', () => {
  const trade = (pnlUsd: number, notional = 100, entryTime = 0, exitTime = 900): Trade => ({
    symbol: 'BTC-USD', entryIdx: 0, exitIdx: 1, entryTime, exitTime, entryPx: 100, exitPx: 100 + pnlUsd,
    qty: 1, notionalUsd: notional, pnlUsd, pnlPct: pnlUsd / notional, reason: 'target', bars: 1,
  });

  test('win rate, profit factor, net return, expectancy and max drawdown come from the trade list', () => {
    const trades = [trade(10), trade(-5), trade(20), trade(-15), trade(-10)];
    const days = 2;
    const m = computeMetrics(trades, 600, days);
    expect(m.trades).toBe(5);
    expect(m.winRate).toBeCloseTo(0.4);
    expect(m.profitFactor).toBeCloseTo(30 / 30);
    expect(m.netPnlUsd).toBeCloseTo(0);
    expect(m.netReturnPct).toBeCloseTo(0);
    expect(m.avgTradePct).toBeCloseTo(0);
    expect(m.tradesPerDay).toBeCloseTo(2.5);
    // equity path: 610, 605, 625, 610, 600 → peak 625, trough 600 → 4%
    expect(m.maxDrawdownPct).toBeCloseTo(4);
  });

  test('a strategy with no trades reports zeros, not NaN', () => {
    const m = computeMetrics([], 600, 10);
    expect(m.trades).toBe(0);
    expect(m.winRate).toBe(0);
    expect(m.profitFactor).toBe(0);
    expect(m.maxDrawdownPct).toBe(0);
    expect(m.netReturnPct).toBe(0);
  });
});

describe('walkForward', () => {
  // Synthetic tape: each 10-bar block has a jump at bar 5 of the block. The
  // "up" parameter enters just before the jump (profitable); "down" enters
  // right after it and gets stopped (loses). Walk-forward must pick "up" on the
  // in-sample window and only report trades from the out-of-sample windows.
  const candles: Candle[] = [];
  for (let i = 0; i < 100; i++) {
    const inBlock = i % 10;
    const px = inBlock >= 5 ? 110 : 100;
    candles.push(inBlock === 5 ? bar(i, 100, 112, 100, 110) : inBlock === 7 ? bar(i, 110, 110, 95, 100) : bar(i, px, px, px, px));
  }
  const makePlans = (c: Candle[], p: { dir: 'up' | 'down' }): Plan[] =>
    c.map((_, i) => {
      const inBlock = i % 10;
      if (p.dir === 'up' && inBlock === 4) return { enter: { stopUsd: 90, targetUsd: 111 } }; // fills at 5 open 100, target 111 hit on high 112
      if (p.dir === 'down' && inBlock === 6) return { enter: { stopUsd: 105, targetUsd: 130 } }; // fills at 7 open 110, low 95 → stop
      return {};
    });

  test('picks the best in-sample parameters per window and reports only out-of-sample trades', () => {
    const res = walkForward(
      candles,
      [{ dir: 'up' as const }, { dir: 'down' as const }],
      makePlans,
      { costRoundTripPct: 0, startEquityUsd: 600, notionalUsd: 100 },
      { trainBars: 40, testBars: 20 },
    );
    expect(res.windows.map((w) => w.params?.dir)).toEqual(['up', 'up', 'up']);
    expect(res.windows.map((w) => [w.testStartIdx, w.testEndIdx])).toEqual([[40, 60], [60, 80], [80, 100]]);
    expect(res.trades.every((t) => t.entryIdx >= 40)).toBe(true);
    expect(res.trades.every((t) => t.reason === 'target')).toBe(true);
    expect(res.metrics.trades).toBe(6);
    expect(res.metrics.winRate).toBe(1);
  });

  test('a window with no parameter that trades enough falls back to "no trades" instead of a fluke', () => {
    const res = walkForward(
      candles.slice(0, 60),
      [{ dir: 'down' as const }],
      makePlans,
      { costRoundTripPct: 0, startEquityUsd: 600, notionalUsd: 100 },
      { trainBars: 40, testBars: 20, minTrainTrades: 3, minTrainProfitFactor: 1.1 },
    );
    expect(res.windows[0].params).toBeNull();
    expect(res.trades).toHaveLength(0);
  });
});
