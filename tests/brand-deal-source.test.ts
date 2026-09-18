import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { BrandDealSchema, type BrandDeal } from '@/lib/schemas';

/**
 * the operator, 2026-08-19: "We're not using Notion. I'm gonna build my own
 * documents page inside the intelligence and I'm gonna have my own Notion."
 *
 * So brand deals live in the OS from here on. This is that store: the agent
 * reads it, and whatever the operator builds in Intelligence writes to it. The
 * Notion connector stays where it is for the existing /brand-deals board, but
 * nothing new is allowed to depend on it.
 */
let db: FounderDb;
afterEach(() => db?.close());

const deal = (over: Partial<BrandDeal> = {}): BrandDeal =>
  BrandDealSchema.parse({
    id: 'bd-1',
    brand: 'Acme',
    status: 'New',
    tier: null,
    dealValueUsd: null,
    budgetUsd: null,
    amountAgreedUsd: null,
    suggestedRateUsd: null,
    paidInFull: false,
    deadline: null,
    followUpDate: null,
    contactName: null,
    contactEmail: null,
    mainChannel: null,
    videoType: null,
    source: null,
    icpFit: null,
    notionUrl: 'os://brand-deals/bd-1',
    lastEdited: '2026-08-19T00:00:00.000Z',
    seeded: false,
    ...over,
  });

describe('the OS brand deal store', () => {
  test('an empty OS has no deals, and says so rather than inventing any', () => {
    db = openDb(':memory:');
    expect(db.brandDeals.all()).toEqual([]);
  });

  test('a deal round-trips through SQLite intact', () => {
    db = openDb(':memory:');
    const d = deal({ amountAgreedUsd: 6500, contactEmail: 'sarah@acme.com', deadline: '2026-09-01' });
    db.brandDeals.upsert(d);
    expect(db.brandDeals.all()).toEqual([d]);
  });

  test('upsert is idempotent on id, so re-ingesting cannot duplicate a deal', () => {
    db = openDb(':memory:');
    db.brandDeals.upsert(deal());
    db.brandDeals.upsert(deal({ status: 'Negotiating' }));
    const all = db.brandDeals.all();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('Negotiating');
  });

  test('deals come back newest-edited first, which is the order the agent works', () => {
    db = openDb(':memory:');
    db.brandDeals.upsert(deal({ id: 'old', lastEdited: '2026-08-01T00:00:00.000Z' }));
    db.brandDeals.upsert(deal({ id: 'new', lastEdited: '2026-08-19T00:00:00.000Z' }));
    expect(db.brandDeals.all().map((d) => d.id)).toEqual(['new', 'old']);
  });

  test('a deal can be removed when it turns out not to be one', () => {
    db = openDb(':memory:');
    db.brandDeals.upsert(deal());
    db.brandDeals.remove('bd-1');
    expect(db.brandDeals.all()).toEqual([]);
  });
});
