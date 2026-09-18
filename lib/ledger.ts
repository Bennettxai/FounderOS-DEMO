import Database from 'better-sqlite3';
import type { LedgerRow } from '@/lib/statements';
import { DEFAULT_CARD, normalizeCardId, type CardId } from '@/lib/cards';
import type { SpendRow } from '@/lib/spend-report';
import { resolveDbPath } from '@/lib/paths';

/**
 * Statement ledger — a SEPARATE better-sqlite3 store (data/ledger.db, gitignored
 * PII) so uploaded bank/CC data never touches the shared app DB / schema / seed.
 * Deliberately NOT wired into lib/db.ts's repo layer.
 *
 * Every row carries the card lane it was uploaded under (see lib/cards.ts), so
 * the same subscription billed to two cards stays two rows and the expenditure
 * report can split spend by business.
 */

// Resolved per platform (Railway volume / Vercel /tmp / local data/); LEDGER_DB
// overrides. Resolved per CALL, not at import, so a runtime env change (tests,
// deploys) is honoured.
const defaultPath = (): string => resolveDbPath('ledger.db', process.env.LEDGER_DB);

export type Ledger = {
  insertRows(rows: LedgerRow[]): number;
  /** Spend by category for the most recent month present (so "/mo" is honest). */
  monthly(): { category: string; total: number }[];
  /** The latest YYYY-MM with spend, or null when empty. */
  latestMonth(): string | null;
  /** Every month with spend, newest first. */
  months(): string[];
  /** The same months oldest-first, which is the order the /finances month
      steppers walk them in. */
  monthsAscending(): string[];
  /** Spend by category for one month, or all months when `month` is null. */
  byCategory(month: string | null): { category: string; total: number }[];
  /** Spend per card lane for one month (or all), biggest first. */
  byCard(month: string | null): { card: CardId; total: number }[];
  /** The month's out-rows, biggest first. */
  rows(month: string | null): SpendRow[];
  /** The whole ledger, income included — the month-to-month report's input. */
  allRows(): SpendRow[];
  reconcile(incomeUsd: number): { income: number; expenses: number; net: number };
  rowCount(): number;
  close(): void;
};

type RawRow = {
  date: string;
  description: string;
  amountCents: number;
  direction: 'in' | 'out';
  category: string;
  card: string;
};

const toSpendRow = (r: RawRow): SpendRow => ({ ...r, card: normalizeCardId(r.card) });

export function openLedger(file: string = defaultPath()): Ledger {
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

  // Migration: rows predating the card lanes belong to the
  // Platinum, and their hashes must gain the card prefix too — otherwise
  // re-uploading a statement already ingested would insert a second copy.
  const cols = db.prepare(`PRAGMA table_info(ledger_rows)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === 'card')) {
    db.exec(`ALTER TABLE ledger_rows ADD COLUMN card TEXT NOT NULL DEFAULT '${DEFAULT_CARD}'`);
    db.exec(`UPDATE ledger_rows SET hash = card || '|' || hash`);
  }

  const insert = db.prepare(
    `INSERT OR IGNORE INTO ledger_rows (hash, date, description, amount_cents, direction, category, card)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const monthsDesc = (): string[] =>
    (
      db
        .prepare(
          `SELECT DISTINCT substr(date, 1, 7) AS m FROM ledger_rows WHERE direction = 'out' ORDER BY m DESC`,
        )
        .all() as { m: string }[]
    ).map((r) => r.m);

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
          const card = normalizeCardId(r.card);
          const hash = `${card}|${r.date}|${r.description}|${r.amountCents}|${r.direction}`;
          inserted += insert.run(hash, r.date, r.description, r.amountCents, r.direction, r.category, card).changes;
        }
      });
      tx(rows);
      return inserted;
    },
    latestMonth: latestMonthOf,
    months: monthsDesc,
    monthsAscending() {
      return monthsDesc().reverse();
    },
    byCategory(month) {
      const rows = db
        .prepare(
          `SELECT category, SUM(amount_cents) AS cents FROM ledger_rows
           WHERE direction = 'out' AND (? IS NULL OR substr(date, 1, 7) = ?)
           GROUP BY category ORDER BY cents DESC`,
        )
        .all(month, month) as { category: string; cents: number }[];
      return rows.map((r) => ({ category: r.category, total: r.cents / 100 }));
    },
    byCard(month) {
      const rows = db
        .prepare(
          `SELECT card, SUM(amount_cents) AS cents FROM ledger_rows
           WHERE direction = 'out' AND (? IS NULL OR substr(date, 1, 7) = ?)
           GROUP BY card ORDER BY cents DESC`,
        )
        .all(month, month) as { card: string; cents: number }[];
      return rows.map((r) => ({ card: normalizeCardId(r.card), total: r.cents / 100 }));
    },
    rows(month) {
      const rows = db
        .prepare(
          `SELECT date, description, amount_cents AS amountCents, direction, category, card
           FROM ledger_rows
           WHERE direction = 'out' AND (? IS NULL OR substr(date, 1, 7) = ?)
           ORDER BY amount_cents DESC, date DESC`,
        )
        .all(month, month) as RawRow[];
      return rows.map(toSpendRow);
    },
    allRows() {
      const rows = db
        .prepare(
          `SELECT date, description, amount_cents AS amountCents, direction, category, card
           FROM ledger_rows ORDER BY date ASC`,
        )
        .all() as RawRow[];
      return rows.map(toSpendRow);
    },
    monthly() {
      const m = latestMonthOf();
      if (!m) return [];
      return this.byCategory(m);
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
