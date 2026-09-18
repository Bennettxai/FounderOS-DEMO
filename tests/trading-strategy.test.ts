import { describe, expect, test } from 'vitest';
import { decideIndexCore, sma, sessionHigh, type StrategyInput } from '@/lib/trading-strategy';
import { DEFAULT_LIMITS } from '@/lib/trading-guardrails';

/**
 * The index-core strategy (2026-09-18), the default decide path of the
 * Markets Agent. Pure: daily closes in, orders and an auditable analysis out.
 * The rules are the ones the OS's own backtests could defend
 * (docs/etf-backtest-2026-09-06.md): sit in the index, buy the gap toward a
 * fixed target, buy dips a little sooner, halve the target when the close is
 * under its 200-day average, never buy through the kill-switch floor. Slow,
 * boring, positive-expectancy. Every order is still vetted by checkOrder.
 */

const up = (n: number, start: number, step = 0.5) => Array.from({ length: n }, (_, i) => start + i * step);

const base = (): StrategyInput => ({
  sleeve: { accountValueUsd: 592.28, cashUsd: 556, positions: [] },
  limits: DEFAULT_LIMITS,
  closes: { QQQ: up(220, 400), SPY: up(220, 500) },
  quotes: { QQQ: 509.5, SPY: 609.5 },
  today: '2026-09-18',
});

describe('indicators', () => {
  test('sma and the session high are plain arithmetic over the tail', () => {
    expect(sma([1, 2, 3, 4], 2)).toBe(3.5);
    expect(sma([1, 2], 5)).toBeNull();
    expect(sessionHigh([3, 9, 4, 8], 3)).toBe(9);
  });
});

describe('decideIndexCore', () => {
  test('an all-cash sleeve in an uptrend buys both cores as capped market orders, and explains it', () => {
    const r = decideIndexCore(base());
    expect(r.orders.map((o) => [o.symbol, o.side, o.orderType, o.notionalUsd])).toEqual([
      ['QQQ', 'buy', 'market', 150],
      ['SPY', 'buy', 'market', 150],
    ]);
    expect(r.analysis.examined.map((e) => [e.ticker, e.verdict])).toEqual([
      ['QQQ', 'signal'],
      ['SPY', 'signal'],
    ]);
    expect(r.analysis.notes).toMatch(/risk-on/i);
    expect(r.signals[0].thesis).toMatch(/target/i);
  });

  test('buys stop at the kill-switch floor and say so', () => {
    const r = decideIndexCore({ ...base(), sleeve: { accountValueUsd: 470, cashUsd: 470, positions: [] } });
    expect(r.orders).toEqual([]);
    expect(r.analysis.notes).toMatch(/floor/i);
    expect(r.analysis.examined.every((e) => e.verdict === 'no-signal')).toBe(true);
  });

  test('a small gap under the threshold is left alone', () => {
    const i = base();
    i.sleeve.positions = [{ symbol: 'QQQ', quantity: 0.45, marketValueUsd: 229 }, { symbol: 'SPY', quantity: 0.375, marketValueUsd: 228.5 }];
    i.sleeve.cashUsd = 134.78;
    const r = decideIndexCore(i);
    expect(r.orders).toEqual([]);
    expect(r.analysis.examined.map((e) => e.verdict)).toEqual(['no-signal', 'no-signal']);
  });

  test('a dip below the 20-session high buys the gap even when it is small', () => {
    const i = base();
    i.closes.QQQ = [...up(200, 400), ...Array.from({ length: 20 }, (_, k) => (k < 10 ? 500 : 470))];
    i.quotes.QQQ = 470;
    i.sleeve.positions = [{ symbol: 'QQQ', quantity: 0.47, marketValueUsd: 221 }, { symbol: 'SPY', quantity: 0.375, marketValueUsd: 228.5 }];
    i.sleeve.cashUsd = 142.78;
    const r = decideIndexCore(i);
    expect(r.orders.map((o) => o.symbol)).toEqual(['QQQ']);
    expect(r.analysis.examined[0].reason).toMatch(/dip/i);
  });

  test('a close under the 200-day average halves the target and trims the excess as a market sell', () => {
    const i = base();
    i.closes.QQQ = [...up(200, 600, -0.5), 480, 470, 460, 450, 440, 430, 420, 410, 400, 390, 380, 370, 360, 350, 340, 330, 320, 310, 300, 290];
    i.quotes.QQQ = 290;
    i.sleeve.positions = [{ symbol: 'QQQ', quantity: 0.8, marketValueUsd: 232 }];
    i.sleeve.cashUsd = 360.28;
    const r = decideIndexCore(i);
    const trim = r.orders.find((o) => o.symbol === 'QQQ');
    expect(trim?.side).toBe('sell');
    expect(trim?.orderType).toBe('market');
    expect(trim?.quantity).toBeCloseTo(0.4, 2);
    expect(r.analysis.examined[0].verdict).toBe('trim');
    expect(r.analysis.notes).toMatch(/risk-off/i);
  });

  test('a buy never exceeds cash or the per-trade cap', () => {
    const i = base();
    i.sleeve.cashUsd = 60;
    const r = decideIndexCore(i);
    expect(r.orders.length).toBe(1);
    expect(r.orders[0].notionalUsd).toBeLessThanOrEqual(60);
  });

  test('without enough history the regime is unknown, and the run says so instead of guessing', () => {
    const i = base();
    i.closes = { QQQ: up(30, 400), SPY: up(30, 500) };
    i.quotes = { QQQ: 414.5, SPY: 514.5 }; // the tape agrees with the short series
    const r = decideIndexCore(i);
    expect(r.analysis.notes).toMatch(/unknown/i);
    expect(r.orders.length).toBe(2);
  });
});

describe('data integrity', () => {
  test('a close that disagrees with the live quote by more than 15% is bad data: no order, and the run says so', () => {
    // 2026-09-18: a relayed close series read QQQ at 1304 against a live 716.
    const i = base();
    i.closes.QQQ = up(220, 1000);
    i.quotes.QQQ = 716.87;
    const r = decideIndexCore(i);
    expect(r.orders.map((o) => o.symbol)).toEqual(['SPY']);
    expect(r.analysis.examined[0].verdict).toBe('no-signal');
    expect(r.analysis.examined[0].reason).toMatch(/data/i);
    expect(r.analysis.notes).toMatch(/refused/i);
  });
});
