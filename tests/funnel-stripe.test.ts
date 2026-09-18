import { describe, expect, test } from 'vitest';
import {
  mapStripeCharges,
  mergeStripeWins,
  stripeFunnelWins,
  type StripeChargeSlice,
  type StripeWin,
} from '@/lib/funnel-stripe';
import type { FunnelJourney } from '@/lib/schemas';

/** Charge shorthand — a clean settled $500 card charge unless overridden. */
const charge = (c: Partial<StripeChargeSlice> & Pick<StripeChargeSlice, 'id'>): StripeChargeSlice => ({
  amount: 50_000,
  paid: true,
  status: 'succeeded',
  refunded: false,
  created: Date.UTC(2026, 6, 15) / 1000, // 2026-07-15
  description: null,
  billing_details: null,
  customer: null,
  ...c,
});

/** Win shorthand for merge tests. */
const win = (w: Partial<StripeWin> & Pick<StripeWin, 'id'>): StripeWin => ({
  venture: 'launchpad-cohort',
  email: null,
  name: null,
  amountUsd: 500,
  product: null,
  at: '2026-07-15',
  ...w,
});

const journey = (id: string, name: string, over: Partial<FunnelJourney> = {}): FunnelJourney => ({
  id,
  name,
  venture: 'launchpad-cohort',
  status: 'opted_in',
  product: null,
  amountUsd: null,
  relationship: 'warm',
  likelihood: 60,
  url: null,
  email: null,
  phone: null,
  person: null,
  company: null,
  role: null,
  linkedin: null,
  createdAt: '2026-06-01',
  touches: [
    {
      id: `${id}-t1`, contactId: id, seq: 1, stage: 'first_touch',
      channel: 'crm', label: 'Deal created in Attio', source: 'attio', at: '2026-06-01',
    },
    {
      id: `${id}-t2`, contactId: id, seq: 2, stage: 'opted_in',
      channel: 'crm', label: 'Attio stage: Proposal Sent', source: 'attio', at: '2026-06-20',
    },
  ],
  ...over,
});

describe('mapStripeCharges', () => {
  test('maps a settled charge with billing identity, amount in dollars, dated day-of-charge', () => {
    const [w] = mapStripeCharges(
      [charge({ id: 'ch_1', billing_details: { email: 'drew@x.com', name: 'Riley' }, description: 'AI Accelerator' })],
      'launchpad-cohort',
    );
    expect(w).toEqual({
      id: 'ch_1',
      venture: 'launchpad-cohort',
      email: 'drew@x.com',
      name: 'Riley',
      amountUsd: 500,
      product: 'AI Accelerator',
      at: '2026-07-15',
    });
  });

  test('drops unpaid, failed, refunded, and zero charges — only landed money counts', () => {
    const wins = mapStripeCharges(
      [
        charge({ id: 'ch_unpaid', paid: false }),
        charge({ id: 'ch_failed', status: 'failed' }),
        charge({ id: 'ch_refunded', refunded: true }),
        charge({ id: 'ch_zero', amount: 0 }),
        charge({ id: 'ch_ok' }),
      ],
      'vantage',
    );
    expect(wins.map((w) => w.id)).toEqual(['ch_ok']);
    expect(wins[0].venture).toBe('vantage');
  });

  test('email falls through billing → receipt email → expanded customer; deleted/unexpanded give nothing', () => {
    const wins = mapStripeCharges(
      [
        charge({ id: 'ch_1', customer: { email: 'kay@x.com', name: 'Kay' } }),
        charge({ id: 'ch_2', receipt_email: 'rcpt@x.com' }),
        charge({ id: 'ch_3', customer: { deleted: true, email: 'gone@x.com' } }),
        charge({ id: 'ch_4', customer: 'cus_unexpanded' }),
      ],
      'vantage',
    );
    expect(wins[0]).toMatchObject({ email: 'kay@x.com', name: 'Kay' });
    expect(wins[1]).toMatchObject({ email: 'rcpt@x.com', name: null });
    expect(wins[2]).toMatchObject({ email: null, name: null });
    expect(wins[3]).toMatchObject({ email: null, name: null });
  });
});

describe('mergeStripeWins', () => {
  test('a win matched by journey email converts it and stamps a checkout touch at the charge', () => {
    const [j] = mergeStripeWins(
      [journey('j1', 'Riley Monroe', { email: 'riley@x.com' })],
      [win({ id: 'ch_1', email: 'Riley@X.com', product: 'AI Accelerator' })],
    );
    expect(j.status).toBe('converted');
    expect(j.relationship).toBe('hot');
    expect(j.likelihood).toBe(100);
    expect(j.product).toBe('AI Accelerator');
    expect(j.amountUsd).toBe(500);
    const last = j.touches.at(-1)!;
    expect(last).toMatchObject({ stage: 'converted', channel: 'checkout', source: 'stripe', at: '2026-07-15', seq: 3 });
    expect(last.label).toContain('$500');
    // the CRM transit is untouched
    expect(j.touches[0].source).toBe('attio');
    expect(j.touches).toHaveLength(3);
  });

  test('paid amount never sums onto a CRM deal value — the larger of the two wins', () => {
    const paidLess = mergeStripeWins(
      [journey('j1', 'A', { email: 'a@x.com', amountUsd: 10_000 })],
      [win({ id: 'ch_1', email: 'a@x.com', amountUsd: 2_000 })],
    )[0];
    expect(paidLess.amountUsd).toBe(10_000); // deposit on a bigger deal
    const paidMore = mergeStripeWins(
      [journey('j2', 'B', { email: 'b@x.com', amountUsd: 1_000 })],
      [win({ id: 'ch_2', email: 'b@x.com', amountUsd: 3_000 })],
    )[0];
    expect(paidMore.amountUsd).toBe(3_000);
  });

  test('an orphan charge becomes a standalone converted win instead of being dropped', () => {
    const merged = mergeStripeWins(
      [journey('j1', 'Someone Else')],
      [win({ id: 'ch_9', email: 'new@x.com', name: 'New Buyer', venture: 'vantage', product: 'Build sprint' })],
    );
    expect(merged).toHaveLength(2);
    const solo = merged[1];
    expect(solo).toMatchObject({
      id: 'stripe-ch_9',
      name: 'New Buyer',
      venture: 'vantage',
      status: 'converted',
      product: 'Build sprint',
      amountUsd: 500,
      email: 'new@x.com',
      relationship: 'hot',
      likelihood: 100,
    });
    expect(solo.touches).toHaveLength(1);
    expect(solo.touches[0]).toMatchObject({ stage: 'converted', channel: 'checkout', source: 'stripe' });
  });

  test('orphan charges group by customer email — one journey, one touch per charge, amounts summed', () => {
    const merged = mergeStripeWins(
      [],
      [
        win({ id: 'ch_a', email: 'repeat@x.com', amountUsd: 500, at: '2026-07-01' }),
        win({ id: 'ch_b', email: 'repeat@x.com', amountUsd: 250, at: '2026-07-20' }),
        win({ id: 'ch_c' }), // no identity at all — still real revenue, anonymously named
      ],
    );
    expect(merged).toHaveLength(2);
    const grouped = merged.find((j) => j.email === 'repeat@x.com')!;
    expect(grouped.amountUsd).toBe(750);
    expect(grouped.touches.map((t) => t.at)).toEqual(['2026-07-01', '2026-07-20']);
    expect(grouped.createdAt).toBe('2026-07-01');
    expect(merged.find((j) => j.id === 'stripe-ch_c')!.name).toBe('Stripe customer');
  });

  test('no wins → journeys pass through untouched', () => {
    const js = [journey('j1', 'A')];
    expect(mergeStripeWins(js, [])).toBe(js);
  });
});

describe('stripeFunnelWins', () => {
  test('null when no Stripe key is set — the funnel runs without the lane', async () => {
    expect(await stripeFunnelWins(new Date(), {})).toBeNull();
  });

  test('null when the provider is seed-pinned', async () => {
    expect(
      await stripeFunnelWins(new Date(), { FUNNEL_PROVIDER: 'seed', STRIPE_SECRET_KEY: 'sk_test_x' }),
    ).toBeNull();
  });
});
