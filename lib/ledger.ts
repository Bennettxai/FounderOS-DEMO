import Database from 'better-sqlite3';
import path from 'node:path';
import type { LedgerRow } from '@/lib/statements';

/**
 * Statement ledger — a SEPARATE better-sqlite3 store (data/ledger.db, gitignored
 * PII) so uploaded bank/CC data never touches the shared app DB / schema / seed.
 * Deliberately NOT wired into lib/db.ts's repo layer.
 */

const DEFAULT_PATH = process.env.LEDGER_DB ?? path.join(process.cwd(), 'data', 'ledger.db');

export type Ledger = {
  insertRows(rows: LedgerRow[]): number;
  /** Spend by category for the most recent month present (so "/mo" is honest). */
  monthly(): { category: string; total: number }[];
  /** The latest YYYY-MM with spend, or null when empty. */
  latestMonth(): string | null;
  reconcile(incomeUsd: number): { income: number; expenses: number; net: number };
  rowCount(): number;
  close(): void;
};

export function openLedger(file: string = DEFAULT_PATH): Ledger {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS ledger_rows (
    hash TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    direction TEXT NOT NULL,
    category TEXT NOT NULL
  )`);

  const insert = db.prepare(
    `INSERT OR IGNORE INTO ledger_rows (hash, date, description, amount_cents, direction, category)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const latestMonthOf = (): string | null => {
    const r = db
      .prepare(`SELECT MAX(substr(date, 1, 7)) AS m FROM ledger_rows WHERE direction = 'out'`)
      .get() as { m: string | null };
    return r.m ?? null;
  };

  return {
    insertRows(rows) {
      let inserted = 0;
      const tx = db.transaction((rs: LedgerRow[]) => {
        for (const r of rs) {
          const hash = `${r.date}|${r.description}|${r.amountCents}|${r.direction}`;
          inserted += insert.run(hash, r.date, r.description, r.amountCents, r.direction, r.category).changes;
        }
      });
      tx(rows);
      return inserted;
    },
    latestMonth: latestMonthOf,
    monthly() {
      const m = latestMonthOf();
      if (!m) return [];
      const rows = db
        .prepare(
          `SELECT category, SUM(amount_cents) AS cents FROM ledger_rows
           WHERE direction = 'out' AND substr(date, 1, 7) = ? GROUP BY category ORDER BY cents DESC`,
        )
        .all(m) as { category: string; cents: number }[];
      return rows.map((r) => ({ category: r.category, total: r.cents / 100 }));
    },
    reconcile(incomeUsd) {
      const m = latestMonthOf();
      const r = db
        .prepare(
          `SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM ledger_rows
           WHERE direction = 'out' AND (? IS NULL OR substr(date, 1, 7) = ?)`,
        )
        .get(m, m) as { cents: number };
      const expenses = r.cents / 100;
      return { income: incomeUsd, expenses, net: incomeUsd - expenses };
    },
    rowCount() {
      return (db.prepare(`SELECT COUNT(*) AS n FROM ledger_rows`).get() as { n: number }).n;
    },
    close() {
      db.close();
    },
  };
}
