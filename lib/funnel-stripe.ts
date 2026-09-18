/**
 * Stripe seam — real payment wins for the funnel's converted stage. Pulls
 * recent successful charges from both Stripe accounts (Launchpad Cohort on
 * STRIPE_SECRET_KEY, Vantage on STRIPE_VANTAGE_KEY), matches them onto
 * existing journeys by customer email — same contact-matching spirit as
 * mergeTrakyoTouches — and keeps unmatched charges as standalone converted
 * wins, because real money must never be dropped just because no CRM row
 * exists. Honest degradation: an unkeyed or unreachable account is skipped;
 * null only when NO account answered, so the route's source strip stays true.
 */
import Stripe from 'stripe';
import {
  FunnelJourneySchema,
  type FunnelJourney,
  type FunnelTouch,
  type FunnelVenture,
} from '@/lib/schemas';

/** One settled Stripe charge, reduced to what the funnel needs. */
export type StripeWin = {
  id: string; // charge id
  venture: FunnelVenture;
  email: string | null;
  name: string | null; // customer name when Stripe captured one
  amountUsd: number;
  product: string | null; // charge description when Stripe carried one
  at: string; // YYYY-MM-DD of the charge
};

/** The slice of Stripe's charge shape we read (customer expanded). */
export type StripeChargeSlice = {
  id: string;
  amount: number; // cents
  paid: boolean;
  status: string;
  refunded?: boolean;
  created: number; // unix seconds
  description?: string | null;
  receipt_email?: string | null;
  billing_details?: { email?: string | null; name?: string | null } | null;
  customer?: string | { email?: string | null; name?: string | null; deleted?: boolean } | null;
};

const norm = (s: string) => s.trim().toLowerCase();

const clean = (v: string | null | undefined): string | null => {
  const t = typeof v === 'string' ? v.trim() : '';
  return t.length > 0 ? t : null;
};

/**
 * Pure mapper: raw charges → wins. Only money that actually settled counts
 * (paid + succeeded, not refunded); identity falls through billing details →
 * receipt email → the expanded customer, and a charge with no identity at all
 * still surfaces — it's real revenue either way, just anonymously named.
 */
export function mapStripeCharges(charges: StripeChargeSlice[], venture: FunnelVenture): StripeWin[] {
  const out: StripeWin[] = [];
  for (const c of charges) {
    if (!c.paid || c.status !== 'succeeded' || c.refunded) continue;
    if (!(c.amount > 0) || typeof c.created !== 'number') continue;
    const cust = typeof c.customer === 'object' && c.customer && !c.customer.deleted ? c.customer : null;
    const email = clean(c.billing_details?.email) ?? clean(c.receipt_email) ?? clean(cust?.email);
    const name = clean(c.billing_details?.name) ?? clean(cust?.name);
    out.push({
      id: c.id,
      venture,
      email,
      name,
      amountUsd: c.amount / 100,
      product: clean(c.description),
      at: new Date(c.created * 1000).toISOString().slice(0, 10),
    });
  }
  return out;
}

const winLabel = (w: StripeWin): string =>
  `Stripe payment $${w.amountUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}${
    w.product ? ` — ${w.product}` : ''
  }`;

/**
 * Fold payment wins into the funnel. A win matched to a journey by any shared
 * identity (email first, but CRM deals named by email/person count too — the
 * mergeTrakyoTouches spirit) marks it converted at likelihood 100, appends a
 * `checkout` touch dated at the charge, and carries the paid amount (the
 * larger of CRM deal value vs money actually collected — a deposit must not
 * shrink a known deal). Wins with no matching journey become standalone
 * converted journeys, grouped per customer email so repeat payments read as
 * one client with several checkout touches.
 */
export function mergeStripeWins(journeys: FunnelJourney[], wins: StripeWin[]): FunnelJourney[] {
  if (wins.length === 0) return journeys;

  const journeyByIdentity = new Map<string, string>();
  for (const j of journeys) {
    for (const id of [j.email, j.name, j.person]) {
      if (!id) continue;
      const k = norm(id);
      if (k && !journeyByIdentity.has(k)) journeyByIdentity.set(k, j.id); // first journey wins
    }
  }

  const matched = new Map<string, StripeWin[]>(); // journey id → its payments
  const orphans = new Map<string, StripeWin[]>(); // customer key → payments
  for (const w of wins) {
    const jid = [w.email, w.name]
      .filter((v): v is string => Boolean(v))
      .map((v) => journeyByIdentity.get(norm(v)))
      .find(Boolean);
    const bucket = jid ? matched : orphans;
    const key = jid ?? (w.email ? `${w.venture}:${norm(w.email)}` : w.id);
    bucket.set(key, [...(bucket.get(key) ?? []), w]);
  }

  const byDate = (a: StripeWin, b: StripeWin) => a.at.localeCompare(b.at);

  const merged = journeys.map((j) => {
    const payments = matched.get(j.id)?.sort(byDate);
    if (!payments) return j;
    const paidUsd = payments.reduce((sum, w) => sum + w.amountUsd, 0);
    const touches: FunnelTouch[] = [
      ...j.touches,
      ...payments.map((w, i) => ({
        id: `${j.id}-stripe-${w.id}`,
        contactId: j.id,
        seq: j.touches.length + i + 1,
        stage: 'converted' as const,
        channel: 'checkout' as const,
        label: winLabel(w),
        source: 'stripe' as const,
        at: w.at,
      })),
    ];
    return {
      ...j,
      status: 'converted' as const,
      relationship: 'hot' as const, // they paid — no warmer signal exists
      likelihood: 100,
      product: j.product ?? payments.find((w) => w.product)?.product ?? null,
      amountUsd: Math.max(j.amountUsd ?? 0, paidUsd),
      touches,
    };
  });

  const standalone: FunnelJourney[] = [];
  for (const group of orphans.values()) {
    group.sort(byDate);
    const first = group[0];
    const id = `stripe-${first.id}`;
    try {
      standalone.push(
        FunnelJourneySchema.parse({
          id,
          name: first.name ?? first.email ?? 'Stripe customer',
          venture: first.venture,
          status: 'converted',
          product: group.find((w) => w.product)?.product ?? null,
          amountUsd: group.reduce((sum, w) => sum + w.amountUsd, 0),
          relationship: 'hot', // they paid — no warmer signal exists
          likelihood: 100,
          url: null,
          email: first.email,
          phone: null,
          person: null,
          company: null,
          role: null,
          linkedin: null,
          createdAt: first.at,
          touches: group.map((w, i) => ({
            id: `${id}-t${i + 1}`,
            contactId: id,
            seq: i + 1,
            stage: 'converted' as const,
            channel: 'checkout' as const,
            label: winLabel(w),
            source: 'stripe' as const,
            at: w.at,
          })),
        }),
      );
    } catch {
      // a malformed win is skipped, never fatal
    }
  }

  return [...merged, ...standalone];
}

/** How far back a payment still counts as a funnel win. */
export const STRIPE_WIN_DAYS = 90;

/**
 * The live pull — last 90d of charges from both accounts, paginated like
 * stripeMtdForKey. Each account degrades independently (missing key or API
 * failure → that account contributes nothing); null only when neither
 * answered, so the route can keep `stripe` out of its source strip honestly.
 */
export async function stripeFunnelWins(
  now = new Date(),
  env: Record<string, string | undefined> = process.env,
): Promise<StripeWin[] | null> {
  // FUNNEL_PROVIDER=seed pins the seeded funnel (tests, offline demos).
  if ((env.FUNNEL_PROVIDER ?? 'attio') !== 'attio') return null;
  const accounts: { key: string | undefined; venture: FunnelVenture }[] = [
    { key: env.STRIPE_SECRET_KEY, venture: 'launchpad-cohort' },
    { key: env.STRIPE_VANTAGE_KEY, venture: 'vantage' },
  ];
  const gte = Math.floor(now.getTime() / 1000) - STRIPE_WIN_DAYS * 86_400;
  const wins: StripeWin[] = [];
  let reachable = 0;
  for (const { key, venture } of accounts) {
    if (!key) continue;
    try {
      const stripe = new Stripe(key, { timeout: 8000 });
      const slices: StripeChargeSlice[] = [];
      let remaining = 2000; // safety cap (~20 pages of 100)
      for await (const c of stripe.charges.list({ created: { gte }, limit: 100, expand: ['data.customer'] })) {
        slices.push(c as unknown as StripeChargeSlice);
        if (--remaining <= 0) break;
      }
      wins.push(...mapStripeCharges(slices, venture));
      reachable++;
    } catch {
      // account down or key revoked — skip it, never break the funnel
    }
  }
  return reachable > 0 ? wins : null;
}
