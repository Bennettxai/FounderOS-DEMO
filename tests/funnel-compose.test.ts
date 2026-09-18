import { describe, it, expect } from 'vitest';
import { composeFunnelJourneys, type FunnelComposeDeps } from '@/lib/funnel-compose';
import type { StripeWin } from '@/lib/funnel-stripe';
import type { FunnelJourney } from '@/lib/schemas';

/**
 * The funnel page and the /api/funnel route used to assemble journeys
 * independently, and the page's copy never folded in Stripe wins — so every
 * cohort buyer who paid was invisible on the page. composeFunnelJourneys is
 * the single path both now share; these tests pin that Stripe payments always
 * make it into the result.
 */

const win = (over: Partial<StripeWin> = {}): StripeWin => ({
  id: 'ch_1',
  venture: 'launchpad-cohort',
  email: 'buyer@example.com',
  name: 'Cohort Buyer',
  amountUsd: 1497,
  product: 'FounderOS Cohort',
  at: '2026-08-10',
  ...over,
});

const deps = (over: Partial<FunnelComposeDeps> = {}): FunnelComposeDeps => ({
  attio: async () => null,
  ghl: async () => null,
  stripe: async () => [],
  trakyo: async () => [],
  seed: () => [],
  ...over,
});

describe('composeFunnelJourneys', () => {
  it('surfaces a Stripe buyer with no CRM row as a converted journey (the page-drift bug)', async () => {
    const c = await composeFunnelJourneys(new Date('2026-08-11'), undefined, deps({ stripe: async () => [win()] }));
    expect(c.isLive).toBe(true);
    const buyer = c.journeys.find((j) => j.email === 'buyer@example.com');
    expect(buyer).toBeTruthy();
    expect(buyer!.status).toBe('converted');
    expect(buyer!.amountUsd).toBe(1497);
  });

  it('only counts as live off Stripe alone even when no CRM source answered', async () => {
    const c = await composeFunnelJourneys(new Date('2026-08-11'), undefined, deps({ stripe: async () => [win()] }));
    expect(c.isLive).toBe(true);
    expect(c.attioLive).toBeNull();
    expect(c.ghlLive).toBeNull();
  });

  it('filters journeys to the requested venture', async () => {
    const c = await composeFunnelJourneys(
      new Date('2026-08-11'),
      'vantage',
      deps({ stripe: async () => [win({ id: 'ch_aa', venture: 'launchpad-cohort' })] }),
    );
    expect(c.journeys.every((j) => j.venture === 'vantage')).toBe(true);
  });

  it('falls back to seed when nothing is live', async () => {
    const seeded = [{ id: 'seed-1' }] as unknown as FunnelJourney[];
    const c = await composeFunnelJourneys(new Date('2026-08-11'), undefined, deps({ seed: () => seeded }));
    expect(c.isLive).toBe(false);
    expect(c.journeys).toBe(seeded);
  });
});
