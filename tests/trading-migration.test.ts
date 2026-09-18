import { afterEach, describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb, type FounderDb } from '@/lib/db';

/**
 * The trading tables shipped single-account (captured_at was the whole primary
 * key), so an already-deployed database holds broker rows in that shape. Adding
 * the account dimension changes the primary keys, which SQLite cannot ALTER —
 * so the tables are rebuilt. This pins that the rebuild carries the existing
 * rows over instead of dropping them.
 */

let db: FounderDb;
afterEach(() => db?.close());

const tmpFile = () => path.join(mkdtempSync(path.join(tmpdir(), 'founder-os-migrate-')), 'legacy.db');

/** The exact pre-migration schema, with a row shaped like the live push. */
function writeLegacyDb(file: string): void {
  const legacy = new Database(file);
  legacy.exec(`
    CREATE TABLE trading_snapshots (
      captured_at TEXT PRIMARY KEY,
      account_value_usd REAL NOT NULL, buying_power_usd REAL NOT NULL, cash_usd REAL NOT NULL,
      day_pnl_usd REAL NOT NULL, total_pnl_usd REAL NOT NULL, source TEXT NOT NULL
    );
    CREATE TABLE trading_positions (
      captured_at TEXT NOT NULL, symbol TEXT NOT NULL, quantity REAL NOT NULL,
      avg_cost_usd REAL NOT NULL, market_value_usd REAL NOT NULL, unrealized_pnl_usd REAL NOT NULL,
      PRIMARY KEY (captured_at, symbol)
    );
    CREATE TABLE trading_activity (
      id TEXT PRIMARY KEY, at TEXT NOT NULL, agent TEXT NOT NULL, action TEXT NOT NULL,
      symbol TEXT NOT NULL, quantity REAL NOT NULL, price_usd REAL NOT NULL,
      rationale TEXT NOT NULL DEFAULT '', status TEXT NOT NULL
    );
    INSERT INTO trading_snapshots VALUES
      ('2026-08-13T15:41:58.462Z', 2000, 0, 0, 25, -10, 'robinhood');
    INSERT INTO trading_positions VALUES
      ('2026-08-13T15:41:58.462Z', 'ALFA', 20, 30, 600, -10),
      ('2026-08-13T15:41:58.462Z', 'BETA', 10, 50, 500, 25);
    INSERT INTO trading_activity VALUES
      ('tr-seed-5', '2026-08-13T14:32:34.377Z', 'Operator (manual)', 'buy', 'BETA', 10, 50, 'Filled.', 'filled');
  `);
  legacy.close();
}

describe('trading tables gain an account dimension without losing rows', () => {
  test('the existing single-account rows survive as the individual account', () => {
    const file = tmpFile();
    writeLegacyDb(file);

    db = openDb(file);

    const accounts = db.trading.latestSnapshots();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].accountId).toBe('individual');
    expect(accounts[0].accountLabel).toBe('Individual');
    expect(accounts[0].accountValueUsd).toBe(2000);
    expect(accounts[0].source).toBe('robinhood');

    expect(db.trading.positions().map((p) => p.symbol)).toEqual(['ALFA', 'BETA']);
    expect(db.trading.positions('individual')).toHaveLength(2);
    expect(db.trading.activity()[0].accountId).toBe('individual');
    expect(db.trading.activity()[0].symbol).toBe('BETA');
  });

  test('the migrated table then accepts a second account alongside the first', () => {
    const file = tmpFile();
    writeLegacyDb(file);
    db = openDb(file);

    db.trading.recordSnapshot(
      {
        capturedAt: '2026-08-13T16:00:00.000Z',
        accountId: 'agentic',
        accountLabel: 'Agentic',
        accountValueUsd: 600,
        buyingPowerUsd: 600,
        cashUsd: 600,
        dayPnlUsd: 0,
        totalPnlUsd: 0,
        source: 'robinhood',
      },
      [],
    );

    expect(db.trading.latestSnapshots().map((a) => a.accountId)).toEqual(['individual', 'agentic']);
    // the existing individual rows are untouched by the new account's push
    expect(db.trading.positions('individual')).toHaveLength(2);
  });

  test('re-opening an already-migrated database is a no-op', () => {
    const file = tmpFile();
    writeLegacyDb(file);
    openDb(file).close();

    db = openDb(file);
    expect(db.trading.latestSnapshots()[0].accountValueUsd).toBe(2000);
    expect(db.trading.positions()).toHaveLength(2);
  });
});
