import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import {
  TradingAccountSnapshotSchema,
  TradingPositionSchema,
  TradeActivitySchema,
} from '@/lib/schemas';
import { robinhoodStatus } from '@/lib/connectors/robinhood';

/**
 * The /trading section is agent-fed: a trading agent pushes account snapshots
 * and trades into the DB via /api/trading/*, and the dashboard reads them back.
 * These pin the repo round-trip, the Zod contracts, and the connector's honest
 * status (no snapshot ⇒ not_configured; a fresh one ⇒ connected).
 */

let db: FounderDb;
afterEach(() => db?.close());

const SNAP = {
  capturedAt: '2026-08-13T15:00:00.000Z',
  accountId: 'individual',
  accountLabel: 'Individual',
  accountValueUsd: 10250.42,
  buyingPowerUsd: 3100.0,
  cashUsd: 3100.0,
  dayPnlUsd: 125.5,
  totalPnlUsd: 250.42,
  source: 'seed',
};
const POS = {
  capturedAt: '2026-08-13T15:00:00.000Z',
  accountId: 'individual',
  symbol: 'NVDA',
  quantity: 4,
  avgCostUsd: 900,
  marketValueUsd: 3800,
  unrealizedPnlUsd: 200,
};
const ACT = {
  id: 'tr-1',
  at: '2026-08-13T14:59:00.000Z',
  accountId: 'individual',
  agent: 'Markets Agent',
  action: 'buy' as const,
  symbol: 'NVDA',
  quantity: 1,
  priceUsd: 950,
  rationale: 'Momentum breakout above prior range.',
  status: 'filled' as const,
};

/** The agentic sleeve: a separate Robinhood account the agent may actually
 *  trade. It is the one the operator watches to see what the agent is doing. */
const AGENTIC = {
  ...SNAP,
  accountId: 'agentic',
  accountLabel: 'Agentic',
  accountValueUsd: 600,
  buyingPowerUsd: 600,
  cashUsd: 600,
  dayPnlUsd: 0,
  totalPnlUsd: 0,
};

describe('trading schemas', () => {
  test('validate well-formed rows and reject bad ones', () => {
    expect(TradingAccountSnapshotSchema.parse(SNAP)).toEqual(SNAP);
    expect(TradingPositionSchema.parse(POS)).toEqual(POS);
    expect(TradeActivitySchema.parse(ACT)).toEqual(ACT);
    expect(() => TradeActivitySchema.parse({ ...ACT, action: 'hodl' })).toThrow();
    expect(() => TradingAccountSnapshotSchema.parse({ ...SNAP, accountValueUsd: 'lots' })).toThrow();
  });
});

describe('trading repo', () => {
  test('records a snapshot with positions and reads back the latest', () => {
    db = openDb(':memory:');
    expect(db.trading.latestSnapshot()).toBeNull();
    expect(db.trading.positions()).toEqual([]);

    db.trading.recordSnapshot(SNAP, [POS]);
    expect(db.trading.latestSnapshot()).toEqual(SNAP);
    expect(db.trading.positions()).toEqual([POS]);
  });

  test('latestSnapshot returns the newest, positions follow it', () => {
    db = openDb(':memory:');
    db.trading.recordSnapshot(SNAP, [POS]);
    const newer = { ...SNAP, capturedAt: '2026-08-13T16:00:00.000Z', accountValueUsd: 10500 };
    const newerPos = { ...POS, capturedAt: '2026-08-13T16:00:00.000Z', marketValueUsd: 3900 };
    db.trading.recordSnapshot(newer, [newerPos]);
    expect(db.trading.latestSnapshot()?.accountValueUsd).toBe(10500);
    expect(db.trading.positions()).toEqual([newerPos]);
  });

  test('records and lists trade activity newest-first', () => {
    db = openDb(':memory:');
    db.trading.recordActivity(ACT);
    db.trading.recordActivity({ ...ACT, id: 'tr-2', at: '2026-08-13T15:30:00.000Z', action: 'sell' });
    const rows = db.trading.activity();
    expect(rows.map((r) => r.id)).toEqual(['tr-2', 'tr-1']);
  });
});

/**
 * the operator watches two Robinhood accounts side by side: the individual account
 * that holds the money, and the agentic sleeve the agent is allowed to trade.
 * They are fed independently, so neither push may clobber the other's rows.
 */
describe('trading repo — two accounts', () => {
  test('keeps the latest snapshot of every account, richest first', () => {
    db = openDb(':memory:');
    db.trading.recordSnapshot(AGENTIC, []);
    db.trading.recordSnapshot(SNAP, [POS]);

    const rows = db.trading.latestSnapshots();
    expect(rows.map((r) => r.accountId)).toEqual(['individual', 'agentic']);
    expect(rows.map((r) => r.accountValueUsd)).toEqual([10250.42, 600]);
  });

  test('a newer push replaces only its own account', () => {
    db = openDb(':memory:');
    db.trading.recordSnapshot(SNAP, [POS]);
    db.trading.recordSnapshot(AGENTIC, []);

    const newer = { ...SNAP, capturedAt: '2026-08-13T16:00:00.000Z', accountValueUsd: 10500 };
    db.trading.recordSnapshot(newer, [{ ...POS, capturedAt: '2026-08-13T16:00:00.000Z' }]);

    const byId = Object.fromEntries(db.trading.latestSnapshots().map((r) => [r.accountId, r]));
    expect(byId.individual.accountValueUsd).toBe(10500);
    expect(byId.agentic.accountValueUsd).toBe(600);
  });

  test('positions stay scoped to their own account', () => {
    db = openDb(':memory:');
    const agenticPos = { ...POS, accountId: 'agentic', symbol: 'SPY', marketValueUsd: 300 };
    db.trading.recordSnapshot(AGENTIC, [agenticPos]);
    db.trading.recordSnapshot(SNAP, [POS]);

    expect(db.trading.positions('agentic')).toEqual([agenticPos]);
    expect(db.trading.positions('individual')).toEqual([POS]);
    expect(db.trading.positions().map((p) => p.symbol).sort()).toEqual(['NVDA', 'SPY']);
  });

  test('history returns one account s snapshots oldest-first for the graph', () => {
    db = openDb(':memory:');
    db.trading.recordSnapshot(AGENTIC, []);
    db.trading.recordSnapshot({ ...AGENTIC, capturedAt: '2026-08-13T17:00:00.000Z', accountValueUsd: 640 }, []);
    db.trading.recordSnapshot({ ...AGENTIC, capturedAt: '2026-08-13T16:00:00.000Z', accountValueUsd: 620 }, []);
    db.trading.recordSnapshot(SNAP, [POS]);

    const series = db.trading.history('agentic');
    expect(series.map((s) => s.accountValueUsd)).toEqual([600, 620, 640]);
  });

  test('activity can be read per account so the agent has its own feed', () => {
    db = openDb(':memory:');
    db.trading.recordActivity(ACT);
    db.trading.recordActivity({ ...ACT, id: 'tr-a1', accountId: 'agentic', agent: 'Markets Agent' });

    expect(db.trading.activity().length).toBe(2);
    expect(db.trading.activity(50, 'agentic').map((r) => r.id)).toEqual(['tr-a1']);
    expect(db.trading.activity(50, 'individual').map((r) => r.id)).toEqual(['tr-1']);
  });
});

describe('robinhoodStatus', () => {
  test('not_configured when no snapshot has been fed', () => {
    const s = robinhoodStatus(null);
    expect(s.state).toBe('not_configured');
    expect(s.id).toBe('robinhood');
  });

  test('connected with a freshness detail when a snapshot exists', () => {
    const now = new Date('2026-08-13T15:05:00.000Z');
    const s = robinhoodStatus(SNAP, now);
    expect(s.state).toBe('connected');
    expect(s.detail).toMatch(/ago/);
    expect(s.meta?.accountValueUsd).toBe(SNAP.accountValueUsd);
  });

  test('reports the combined value and account count when fed both accounts', () => {
    const now = new Date('2026-08-13T15:05:00.000Z');
    const s = robinhoodStatus([SNAP, AGENTIC], now);
    expect(s.state).toBe('connected');
    expect(s.meta?.accountValueUsd).toBe(10850.42);
    expect(s.detail).toMatch(/2 accounts/);
  });

  test('not_configured for an empty account list', () => {
    expect(robinhoodStatus([]).state).toBe('not_configured');
  });
});

/**
 * Editable guardrail limits. Single-row table: the agent has one set of limits,
 * and a second save has to overwrite rather than accumulate rows, or the agent
 * would read whichever one the query happened to return first.
 */
describe('trading limits repo', () => {
  const LIMITS = {
    maxNotionalPerTradeUsd: 60,
    maxPositionPctOfSleeve: 10,
    maxRiskPctPerTrade: 1,
    maxConcurrentPositions: 8,
    maxTradesPerDay: 5,
    minSleeveValueUsd: 540,
    maxDeployedCapitalUsd: 300,
  };

  test('limits() is null until something is saved', () => {
    db = openDb(':memory:');
    expect(db.trading.limits()).toBeNull();
  });

  test('saveLimits round-trips every field', () => {
    db = openDb(':memory:');
    db.trading.saveLimits(LIMITS);
    expect(db.trading.limits()).toEqual({ ...LIMITS, autopilot: false });
  });

  test('a second save overwrites rather than adding a row', () => {
    db = openDb(':memory:');
    db.trading.saveLimits(LIMITS);
    db.trading.saveLimits({ ...LIMITS, maxTradesPerDay: 2 });
    expect(db.trading.limits()!.maxTradesPerDay).toBe(2);
    expect(db.trading.limitsUpdatedAt()).not.toBeNull();
  });
});

/**
 * The seeded rows keep /trading alive before a real feed exists, and they must
 * leave the moment real data lands: a seeded snapshot sitting in front of a
 * smaller real balance draws a fake cliff on the sleeve graph that never
 * happened.
 */
describe('db.trading.evictSeeded', () => {
  const real = { ...SNAP, accountId: 'agentic', accountLabel: 'Agentic', capturedAt: '2026-09-18T14:00:00.000Z', source: 'robinhood' };
  const realPos = { ...POS, accountId: 'agentic', capturedAt: real.capturedAt, symbol: 'QQQ' };

  test('removes every seeded snapshot, position and seed-id activity row and reports the counts', () => {
    db = openDb(':memory:');
    db.trading.recordSnapshot(SNAP, [POS]);
    db.trading.recordSnapshot({ ...SNAP, accountId: 'agentic', accountLabel: 'Agentic' }, []);
    db.trading.recordActivity({ ...ACT, id: 'tr-seed-1' });
    db.trading.recordSnapshot(real, [realPos]);
    db.trading.recordActivity({ ...ACT, id: 'mkt-1', accountId: 'agentic' });

    const gone = db.trading.evictSeeded();
    expect(gone.snapshots).toBe(2);
    expect(gone.positions).toBe(1);
    expect(gone.activity).toBe(1);

    const left = db.trading.latestSnapshots();
    expect(left.map((s) => s.source)).toEqual(['robinhood']);
    expect(db.trading.history('agentic').map((s) => s.source)).toEqual(['robinhood']);
    expect(db.trading.positions().map((p) => p.symbol)).toEqual(['QQQ']);
    expect(db.trading.activity().map((a) => a.id)).toEqual(['mkt-1']);
  });

  test('is a no-op on a database that never held seeds', () => {
    db = openDb(':memory:');
    db.trading.recordSnapshot(real, [realPos]);
    expect(db.trading.evictSeeded()).toEqual({ snapshots: 0, positions: 0, activity: 0 });
    expect(db.trading.latestSnapshots()).toHaveLength(1);
  });
});
