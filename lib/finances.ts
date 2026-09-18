/**
 * Finances domain — pure, real-ready. Income flows through a processor/account
 * registry: the three accounts with real API connections (Stripe ×2, PayKit
 * LC). Expenses are the operator's declared set fees until a statement upload takes
 * over.
 *
 * No faked money: an unwired account reports null income, never a zero that
 * reads as "earned nothing". The page renders pending honestly.
 */

// ── Income: processor / account registry ────────────────────────────────────

export type IncomeAccount = {
  id: string;
  processor: string; // 'Stripe' | 'PayPal' | 'PayKit' | 'Wise'
  label: string; // display label, incl. the business for multi-account processors
  configured: boolean; // does this account have credentials in the env?
  live: boolean; // actually pulling real income right now (Stripe only, for now)
  income: number | null; // month-to-date income in USD (null = pending)
  // Upper bound, when the source can only bound the month rather than pin it
  // down (PayKit repeat buyers — see connectors/payments.ts). Null when
  // `income` IS exact. `income` always stays the PROVEN floor, so a consumer
  // that ignores this field understates and never overstates.
  incomeUpper: number | null;
  // Customers the source could not split. 0 ⇒ `income` is exact.
  unsplittableCustomers: number;
};

/** A month figure a source could only bound. `exactUsd` is the proven floor. */
export type IncomeBand = { exactUsd: number; upperUsd: number; unsplittableCustomers: number };

/** Recent outgoing transfer (e.g. Wise) — money the operator sent out. */
export type OutgoingTransfer = {
  amountCents: number;
  currency: string;
  status: string;
  created: string | number;
  reference?: string;
};

/**
 * The processors with real API connections. LC Stripe carries its real
 * month-to-date income when connected; the others go live when a real pull is
 * supplied via `liveIncomeUsd`. `configured` flags which accounts have keys in
 * the env (from `configuredProcessors`) — a key-set-but-not-pulling account
 * reads "key set", never a faked number.
 *
 * An entry in `liveIncomeUsd` is either a plain exact number or an `IncomeBand`
 * for a source that can only bound the month. A band contributes its FLOOR to
 * `income` and carries its ceiling alongside, so the headline total can never
 * be inflated by a figure nobody can prove.
 */
export function incomeAccounts(
  stripe: { connected: boolean; mtdUsd: number | null },
  configured: Record<string, boolean> = {},
  liveIncomeUsd: Record<string, number | IncomeBand> = {},
): IncomeAccount[] {
  // Non-Stripe accounts light up when a real month-to-date income is supplied
  // (e.g. PayKit via its customers API); otherwise they're honest pending.
  const account = (id: string, processor: string, label: string): IncomeAccount => {
    const value = liveIncomeUsd[id];
    const live = value != null;
    const band = typeof value === 'object' ? value : null;
    return {
      id,
      processor,
      label,
      configured: configured[id] ?? false,
      live,
      income: band ? band.exactUsd : live ? (value as number) : null,
      // Only surface a ceiling when it actually differs from the floor —
      // a band with nothing unsplittable is an exact figure, not a range.
      incomeUpper: band && band.unsplittableCustomers > 0 ? band.upperUsd : null,
      unsplittableCustomers: band ? band.unsplittableCustomers : 0,
    };
  };
  // Only processors with a real API connection get a card (the operator,
  // 2026-08-17): PayPal, PayKit · Vantage, and Wise were cut — no keys, no
  // pull, so their perpetual "awaiting key" boxes were noise. They re-enter
  // here (one line each) the day a connection actually exists.
  return [
    {
      id: 'stripe',
      processor: 'Stripe',
      label: 'Stripe · Launchpad Cohort',
      configured: configured.stripe ?? stripe.connected,
      live: stripe.connected,
      income: stripe.connected ? stripe.mtdUsd : null,
      incomeUpper: null, // Stripe reports per-charge; the month is always exact.
      unsplittableCustomers: 0,
    },
    account('stripe-vantage', 'Stripe', 'Stripe · Vantage'),
    account('paykit-lc', 'PayKit', 'PayKit · Launchpad Cohort'),
  ];
}

/** Total month-to-date income across accounts; pending (null) counts as zero.
    This is the PROVEN floor: an account that could only be bounded contributes
    its exact part. Pair it with `totalIncomeUpper` to show the band. */
export function totalIncome(accounts: IncomeAccount[]): number {
  return accounts.reduce((sum, a) => sum + (a.income ?? 0), 0);
}

/** Ceiling of the same total — every bounded account at its upper end. Equal to
    `totalIncome` when nothing is unsplittable, which is the usual case. */
export function totalIncomeUpper(accounts: IncomeAccount[]): number {
  return accounts.reduce((sum, a) => sum + (a.incomeUpper ?? a.income ?? 0), 0);
}

/** Whether any account in the set could only be bounded, not pinned down. */
export function hasUnsplittableIncome(accounts: IncomeAccount[]): boolean {
  return accounts.some((a) => a.unsplittableCustomers > 0);
}

// ── Expenses: declared set fees until a statement upload takes over ──────────

export type ExpenseItem = { id: string; label: string; category: string; monthly: number };

// A deliberately short placeholder list of recurring costs, shown only until a
// statement upload takes over (the ledger replaces this section the moment one
// is ingested). Keep it short and obviously illustrative: real fixed costs
// belong in the ledger, not hand-typed here.
export const DECLARED_EXPENSES: ExpenseItem[] = [
  { id: 'contractor-csm', label: 'Contractor · CSM', category: 'Contractors', monthly: 1000 },
  { id: 'software-stack', label: 'Core software stack', category: 'Software', monthly: 500 },
];

/** Sum of every recurring monthly cost. */
export function totalExpenses(items: ExpenseItem[]): number {
  return items.reduce((sum, e) => sum + e.monthly, 0);
}

/** Per-category totals, largest first. */
export function expensesByCategory(items: ExpenseItem[]): { category: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const e of items) totals.set(e.category, (totals.get(e.category) ?? 0) + e.monthly);
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

/** Net monthly cash flow — income minus expenses (may be negative). */
export function net(income: number, expenses: number): number {
  return income - expenses;
}

// ── Stripe month-to-date helpers (pure; the connector feeds in raw charges) ──

/** Unix seconds for the first instant of `now`'s calendar month (UTC). */
export function monthStartUnix(now: Date): number {
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
}

/** Sum only the charges that actually settled (paid + succeeded). */
export function sumChargeIncome(
  charges: { amount: number; currency: string; paid: boolean; status: string }[],
): { amountCents: number; currency: string; count: number } {
  let amountCents = 0;
  let count = 0;
  let currency = 'usd';
  for (const c of charges) {
    if (c.paid && c.status === 'succeeded') {
      amountCents += c.amount;
      count += 1;
      currency = c.currency;
    }
  }
  return { amountCents, currency, count };
}
