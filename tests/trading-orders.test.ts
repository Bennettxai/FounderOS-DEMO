import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { TradingOrderSchema } from '@/lib/schemas';

/**
 * Open orders are broker STATE, not a log.
 *
 * The trade log records what the agent did; this records what is still live at
 * the broker right now. It has to be replace-on-push rather than append: an
 * order that filled or was cancelled must vanish from the panel, because a
 * stale "queued" row is worse than showing nothing at all.
 */

let db: FounderDb;
afterEach(() => db?.close());

const ORDER = {
  id: '6a7e28c3-e692-41e2-9586-73d30307779a',
  accountId: 'agentic',
  symbol: 'BSX',
  side: 'buy' as const,
  type: 'market',
  state: 'queued',
  quantity: 0.85287,
  filledQuantity: 0,
  dollarAmountUsd: 44,
  limitPriceUsd: null,
  placedAgent: 'agentic',
  createdAt: '2026-08-13T20:27:47.715Z',
};

describe('TradingOrderSchema', () => {
  test('accepts a dollar-based market order with no limit price', () => {
    expect(TradingOrderSchema.parse(ORDER)).toEqual(ORDER);
  });

  test('accepts a share-based limit order with no dollar amount', () => {
    const limit = { ...ORDER, type: 'limit', dollarAmountUsd: null, limitPriceUsd: 52.0, quantity: 1 };
    expect(TradingOrderSchema.parse(limit).limitPriceUsd).toBe(52);
  });

  test('rejects a side it does not understand', () => {
    expect(() => TradingOrderSchema.parse({ ...ORDER, side: 'short' })).toThrow();
  });
});

describe('trading.recordOpenOrders', () => {
  test('round-trips an open order', () => {
    db = openDb(':memory:');
    expect(db.trading.openOrders('agentic')).toEqual([]);

    db.trading.recordOpenOrders('agentic', [ORDER]);
    expect(db.trading.openOrders('agentic')).toEqual([ORDER]);
  });

  test('replaces the set, so a filled order stops being shown as live', () => {
    db = openDb(':memory:');
    db.trading.recordOpenOrders('agentic', [ORDER, { ...ORDER, id: 'other', symbol: 'MDT' }]);
    expect(db.trading.openOrders('agentic').length).toBe(2);

    // next run: BSX filled, so the broker only reports the other one
    db.trading.recordOpenOrders('agentic', [{ ...ORDER, id: 'other', symbol: 'MDT' }]);
    const rows = db.trading.openOrders('agentic');
    expect(rows.map((r) => r.symbol)).toEqual(['MDT']);
  });

  test('an empty push clears the account, which is how "nothing live" is said', () => {
    db = openDb(':memory:');
    db.trading.recordOpenOrders('agentic', [ORDER]);
    db.trading.recordOpenOrders('agentic', []);
    expect(db.trading.openOrders('agentic')).toEqual([]);
  });

  test('never touches another account s orders', () => {
    db = openDb(':memory:');
    db.trading.recordOpenOrders('agentic', [ORDER]);
    db.trading.recordOpenOrders('individual', []);
    expect(db.trading.openOrders('agentic').length).toBe(1);
  });

  test('reads every account when none is named, newest first', () => {
    db = openDb(':memory:');
    db.trading.recordOpenOrders('agentic', [ORDER]);
    db.trading.recordOpenOrders('individual', [
      { ...ORDER, id: 'ind-1', accountId: 'individual', symbol: 'APLD', createdAt: '2026-08-14T13:00:00.000Z' },
    ]);
    expect(db.trading.openOrders().map((o) => o.symbol)).toEqual(['APLD', 'BSX']);
  });
});
