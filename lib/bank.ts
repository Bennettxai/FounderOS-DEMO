import Database from 'better-sqlite3';
import path from 'node:path';
import type { BankSummary } from '@/lib/bank-statements';

/**
 * Bank statement-summary store — a SEPARATE better-sqlite3 file (data/bank.db,
 * gitignored PII), keyed by (account, month) so re-uploading a statement updates
 * in place. Holds per-business monthly income/outflow, not transactions.
 */

const DEFAULT_PATH = process.env.BANK_DB ?? path.join(process.cwd(), 'data', 'bank.db');

export type BankStore = {
  upsert(summary: BankSummary): void;
  all(): BankSummary[];
  close(): void;
};

export function openBankStore(file: string = DEFAULT_PATH): BankStore {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS bank_summaries (
    account TEXT NOT NULL,
    business TEXT NOT NULL,
    month TEXT NOT NULL,
    credits_cents INTEGER NOT NULL,
    debits_cents INTEGER NOT NULL,
    net_cents INTEGER NOT NULL,
    PRIMARY KEY (account, month)
  )`);

  const upsert = db.prepare(
    `INSERT INTO bank_summaries (account, business, month, credits_cents, debits_cents, net_cents)
     VALUES (@account, @business, @month, @creditsCents, @debitsCents, @netCents)
     ON CONFLICT(account, month) DO UPDATE SET
       business = excluded.business,
       credits_cents = excluded.credits_cents,
       debits_cents = excluded.debits_cents,
       net_cents = excluded.net_cents`,
  );

  return {
    upsert(summary) {
      upsert.run(summary);
    },
    all() {
      return db
        .prepare(
          `SELECT account, business, month, credits_cents AS creditsCents, debits_cents AS debitsCents, net_cents AS netCents
           FROM bank_summaries ORDER BY month ASC, business ASC`,
        )
        .all() as BankSummary[];
    },
    close() {
      db.close();
    },
  };
}
