import Stripe from 'stripe';
import type { ConnectorStatus } from '@/lib/connectors/types';
import { monthStartUnix, sumChargeIncome, type OutgoingTransfer } from '@/lib/finances';

export type ProcessorInfo = { id: string; name: string; configured: boolean };

/**
 * Payment processor registry — the real set Alex runs money through. Ids
 * match `incomeAccounts` so the finances page can light each card by config.
 * Stripe has a full implementation; the others register here (honest pending)
 * so the connections board shows what is wired vs pending — add a client +
 * status branch when their keys land.
 */
export function configuredProcessors(env: Record<string, string | undefined>): ProcessorInfo[] {
  return [
    { id: 'stripe', name: 'Stripe', configured: Boolean(env.STRIPE_SECRET_KEY) },
    {
      id: 'paypal',
      name: 'PayPal',
      configured: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
    },
    { id: 'fanbasis-vantage', name: 'FanBasis · Vantage', configured: Boolean(env.FANBASIS_VANTAGE_KEY) },
    { id: 'fanbasis-lc', name: 'FanBasis · Launchpad Cohort', configured: Boolean(env.FANBASIS_LC_KEY) },
    { id: 'wise-1', name: 'Wise · Account 1', configured: Boolean(env.WISE_1_TOKEN) },
    { id: 'wise-2', name: 'Wise · Account 2', configured: Boolean(env.WISE_2_TOKEN) },
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

/** Recent outgoing Wise transfers across both accounts. Returns null when no
    Wise token is set (so the page hides the section); [] when keyed but nothing
    to show; a list when transfers come back. Guarded — errors → null. */
export async function wiseOutgoing(
  env: Record<string, string | undefined> = process.env,
): Promise<OutgoingTransfer[] | null> {
  const tokens = [env.WISE_1_TOKEN, env.WISE_2_TOKEN].filter((t): t is string => Boolean(t));
  if (tokens.length === 0) return null;
  try {
    const all: OutgoingTransfer[] = [];
    for (const token of tokens) {
      const res = await fetch('https://api.wise.com/v1/transfers?limit=10', {
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

// ── FanBasis ────────────────────────────────────────────────────────────────
// FanBasis exposes no global payments list (transactions are per checkout
// session), but `/public-api/customers` carries each customer's lifetime
// total_spent + last_transaction_date. We approximate month income by summing
// the spend of customers whose latest transaction is in that month — exact for
// the one-time mentorship/course purchases that dominate this account.

const FANBASIS_API = 'https://www.fanbasis.com/public-api';

export function parseFanbasisCustomers(raw: unknown): { totalSpentCents: number; month: string | null }[] {
  const arr = (raw as { data?: { customers?: unknown } })?.data?.customers;
  if (!Array.isArray(arr)) return [];
  return arr.map((row) => {
    const c = (row ?? {}) as Record<string, unknown>;
    const amt = Number(String(c.total_spent ?? '').replace(/,/g, ''));
    const d = typeof c.last_transaction_date === 'string' ? c.last_transaction_date.slice(0, 7) : null;
    return { totalSpentCents: Number.isFinite(amt) ? Math.round(amt * 100) : 0, month: d };
  });
}

export function sumFanbasisMonthCents(
  customers: { totalSpentCents: number; month: string | null }[],
  month: string,
): number {
  return customers.reduce((sum, c) => (c.month === month ? sum + c.totalSpentCents : sum), 0);
}

/** Month-to-date FanBasis income (USD) for an account's API key, or null when
    unkeyed / unreachable. Paginates /customers (x-api-key) until an empty page. */
export async function fanbasisMonthToDateIncome(
  apiKey: string | undefined,
  month: string = new Date().toISOString().slice(0, 10).slice(0, 7),
): Promise<number | null> {
  if (!apiKey) return null;
  try {
    const all: { totalSpentCents: number; month: string | null }[] = [];
    for (let page = 1; page <= 50; page++) {
      const res = await fetch(`${FANBASIS_API}/customers?page=${page}&per_page=100`, {
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) break;
      const parsed = parseFanbasisCustomers(await res.json());
      if (parsed.length === 0) break;
      all.push(...parsed);
    }
    return sumFanbasisMonthCents(all, month) / 100;
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
  const key = env.STRIPE_SECRET_KEY;
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
