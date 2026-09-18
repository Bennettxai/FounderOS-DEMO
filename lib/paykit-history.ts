import Database from 'better-sqlite3';
import type { PaykitCustomer, PaykitHistoryPort, PaykitSnapshot } from '@/lib/connectors/payments';
import { resolveDbPath } from '@/lib/paths';

/**
 * PayKit snapshot history — a SEPARATE better-sqlite3 store (data/paykit.db),
 * deliberately NOT wired into lib/db.ts's repo layer, same as the ledger and bank
 * stores. It holds one row per customer per day: the running lifetime totals the
 * /customers endpoint reports.
 *
 * Why it exists: PayKit has exactly two public endpoints and neither is a
 * transaction feed, so a month can only be recovered by DIFFERENCING two reads of
 * the lifetime totals. The finances page already pulls /customers on every render
 * and threw the result away; this keeps it. See connectors/payments.ts for the
 * arithmetic.
 *
 * No PII: ids and numbers only. Names, emails and phone numbers come back in the
 * same payload and are dropped on the way in — nothing downstream needs them, and
 * a file of payer contact details is a liability this feature does not require.
 */

// Resolved per platform (Railway volume / Vercel /tmp / local data/); PAYKIT_DB
// overrides. Resolved per CALL, not at import, so a runtime env change (tests,
// deploys) is honoured.
const defaultPath = (): string => resolveDbPath('paykit.db', process.env.PAYKIT_DB);

/**
 * The oldest snapshot in the store: a RECONSTRUCTION rather than a capture, kept
 * so the first full month after it resolves to an exact figure instead of a band.
 *
 * The shape is the point, not the contents — these are invented demo customers
 * (ids 9000xx, round amounts, UTC timestamps). A real deployment overwrites this
 * day the moment an actual capture for it is recorded.
 *
 * How a reconstruction like this is derived, for reference: lifetime totals only
 * rise, so an aggregate delta of +1 transaction / +$X between two reads is one
 * customer gaining one transaction of $X and cannot be spread across several. The
 * customer whose last-transaction date sits after the earlier read's high-water
 * mark is necessarily that customer; everyone else's row carries back unchanged.
 * The derived customer's PRIOR transaction date is genuinely unknown, so it is
 * null rather than invented — nothing reads a previous snapshot's date.
 *
 * Marked `source: 'reconstructed'` so it can never be read as a measurement.
 */
export const SEED_2026_08_20: PaykitSnapshot = {
  capturedOn: '2026-08-20',
  source: 'reconstructed',
  customers: (
    [
      ['900001', 250000, 2, null],
      ['900002', 500000, 1, '2025-07-01T12:00:00Z'],
      ['900003', 250000, 1, '2025-08-15T12:00:00Z'],
      ['900004', 750000, 3, '2025-11-01T12:00:00Z'],
      ['900005', 100000, 1, '2026-01-15T12:00:00Z'],
      ['900006', 500000, 1, '2026-03-10T12:00:00Z'],
      ['900007', 400000, 2, '2026-06-05T12:00:00Z'],
      ['900008', 150000, 1, '2026-08-01T12:00:00Z'],
    ] as const
  ).map(([id, totalSpentCents, transactions, lastTransactionDate]): PaykitCustomer => ({
    id,
    totalSpentCents,
    transactions,
    lastTransactionDate,
    month: lastTransactionDate ? lastTransactionDate.slice(0, 7) : null,
  })),
};

export type PaykitHistory = PaykitHistoryPort & {
  /** Distinct capture dates held, oldest first — how far back exactness reaches. */
  capturedDates(): string[];
  close(): void;
};

export function openPaykitHistory(
  account: string = 'paykit-lc',
  file: string = defaultPath(),
): PaykitHistory {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS paykit_customer_snapshots (
    account TEXT NOT NULL,
    captured_on TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    total_spent_cents INTEGER NOT NULL,
    total_transactions INTEGER NOT NULL,
    last_transaction_date TEXT,
    source TEXT NOT NULL,
    PRIMARY KEY (account, captured_on, customer_id)
  )`);

  const insert = db.prepare(
    `INSERT INTO paykit_customer_snapshots
       (account, captured_on, customer_id, total_spent_cents, total_transactions, last_transaction_date, source)
     VALUES (@account, @capturedOn, @customerId, @totalSpentCents, @totalTransactions, @lastTransactionDate, @source)
     ON CONFLICT(account, captured_on, customer_id) DO UPDATE SET
       total_spent_cents = excluded.total_spent_cents,
       total_transactions = excluded.total_transactions,
       last_transaction_date = excluded.last_transaction_date,
       source = excluded.source`,
  );

  const writeDay = db.transaction((snapshot: PaykitSnapshot) => {
    // Replace the day wholesale: a customer who vanished from the API must not
    // survive as a stale row, or the next diff reads their disappearance as a
    // refund and their reappearance as brand-new lifetime spend.
    db.prepare('DELETE FROM paykit_customer_snapshots WHERE account = ? AND captured_on = ?').run(
      account,
      snapshot.capturedOn,
    );
    for (const c of snapshot.customers) {
      // A row with no id cannot be joined across snapshots; storing it would
      // collide every such row onto one key and fabricate deltas between them.
      if (!c.id) continue;
      insert.run({
        account,
        capturedOn: snapshot.capturedOn,
        customerId: c.id,
        totalSpentCents: c.totalSpentCents,
        totalTransactions: c.transactions,
        lastTransactionDate: c.lastTransactionDate,
        source: snapshot.source,
      });
    }
  });

  // The one historical datapoint that exists, installed once. Written only when
  // that date is absent, so a later real capture is never overwritten by an
  // inference.
  const seeded = db
    .prepare('SELECT 1 FROM paykit_customer_snapshots WHERE account = ? AND captured_on = ? LIMIT 1')
    .get(account, SEED_2026_08_20.capturedOn);
  if (!seeded && account === 'paykit-lc') writeDay(SEED_2026_08_20);

  return {
    record(snapshot) {
      writeDay(snapshot);
    },
    snapshots() {
      const rows = db
        .prepare(
          `SELECT captured_on AS capturedOn, customer_id AS id, total_spent_cents AS totalSpentCents,
                  total_transactions AS transactions, last_transaction_date AS lastTransactionDate, source
             FROM paykit_customer_snapshots WHERE account = ? ORDER BY captured_on ASC`,
        )
        .all(account) as {
        capturedOn: string;
        id: string;
        totalSpentCents: number;
        transactions: number;
        lastTransactionDate: string | null;
        source: string;
      }[];
      const byDay = new Map<string, PaykitSnapshot>();
      for (const r of rows) {
        let day = byDay.get(r.capturedOn);
        if (!day) {
          day = {
            capturedOn: r.capturedOn,
            source: r.source === 'reconstructed' ? 'reconstructed' : 'live',
            customers: [],
          };
          byDay.set(r.capturedOn, day);
        }
        day.customers.push({
          id: r.id,
          totalSpentCents: r.totalSpentCents,
          transactions: r.transactions,
          lastTransactionDate: r.lastTransactionDate,
          month: r.lastTransactionDate ? r.lastTransactionDate.slice(0, 7) : null,
        });
      }
      return [...byDay.values()];
    },
    capturedDates() {
      return (
        db
          .prepare(
            'SELECT DISTINCT captured_on AS capturedOn FROM paykit_customer_snapshots WHERE account = ? ORDER BY captured_on ASC',
          )
          .all(account) as { capturedOn: string }[]
      ).map((r) => r.capturedOn);
    },
    close() {
      db.close();
    },
  };
}
