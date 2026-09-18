import { describe, expect, test } from 'vitest';
import { agentSummary, chartGeometry } from '@/lib/trading-chart';
import type { TradeActivity, TradingAccountSnapshot } from '@/lib/schemas';

/**
 * The agent graph: the agentic account's value over time with the agent's own
 * trades marked on the line. The geometry is pure so it can be pinned here —
 * the component only renders what these functions return.
 */

const snap = (capturedAt: string, accountValueUsd: number): TradingAccountSnapshot => ({
  capturedAt,
  accountId: 'agentic',
  accountLabel: 'Agentic',
  accountValueUsd,
  buyingPowerUsd: 0,
  cashUsd: 0,
  dayPnlUsd: 0,
  totalPnlUsd: 0,
  source: 'robinhood',
});

const trade = (at: string, symbol = 'SPY'): TradeActivity => ({
  id: `t-${at}`,
  at,
  accountId: 'agentic',
  agent: 'Markets Agent',
  action: 'buy',
  symbol,
  quantity: 1,
  priceUsd: 100,
  rationale: '',
  status: 'filled',
});

const SERIES = [
  snap('2026-08-13T11:00:00.000Z', 600),
  snap('2026-08-13T12:00:00.000Z', 640),
  snap('2026-08-13T13:00:00.000Z', 620),
];

describe('chartGeometry', () => {
  test('returns null when there is nothing to plot', () => {
    expect(chartGeometry([], [], { w: 100, h: 40 })).toBeNull();
    expect(chartGeometry([snap('2026-08-13T11:00:00.000Z', 600)], [], { w: 100, h: 40 })).toBeNull();
  });

  test('spans the full width oldest-left, newest-right', () => {
    const g = chartGeometry(SERIES, [], { w: 300, h: 100 })!;
    expect(g.points).toHaveLength(3);
    expect(g.points[0].x).toBe(0);
    expect(g.points[2].x).toBe(300);
    // the peak (640) sits highest on screen, i.e. the smallest y
    expect(g.points[1].y).toBeLessThan(g.points[0].y);
    expect(g.points[1].y).toBeLessThan(g.points[2].y);
  });

  test('keeps every point inside the box, including a dead-flat series', () => {
    const flat = [snap('2026-08-13T11:00:00.000Z', 600), snap('2026-08-13T12:00:00.000Z', 600)];
    const g = chartGeometry(flat, [], { w: 200, h: 50 })!;
    for (const p of g.points) {
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(50);
    }
  });

  test('summarizes the move across the window', () => {
    const g = chartGeometry(SERIES, [], { w: 300, h: 100 })!;
    expect(g.firstUsd).toBe(600);
    expect(g.lastUsd).toBe(620);
    expect(g.changeUsd).toBe(20);
    expect(g.changePct).toBeCloseTo(3.33, 2);
  });

  test('pins each trade to the closest point on the line', () => {
    const g = chartGeometry(SERIES, [trade('2026-08-13T12:10:00.000Z')], { w: 300, h: 100 })!;
    expect(g.markers).toHaveLength(1);
    expect(g.markers[0].x).toBe(g.points[1].x);
    expect(g.markers[0].trade.symbol).toBe('SPY');
  });

  test('ignores trades outside the plotted window', () => {
    const g = chartGeometry(SERIES, [trade('2020-01-01T00:00:00.000Z')], { w: 300, h: 100 })!;
    expect(g.markers).toHaveLength(0);
  });
});

/**
 * The honest read on the agent. An untraded, funded sleeve is the state today,
 * and the panel has to say so rather than implying activity that never happened.
 */
describe('agentSummary', () => {
  const funded = { ...snap('2026-08-13T13:00:00.000Z', 600), buyingPowerUsd: 600, cashUsd: 600 };

  test('reports an idle agent when it holds cash and has never traded', () => {
    const s = agentSummary(funded, [], []);
    expect(s.hasActed).toBe(false);
    expect(s.tradeCount).toBe(0);
    expect(s.idleCashUsd).toBe(600);
    expect(s.deployedUsd).toBe(0);
    expect(s.lastTradeAt).toBeNull();
  });

  test('counts only filled trades and reports the most recent one', () => {
    const trades: TradeActivity[] = [
      { ...trade('2026-08-13T12:00:00.000Z', 'SPY') },
      { ...trade('2026-08-13T12:30:00.000Z', 'QQQ'), status: 'cancelled' },
      { ...trade('2026-08-13T12:45:00.000Z', 'IWM') },
    ];
    const s = agentSummary(funded, [], trades);
    expect(s.hasActed).toBe(true);
    expect(s.tradeCount).toBe(2);
    expect(s.lastTradeAt).toBe('2026-08-13T12:45:00.000Z');
    expect(s.lastTrade?.symbol).toBe('IWM');
  });

  test('splits deployed capital from idle cash', () => {
    const positions = [
      {
        capturedAt: '2026-08-13T13:00:00.000Z',
        accountId: 'agentic',
        symbol: 'SPY',
        quantity: 1,
        avgCostUsd: 200,
        marketValueUsd: 220.5,
        unrealizedPnlUsd: 20.5,
      },
    ];
    const s = agentSummary({ ...funded, cashUsd: 380 }, positions, []);
    expect(s.deployedUsd).toBe(220.5);
    expect(s.idleCashUsd).toBe(380);
    expect(s.unrealizedPnlUsd).toBe(20.5);
  });

  test('handles never having been fed at all', () => {
    const s = agentSummary(null, [], []);
    expect(s.hasActed).toBe(false);
    expect(s.idleCashUsd).toBe(0);
    expect(s.tradeCount).toBe(0);
  });
});
