import { describe, expect, test } from 'vitest';
import { freshness, positionSizes, filterActivity, activityCounts, syncAge } from '@/lib/trading-view';
import type { TradeActivity, TradingAccountSnapshot, TradingPosition } from '@/lib/schemas';

/**
 * Pure helpers behind the /trading slab (2026-09-18). The board only draws
 * what these return, so the honest bits — is the feed live, who placed what,
 * how big the book is — are pinned here rather than in JSX.
 */

const NOW = Date.parse('2026-09-18T15:00:00.000Z');
const snap = (over: Partial<TradingAccountSnapshot>): TradingAccountSnapshot => ({
  capturedAt: '2026-09-18T14:30:00.000Z',
  accountId: 'agentic',
  accountLabel: 'Agentic',
  accountValueUsd: 592.28,
  buyingPowerUsd: 556,
  cashUsd: 556,
  dayPnlUsd: 0,
  totalPnlUsd: 0,
  source: 'robinhood',
  ...over,
});
const act = (over: Partial<TradeActivity>): TradeActivity => ({
  id: 'a',
  at: '2026-09-18T14:00:00.000Z',
  accountId: 'agentic',
  agent: 'Markets Agent',
  action: 'buy',
  symbol: 'QQQ',
  quantity: 1,
  priceUsd: 500,
  rationale: '',
  status: 'filled',
  ...over,
});
const pos = (symbol: string, marketValueUsd: number): TradingPosition => ({
  capturedAt: '2026-09-18T14:30:00.000Z',
  accountId: 'agentic',
  symbol,
  quantity: 1,
  avgCostUsd: marketValueUsd,
  marketValueUsd,
  unrealizedPnlUsd: 0,
});

describe('freshness', () => {
  test('no snapshot at all is "none"', () => {
    expect(freshness([], NOW).state).toBe('none');
  });
  test('a push inside 90 minutes is live', () => {
    expect(freshness([snap({})], NOW)).toEqual({ state: 'live', label: 'synced 30m ago' });
  });
  test('the freshest account decides, and anything older than 90 minutes is stale', () => {
    const old = snap({ accountId: 'individual', capturedAt: '2026-08-21T19:22:00.000Z' });
    expect(freshness([old], NOW)).toEqual({ state: 'stale', label: 'synced 27d ago' });
    expect(freshness([old, snap({})], NOW).state).toBe('live');
  });
  test('a seeded snapshot is never live, however recent', () => {
    expect(freshness([snap({ source: 'seed' })], NOW).state).toBe('seeded');
  });
});

describe('syncAge', () => {
  test('reads in minutes, hours, then days', () => {
    expect(syncAge('2026-09-18T14:59:40.000Z', NOW)).toBe('synced just now');
    expect(syncAge('2026-09-18T14:30:00.000Z', NOW)).toBe('synced 30m ago');
    expect(syncAge('2026-09-18T09:00:00.000Z', NOW)).toBe('synced 6h ago');
    expect(syncAge('2026-09-11T15:00:00.000Z', NOW)).toBe('synced 7d ago');
  });
});

describe('positionSizes', () => {
  test('buckets the book by market value, keeping empty buckets so the matrix holds its shape', () => {
    expect(positionSizes([pos('BSX', 36), pos('QQQ', 180), pos('APLD', 982), pos('NVDA', 4000)])).toEqual([
      { label: '<$50', count: 1 },
      { label: '$50-250', count: 1 },
      { label: '$250-1k', count: 1 },
      { label: '$1k+', count: 1 },
    ]);
    expect(positionSizes([]).map((b) => b.count)).toEqual([0, 0, 0, 0]);
  });
});

describe('filterActivity', () => {
  const rows = [
    act({ id: '1', agent: 'Markets Agent' }),
    act({ id: '2', agent: 'Operator (manual)', accountId: 'individual' }),
    act({ id: '3', agent: 'Markets Agent', status: 'rejected' }),
    act({ id: '4', agent: 'Operator (override)', status: 'pending' }),
  ];
  test('all keeps every row', () => {
    expect(filterActivity(rows, 'all').map((r) => r.id)).toEqual(['1', '2', '3', '4']);
  });
  test('agent is what the Markets Agent did, whatever the outcome', () => {
    expect(filterActivity(rows, 'agent').map((r) => r.id)).toEqual(['1', '3']);
  });
  test('you is every row a human placed, manual or override', () => {
    expect(filterActivity(rows, 'you').map((r) => r.id)).toEqual(['2', '4']);
  });
  test('rejected isolates the orders that never reached a fill', () => {
    expect(filterActivity(rows, 'rejected').map((r) => r.id)).toEqual(['3']);
  });
  test('the chip counts come from the same rules', () => {
    expect(activityCounts(rows)).toEqual({ all: 4, agent: 2, you: 2, rejected: 1 });
  });
});
