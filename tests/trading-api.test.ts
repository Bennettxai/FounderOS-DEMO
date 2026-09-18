import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

/**
 * The agent-ingest routes accept a pushed snapshot / trade and the read route
 * reflects them; the seed leaves /trading alive out of the box.
 */

describe('seedDatabase seeds the trading account', () => {
  let db: FounderDb;
  beforeAll(() => {
    db = openDb(':memory:');
    seedDatabase(db);
  });
  afterAll(() => db.close());

  test('a snapshot, positions, and activity are present', () => {
    const snap = db.trading.latestSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.accountValueUsd).toBeGreaterThan(0);
    expect(db.trading.positions().length).toBeGreaterThan(0);
    expect(db.trading.activity().length).toBeGreaterThan(0);
  });
});

describe('trading ingest + read routes', () => {
  beforeAll(() => {
    process.env.FOUNDER_OS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'founder-os-trading-')), 'test.db');
  });
  afterAll(() => {
    delete process.env.FOUNDER_OS_DB;
  });

  const push = async (body: unknown) => {
    const { POST } = await import('@/app/api/trading/snapshot/route');
    return POST(new Request('http://localhost/api/trading/snapshot', { method: 'POST', body: JSON.stringify(body) }));
  };

  test('POST /api/trading/snapshot records, GET /api/trading returns it', async () => {
    const res = await push({
      snapshot: {
        capturedAt: '2026-08-13T20:00:00.000Z',
        accountId: 'individual',
        accountLabel: 'Individual',
        accountValueUsd: 12000,
        buyingPowerUsd: 4000,
        cashUsd: 4000,
        dayPnlUsd: 300,
        totalPnlUsd: 2000,
        source: 'robinhood',
      },
      positions: [
        {
          capturedAt: '2026-08-13T20:00:00.000Z',
          accountId: 'individual',
          symbol: 'SPY',
          quantity: 10,
          avgCostUsd: 600,
          marketValueUsd: 6200,
          unrealizedPnlUsd: 200,
        },
      ],
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const { GET } = await import('@/app/api/trading/route');
    const body = (await (await GET()).json()) as {
      snapshot: { accountValueUsd: number; source: string } | null;
      positions: { accountId: string; symbol: string }[];
      status: { state: string };
    };
    expect(body.snapshot?.accountValueUsd).toBe(12000);
    expect(body.snapshot?.source).toBe('robinhood');
    // The pushed snapshot supersedes the seeded individual positions; the
    // seeded agentic sleeve keeps its own and is unaffected by this push.
    expect(body.positions.filter((p) => p.accountId === 'individual')).toHaveLength(1);
    expect(body.status.state).toBe('connected');
  });

  test('GET /api/trading exposes every account and the agentic value series', async () => {
    const agentic = {
      accountId: 'agentic',
      accountLabel: 'Agentic',
      buyingPowerUsd: 600,
      cashUsd: 600,
      dayPnlUsd: 0,
      totalPnlUsd: 0,
      source: 'robinhood',
    };
    await push({ snapshot: { ...agentic, capturedAt: '2026-08-13T19:00:00.000Z', accountValueUsd: 600 }, positions: [] });
    await push({ snapshot: { ...agentic, capturedAt: '2026-08-13T21:00:00.000Z', accountValueUsd: 612 }, positions: [] });

    const { GET } = await import('@/app/api/trading/route');
    const body = (await (await GET()).json()) as {
      accounts: { accountId: string; accountValueUsd: number }[];
      history: Record<string, { accountValueUsd: number }[]>;
    };

    expect(body.accounts.map((a) => a.accountId)).toEqual(['individual', 'agentic']);
    expect(body.accounts.find((a) => a.accountId === 'agentic')?.accountValueUsd).toBe(612);
    // Oldest-first, with the two just-pushed points closing out the series.
    const series = body.history.agentic.map((p) => p.accountValueUsd);
    expect(series.slice(-2)).toEqual([600, 612]);
    expect(body.history.individual.length).toBeGreaterThan(0);
  });

  test('POST /api/trading/activity logs a trade; a bad action is rejected', async () => {
    const { POST } = await import('@/app/api/trading/activity/route');
    const ok = await POST(
      new Request('http://localhost/api/trading/activity', {
        method: 'POST',
        body: JSON.stringify({
          id: 'live-1',
          at: '2026-08-13T20:01:00.000Z',
          accountId: 'agentic',
          agent: 'Markets Agent',
          action: 'sell',
          symbol: 'SPY',
          quantity: 2,
          priceUsd: 620,
          rationale: 'Trim.',
          status: 'filled',
        }),
      }),
    );
    expect(ok.status).toBe(200);

    const bad = await POST(
      new Request('http://localhost/api/trading/activity', {
        method: 'POST',
        body: JSON.stringify({ id: 'x', at: 'now', agent: 'a', action: 'hodl', symbol: 'S', quantity: 1, priceUsd: 1, rationale: '', status: 'filled' }),
      }),
    );
    expect(bad.status).toBe(400);
  });
});

describe('trading limits route', () => {
  beforeAll(() => {
    process.env.FOUNDER_OS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'founder-os-limits-')), 'test.db');
  });
  afterAll(() => {
    delete process.env.FOUNDER_OS_DB;
  });

  const VALID = {
    maxNotionalPerTradeUsd: 55,
    maxPositionPctOfSleeve: 9,
    maxRiskPctPerTrade: 1,
    maxConcurrentPositions: 6,
    maxTradesPerDay: 4,
    minSleeveValueUsd: 550,
    maxDeployedCapitalUsd: 250,
  };

  const post = async (body: unknown) => {
    const { POST } = await import('@/app/api/trading/limits/route');
    return POST(new Request('http://localhost/api/trading/limits', { method: 'POST', body: JSON.stringify(body) }));
  };
  const get = async () => {
    const { GET } = await import('@/app/api/trading/limits/route');
    return GET();
  };

  test('GET reports the defaults before anything is saved', async () => {
    const body = await (await get()).json();
    expect(body.source).toBe('default');
    expect(body.limits.maxDeployedCapitalUsd).toBe(560);
    expect(body.clamped).toEqual([]);
  });

  test('POST with a malformed body is a 400 and persists nothing', async () => {
    const res = await post({ ...VALID, maxTradesPerDay: -3 });
    expect(res.status).toBe(400);
    expect((await (await get()).json()).source).toBe('default');
  });

  test('POST with junk JSON is a 400, not a crash', async () => {
    const { POST } = await import('@/app/api/trading/limits/route');
    const res = await POST(
      new Request('http://localhost/api/trading/limits', { method: 'POST', body: 'not json' }),
    );
    expect(res.status).toBe(400);
  });

  test('POST persists, and GET then reads it back as stored', async () => {
    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect((await res.json()).limits.maxTradesPerDay).toBe(4);

    const body = await (await get()).json();
    expect(body.source).toBe('stored');
    expect(body.limits).toEqual({ ...VALID, autopilot: false });
  });

  test('an over-ceiling value is clamped, and the response says so', async () => {
    const res = await post({ ...VALID, maxDeployedCapitalUsd: 10_000 });
    const body = await res.json();
    expect(res.status).toBe(200);
    // Echo what was actually stored, never what was asked for.
    expect(body.limits.maxDeployedCapitalUsd).toBe(600);
    expect(body.clamped).toContain('maxDeployedCapitalUsd');
    expect((await (await get()).json()).limits.maxDeployedCapitalUsd).toBe(600);
  });
  test('the first real snapshot evicts the seeded rows and says so', async () => {
    const { getDb } = await import('@/lib/data');
    const db = getDb();
    db.trading.recordSnapshot(
      { capturedAt: '2026-08-13T11:00:00.000Z', accountId: 'agentic', accountLabel: 'Agentic', accountValueUsd: 1000, buyingPowerUsd: 1000, cashUsd: 1000, dayPnlUsd: 0, totalPnlUsd: 0, source: 'seed' },
      [],
    );
    const { POST } = await import('@/app/api/trading/snapshot/route');
    const push = (body: unknown) =>
      POST(new Request('http://localhost/api/trading/snapshot', { method: 'POST', body: JSON.stringify(body) }));
    const res = await push({
      snapshot: { capturedAt: '2026-09-18T14:00:00.000Z', accountId: 'agentic', accountLabel: 'Agentic', accountValueUsd: 500, buyingPowerUsd: 500, cashUsd: 500, dayPnlUsd: 0, totalPnlUsd: 0, source: 'robinhood' },
      positions: [],
    });
    const body = (await res.json()) as { evicted: { snapshots: number } | null };
    expect(body.evicted?.snapshots).toBeGreaterThanOrEqual(1);
    expect(db.trading.history('agentic').every((h) => h.source !== 'seed')).toBe(true);
  });

});
