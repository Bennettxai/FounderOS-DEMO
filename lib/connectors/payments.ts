import { GATED, connected as gatedConnected } from '@/lib/connectors/demo-status';
import Stripe from 'stripe';
import type { ConnectorStatus } from '@/lib/connectors/types';
import { monthStartUnix, sumChargeIncome, type OutgoingTransfer } from '@/lib/finances';

export type ProcessorInfo = { id: string; name: string; configured: boolean };

/**
 * Payment processor registry — the real set the operator runs money through. Ids
 * match `incomeAccounts` so the finances page can light each card by config.
 * Stripe has a full implementation; the others register here (honest pending)
 * so the connections board shows what is wired vs pending — add a client +
 * status branch when their keys land.
 */
export function configuredProcessors(env: Record<string, string | undefined>): ProcessorInfo[] {
  return [
    { id: 'stripe', name: 'Stripe', configured: Boolean(env.STRIPE_SECRET_KEY) },
    { id: 'stripe-vantage', name: 'Stripe · Vantage', configured: Boolean(env.STRIPE_VANTAGE_KEY) },
    {
      id: 'paypal',
      name: 'PayPal',
      configured: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
    },
    { id: 'paykit-vantage', name: 'PayKit · Vantage', configured: Boolean(env.PAYKIT_VANTAGE_KEY) },
    { id: 'paykit-lc', name: 'PayKit · Launchpad Cohort', configured: Boolean(env.PAYKIT_LC_KEY) },
    { id: 'wise-1', name: 'Wise', configured: Boolean(env.WISE_1_TOKEN) },
  ];
}

/** Map a Wise `/transfers` payload to outgoing transfers (money sent out).
    Pure + guarded; malformed rows are skipped, never invented. */
export function parseWiseTransfers(raw: unknown): OutgoingTransfer[] {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { transfers?: unknown })?.transfers)
      ? ((raw as { transfers: unknown[] }).transfers)
      : null;
  if (!arr) return [];
  const out: OutgoingTransfer[] = [];
  for (const row of arr) {
    const t = (row ?? {}) as Record<string, any>;
    const value = t.targetValue;
    const currency = t.targetCurrency;
    const created = t.created;
    if (typeof value !== 'number' || typeof currency !== 'string') continue;
    if (typeof created !== 'string' && typeof created !== 'number') continue;
    out.push({
      amountCents: Math.round(value * 100),
      currency,
      status: typeof t.status === 'string' ? t.status : 'unknown',
      created,
      ...(typeof t.reference === 'string' ? { reference: t.reference } : {}),
    });
  }
  return out;
}

/** Recent outgoing Wise transfers. Returns null when no Wise token is set (so
    the page hides the section); [] when keyed but nothing to show; a list when
    transfers come back. Guarded — errors → null. */
export async function wiseOutgoing(
  env: Record<string, string | undefined> = process.env,
): Promise<OutgoingTransfer[] | null> {
  const tokens = [env.WISE_1_TOKEN].filter((t): t is string => Boolean(t));
  if (tokens.length === 0) return null;
  try {
    const all: OutgoingTransfer[] = [];
    for (const token of tokens) {
      const res = await fetch('https://api.wise.com/v1/transfers?limit=10', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      all.push(...parseWiseTransfers(await res.json()));
    }
    return all;
  } catch {
    return null;
  }
}

// ── PayKit ────────────────────────────────────────────────────────────────
// PayKit exposes no global payments list (transactions are per checkout
// session), and `/customers` + `/products` are the ONLY two endpoints the
// public API has — ~42 other paths were probed and every one 404s, so there is
// no per-transaction feed to fall back on. What `/customers` carries is each
// customer's LIFETIME total_spent, their total_transactions, and the date of
// their LATEST transaction.
//
// That shape supports an exact month figure for one-time buyers and nothing
// better than a bound for repeat buyers. This used to add each customer's whole
// lifetime spend into the month of their last transaction, on the assumption
// that one-time purchases dominate the account. That assumption fails as soon as
// a single recurring plan exists: a repeat buyer's payment then lands the whole
// lifetime total in one month and doubles the figure the board shows. Months
// read as exact only when every buyer in them happened to be single-transaction,
// which is luck, not a guarantee.
//
// So we no longer guess. A month reports the EXACT floor it can prove, plus an
// upper bound and a count of the customers whose split is unavailable. Callers
// render the band rather than a confident wrong number.

const PAYKIT_API = 'https://www.paykit.com/public-api';

export type PaykitCustomer = {
  /** Stable PayKit customer id — the key snapshot differencing joins on. Empty
      string when the row carries none, which leaves the row undiffable rather
      than silently merging it with another customer. */
  id: string;
  totalSpentCents: number; // LIFETIME spend, not this month's
  month: string | null; // month of their LATEST transaction
  transactions: number; // lifetime transaction count; 1 ⇒ spend is splittable
  /** `last_transaction_date` verbatim (PayKit sends a local offset). Kept
      alongside `month` because differencing has to DATE a single new
      transaction, not merely bucket it. Null when absent. */
  lastTransactionDate: string | null;
};

export function parsePaykitCustomers(raw: unknown): PaykitCustomer[] {
  const arr = (raw as { data?: { customers?: unknown } })?.data?.customers;
  if (!Array.isArray(arr)) return [];
  return arr.map((row) => {
    const c = (row ?? {}) as Record<string, unknown>;
    const amt = Number(String(c.total_spent ?? '').replace(/,/g, ''));
    const at = typeof c.last_transaction_date === 'string' ? c.last_transaction_date : null;
    const n = Number(c.total_transactions);
    return {
      id: c.id == null ? '' : String(c.id),
      totalSpentCents: Number.isFinite(amt) ? Math.round(amt * 100) : 0,
      month: at ? at.slice(0, 7) : null,
      // Unknown/absent count is treated as repeat, i.e. unsplittable. Assuming
      // "1" here would silently re-introduce the overstatement it replaces.
      transactions: Number.isFinite(n) && n >= 1 ? Math.round(n) : 0,
      lastTransactionDate: at,
    };
  });
}

/** Upper bound for a month: every dollar that COULD have landed in it — the
    lifetime spend of every customer whose latest transaction is in that month.
    This was the old (single, overstated) figure; it is now only the ceiling. */
export function sumPaykitMonthCents(customers: PaykitCustomer[], month: string): number {
  return customers.reduce((sum, c) => (c.month === month ? sum + c.totalSpentCents : sum), 0);
}

export type PaykitMonthIncome = {
  /** Proven floor: customers whose ONLY transaction is in this month, so their
      lifetime spend and their spend this month are the same number. */
  exactCents: number;
  /** Ceiling: the floor plus the full lifetime spend of every repeat customer
      last seen this month. Equals `exactCents` when nothing is unsplittable. */
  upperCents: number;
  /** Repeat customers last seen this month whose per-month split the API cannot
      supply. Zero ⇒ `exactCents` is the whole truth and the band collapses. */
  unsplittableCustomers: number;
};

/** Split a month into what is proven and what is merely possible. */
export function paykitMonthIncomeCents(
  customers: PaykitCustomer[],
  month: string,
): PaykitMonthIncome {
  let exactCents = 0;
  let upperCents = 0;
  let unsplittableCustomers = 0;
  for (const c of customers) {
    if (c.month !== month) continue;
    upperCents += c.totalSpentCents;
    if (c.transactions === 1) exactCents += c.totalSpentCents;
    else unsplittableCustomers += 1;
  }
  return { exactCents, upperCents, unsplittableCustomers };
}

// ── Snapshot differencing: the exactness the lifetime band cannot reach ──────
//
// /customers is a running TOTAL per customer. Two reads of it a day apart
// therefore bracket exactly the money that moved in between — no per-transaction
// endpoint required, which is fortunate because there isn't one. Store what the
// finances page already fetches and a month stops being a band and becomes a
// subtraction.
//
// Worked example, and the reason this card exists:
//   day one    8 customers · 12 txns · $29,000
//   day two    8 customers · 13 txns · $30,000
//   delta      +1 txn · +$1,000  ⇒  one customer, dated by their latest txn
// The lifetime band could only say the month was somewhere in $0 – $2,000.
//
// This is exact GOING FORWARD ONLY. A month is answerable here only when a
// snapshot exists from BEFORE it started; earlier months keep the lifetime band,
// which already states its own uncertainty honestly. Never backfill a month the
// snapshots do not cover.

export type PaykitSnapshot = {
  /** UTC date of the pull, YYYY-MM-DD. One snapshot per day — a later pull the
      same day replaces the earlier one, since it is strictly more current. */
  capturedOn: string;
  /** 'live' = read from the API. 'reconstructed' = derived from an aggregate
      recorded elsewhere and never measured per customer. Kept distinct so an
      inference can never be mistaken for a measurement. */
  source: 'live' | 'reconstructed';
  customers: PaykitCustomer[];
};

/** Every YYYY-MM touched by the inclusive date range, oldest first. */
export function monthsSpanned(fromDate: string, toDate: string): string[] {
  const months: string[] = [];
  let [y, m] = [Number(fromDate.slice(0, 4)), Number(fromDate.slice(5, 7))];
  const end = toDate.slice(0, 7);
  for (let guard = 0; guard < 1200; guard++) {
    const cur = `${y}-${String(m).padStart(2, '0')}`;
    months.push(cur);
    if (cur >= end) break;
    if (++m > 12) [y, m] = [y + 1, 1];
  }
  return months;
}

/** Money proven to have moved between two consecutive snapshots, attributed to
    months where that attribution is forced and left ambiguous where it isn't.
    `exactCents` is money whose month is certain; `upperCents` adds money known
    to have moved in the window but not pinnable to one month inside it. */
export type PaykitWindowDelta = {
  exactCents: Record<string, number>;
  upperCents: Record<string, number>;
  /** Customers whose delta straddles a month boundary unresolvably. */
  ambiguousCustomers: number;
};

/**
 * Difference two snapshots. A customer's attribution is EXACT when either:
 *
 *   - the window lies inside one calendar month — then every dollar that moved
 *     in it belongs to that month, whatever the transaction count; or
 *   - exactly one transaction was added — then that transaction IS the customer's
 *     latest, so `lastTransactionDate` dates it precisely.
 *
 * Otherwise (several transactions across a month boundary) the money is real but
 * its split is not knowable, so it raises the ceiling and never the floor —
 * the same discipline as the lifetime band, applied to a much smaller residue.
 *
 * A customer absent from `prev` is treated as new, so their whole lifetime spend
 * moved in the window. A DECREASE (a refund reducing lifetime spend) is reported
 * in neither figure: the month it reverses is unknowable, and guessing would
 * understate a month that was never credited in the first place.
 */
export function diffPaykitSnapshots(
  prev: PaykitSnapshot,
  curr: PaykitSnapshot,
): PaykitWindowDelta {
  const before = new Map(prev.customers.map((c) => [c.id, c]));
  const window = monthsSpanned(prev.capturedOn, curr.capturedOn);
  const exactCents: Record<string, number> = {};
  const upperCents: Record<string, number> = {};
  let ambiguousCustomers = 0;

  const add = (into: Record<string, number>, month: string, cents: number) => {
    into[month] = (into[month] ?? 0) + cents;
  };

  for (const c of curr.customers) {
    const was = before.get(c.id);
    const deltaCents = c.totalSpentCents - (was?.totalSpentCents ?? 0);
    const deltaTxns = c.transactions - (was?.transactions ?? 0);
    if (deltaCents <= 0) continue;

    // Forced attribution, case 1: the whole window is one month.
    if (window.length === 1) {
      add(exactCents, window[0], deltaCents);
      add(upperCents, window[0], deltaCents);
      continue;
    }
    // Forced attribution, case 2: one new transaction, and we hold its date.
    const dated = deltaTxns === 1 && c.lastTransactionDate ? c.lastTransactionDate.slice(0, 7) : null;
    if (dated && window.includes(dated)) {
      add(exactCents, dated, deltaCents);
      add(upperCents, dated, deltaCents);
      continue;
    }
    // Unresolvable: the money moved, but inside a multi-month window we cannot
    // say when. It bounds every candidate month and proves none of them.
    ambiguousCustomers += 1;
    for (const m of window) add(upperCents, m, deltaCents);
  }

  return { exactCents, upperCents, ambiguousCustomers };
}

/**
 * A month's income computed by differencing a snapshot history, or null when the
 * history cannot answer for that month.
 *
 * Null means "not covered": there is no snapshot from before the month began, so
 * money that moved early in it is invisible to differencing and any figure here
 * would understate without saying so. The caller falls back to the lifetime
 * band, which is wide but honest. Trailing coverage is the caller's
 * job — record the current pull as today's snapshot BEFORE calling this, or the
 * month is short by everything since the last stored snapshot.
 */
export function paykitMonthFromSnapshots(
  snapshots: PaykitSnapshot[],
  month: string,
): PaykitMonthIncome | null {
  const ordered = [...snapshots].sort((a, b) => a.capturedOn.localeCompare(b.capturedOn));
  if (ordered.length < 2) return null;
  // Strictly before the 1st: a snapshot taken ON the 1st may already contain
  // money that moved earlier that day, which would then be attributed to the
  // previous month's window instead.
  if (ordered[0].capturedOn >= `${month}-01`) return null;

  let exactCents = 0;
  let upperCents = 0;
  let unsplittableCustomers = 0;
  for (let i = 1; i < ordered.length; i++) {
    const delta = diffPaykitSnapshots(ordered[i - 1], ordered[i]);
    exactCents += delta.exactCents[month] ?? 0;
    const upper = delta.upperCents[month] ?? 0;
    upperCents += upper;
    if (delta.ambiguousCustomers > 0 && upper > (delta.exactCents[month] ?? 0)) {
      unsplittableCustomers += delta.ambiguousCustomers;
    }
  }
  return { exactCents, upperCents, unsplittableCustomers };
}

export type PaykitMonthIncomeUsd = {
  exactUsd: number;
  upperUsd: number;
  unsplittableCustomers: number;
};

/** Where daily /customers snapshots are kept. A port, not an import, so this
    module stays free of the DB and the arithmetic above stays unit-testable. */
export type PaykitHistoryPort = {
  /** Store one day's pull, replacing any earlier pull from the same day. */
  record(snapshot: PaykitSnapshot): void;
  /** Every stored snapshot, any order. */
  snapshots(): PaykitSnapshot[];
};

/** Month-to-date PayKit income for an account's API key, or null when unkeyed
    / unreachable. Paginates /customers (x-api-key) until an empty page.

    With a `history` port the month is computed by SNAPSHOT DIFFERENCING and is
    exact: two reads of a running lifetime total bracket the money that moved
    between them. Without one — or for a month that began before the
    first stored snapshot — it falls back to the lifetime band, where
    `exactUsd` is the floor the API alone can prove and `upperUsd` the ceiling,
    `unsplittableCustomers` naming how many repeat buyers sit between them. When
    that count is 0 the two are equal and the figure is exact. Never emit
    `upperUsd` alone — that is the bug this replaces.

    Recording is best-effort: a store that throws costs precision, never the
    figure, so a broken disk degrades to the band rather than to null.

    Any non-OK response returns null, never a fake $0: a stale key on the host
    once rendered "live · $0 this month" over $4,500 of real August income
    (the operator caught it by hand, 2026-08-16). Pagination ends on an EMPTY page;
    an HTTP error mid-run means the sum would be a lie, so it is discarded. */
export async function paykitMonthToDateIncome(
  apiKey: string | undefined,
  month: string = new Date().toISOString().slice(0, 10).slice(0, 7),
  history?: PaykitHistoryPort,
): Promise<PaykitMonthIncomeUsd | null> {
  if (!apiKey) return null;
  try {
    const all: PaykitCustomer[] = [];
    for (let page = 1; page <= 50; page++) {
      const res = await fetch(`${PAYKIT_API}/customers?page=${page}&per_page=100`, {
        cache: 'no-store',
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const parsed = parsePaykitCustomers(await res.json());
      if (parsed.length === 0) break;
      all.push(...parsed);
    }

    if (history) {
      try {
        // Record first, then difference, so this pull closes the trailing edge
        // of the window — otherwise the month is short by everything that
        // arrived since the last stored snapshot.
        history.record({
          capturedOn: new Date().toISOString().slice(0, 10),
          source: 'live',
          customers: all,
        });
        const differenced = paykitMonthFromSnapshots(history.snapshots(), month);
        if (differenced) {
          return {
            exactUsd: differenced.exactCents / 100,
            upperUsd: differenced.upperCents / 100,
            unsplittableCustomers: differenced.unsplittableCustomers,
          };
        }
      } catch {
        // Fall through to the band. Losing exactness is not worth losing the
        // number for.
      }
    }

    const { exactCents, upperCents, unsplittableCustomers } = paykitMonthIncomeCents(all, month);
    return { exactUsd: exactCents / 100, upperUsd: upperCents / 100, unsplittableCustomers };
  } catch {
    return null;
  }
}

export type StripeSnapshot = {
  available: { amount: number; currency: string }[];
  pending: { amount: number; currency: string }[];
  recentCharges: { amount: number; currency: string; description: string; created: number }[];
};

export type IncomeMtd = { amountCents: number; currency: string; count: number };

/**
 * Real month-to-date gross income from Stripe — the sum of charges that
 * settled (paid + succeeded) since the first of the current month. Returns
 * null when Stripe isn't configured, so the page shows honest pending.
 * Auto-paginates, capped to avoid a runaway on a very busy account.
 */
export async function monthToDateIncome(
  env: Record<string, string | undefined> = process.env,
): Promise<IncomeMtd | null> {
  return stripeMtdForKey(env.STRIPE_SECRET_KEY);
}

/**
 * Same month-to-date sum for a SPECIFIC Stripe account key — the operator runs one
 * Stripe per business (Launchpad Cohort on STRIPE_SECRET_KEY, Vantage on
 * STRIPE_VANTAGE_KEY). Null when unkeyed so the card stays honest pending.
 */
export async function stripeMtdForKey(key: string | undefined): Promise<IncomeMtd | null> {
  if (!key) return null;
  const stripe = new Stripe(key);
  const gte = monthStartUnix(new Date());
  const charges: { amount: number; currency: string; paid: boolean; status: string }[] = [];
  let remaining = 2000; // safety cap (~20 pages of 100)
  for await (const c of stripe.charges.list({ created: { gte }, limit: 100 })) {
    charges.push({ amount: c.amount, currency: c.currency, paid: c.paid, status: c.status });
    if (--remaining <= 0) break;
  }
  return sumChargeIncome(charges);
}

export async function stripeSnapshot(env: Record<string, string | undefined> = process.env): Promise<StripeSnapshot> {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  const stripe = new Stripe(key);
  const [balance, charges] = await Promise.all([
    stripe.balance.retrieve(),
    stripe.charges.list({ limit: 5 }),
  ]);
  return {
    available: balance.available.map((b) => ({ amount: b.amount, currency: b.currency })),
    pending: balance.pending.map((b) => ({ amount: b.amount, currency: b.currency })),
    recentCharges: charges.data.map((c) => ({
      amount: c.amount,
      currency: c.currency,
      description: c.description ?? c.id,
      created: c.created,
    })),
  };
}

export async function paymentsStatus(env: Record<string, string | undefined> = process.env): Promise<ConnectorStatus> {
  if (GATED) return gatedConnected('payments', 'Payments', 'payments', 'Stripe + PayKit');
  const processors = configuredProcessors(env);
  const configured = processors.filter((p) => p.configured);
  if (configured.length === 0) {
    return {
      id: 'payments',
      name: 'Payment Processors',
      kind: 'payments',
      state: 'not_configured',
      detail: `None of ${processors.length} processors configured. Start with STRIPE_SECRET_KEY in .env.local.`,
      meta: { configured: 0, known: processors.length },
    };
  }
  // Live-verify Stripe when configured; other processors count as configured-only until implemented.
  if (configured.some((p) => p.id === 'stripe')) {
    try {
      const snapshot = await stripeSnapshot(env);
      const available = snapshot.available[0];
      return {
        id: 'payments',
        name: 'Payment Processors',
        kind: 'payments',
        state: 'connected',
        detail: `${configured.map((p) => p.name).join(', ')} · Stripe available balance ${(
          (available?.amount ?? 0) / 100
        ).toFixed(2)} ${(available?.currency ?? 'usd').toUpperCase()}`,
        meta: { configured: configured.length },
      };
    } catch (err) {
      return {
        id: 'payments',
        name: 'Payment Processors',
        kind: 'payments',
        state: 'error',
        detail: `Stripe key set but verification failed: ${err instanceof Error ? err.message : String(err)}`,
        meta: { configured: configured.length },
      };
    }
  }
  return {
    id: 'payments',
    name: 'Payment Processors',
    kind: 'payments',
    state: 'connected',
    detail: `${configured.map((p) => p.name).join(', ')} configured`,
    meta: { configured: configured.length },
  };
}
