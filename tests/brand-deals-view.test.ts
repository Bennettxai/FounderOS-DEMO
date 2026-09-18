import { describe, expect, test } from 'vitest';
import type { BrandDeal } from '@/lib/schemas';
import {
  activitySeries,
  bucketOf,
  dealUsd,
  dueSoon,
  filterDeals,
  funnelStages,
  matchesFilter,
  parseQuery,
  sizeMatrix,
  timeAgo,
  volume,
} from '@/lib/brand-deals-view';

/**
 * The Slab "Deal Journeys" slab, fed by Notion instead of the bdpilot
 * daemon. Every number the slab shows is derived here, pure and testable,
 * from the BrandDeal rows the Notion connector already validates.
 */
const NOW = new Date('2026-09-17T12:00:00.000Z');

function deal(over: Partial<BrandDeal> & { id: string; brand: string }): BrandDeal {
  return {
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
    notionUrl: 'https://www.notion.so/x',
    lastEdited: '2026-09-16T09:00:00.000Z',
    seeded: false,
    ...over,
  };
}

const DEALS: BrandDeal[] = [
  deal({ id: 'a', brand: 'Notion', status: 'Negotiating', tier: 'S', dealValueUsd: 6000, followUpDate: '2026-09-18', contactName: 'Sam Rivera', mainChannel: 'Instagram', lastEdited: '2026-09-17T08:00:00.000Z' }),
  deal({ id: 'b', brand: 'Framer', status: 'New', tier: 'A', suggestedRateUsd: 4000, followUpDate: '2026-09-10', lastEdited: '2026-09-15T08:00:00.000Z' }),
  deal({ id: 'c', brand: 'Shopify', status: 'Filming', tier: 'S', dealValueUsd: 9000, amountAgreedUsd: 8500, deadline: '2026-09-20', lastEdited: '2026-09-15T20:00:00.000Z' }),
  deal({ id: 'd', brand: 'Riverside', status: 'Paid', tier: 'B', amountAgreedUsd: 2500, paidInFull: true, lastEdited: '2026-08-01T08:00:00.000Z' }),
  deal({ id: 'e', brand: 'Loom', status: 'Declined', budgetUsd: 1200, lastEdited: '2026-09-01T08:00:00.000Z' }),
  deal({ id: 'f', brand: 'Descript', status: 'Invoiced', amountAgreedUsd: 12000, deadline: '2026-10-30', lastEdited: '2026-09-16T08:00:00.000Z' }),
  deal({ id: 'g', brand: 'Mystery', status: 'Vibing', lastEdited: '2026-09-16T10:00:00.000Z' }),
];

describe('buckets and dollars', () => {
  test('every Notion lane lands in a journey bucket; unknown lanes are kept, not dropped', () => {
    expect(bucketOf('New')).toBe('inbound');
    expect(bucketOf('Negotiating')).toBe('talking');
    expect(bucketOf('Aligned')).toBe('talking');
    expect(bucketOf('Researching')).toBe('producing');
    expect(bucketOf('Filming')).toBe('producing');
    expect(bucketOf('Editing')).toBe('producing');
    expect(bucketOf('Delivered')).toBe('producing');
    expect(bucketOf('Invoiced')).toBe('billing');
    expect(bucketOf('Approved')).toBe('billing');
    expect(bucketOf('Paid')).toBe('paid');
    expect(bucketOf('Declined')).toBe('declined');
    expect(bucketOf('Paused')).toBe('paused');
    expect(bucketOf('Vibing')).toBe('other');
  });

  test('a deal is worth what was agreed, else its value, else its budget, else nothing (never the suggested rate)', () => {
    expect(dealUsd(DEALS[2])).toBe(8500);
    expect(dealUsd(DEALS[0])).toBe(6000);
    expect(dealUsd(DEALS[4])).toBe(1200);
    expect(dealUsd(DEALS[1])).toBe(0);
  });
});

describe('filters and the prompt bar', () => {
  test('filters group buckets the way the chips read', () => {
    expect(matchesFilter(DEALS[1], 'talks')).toBe(true);
    expect(matchesFilter(DEALS[0], 'talks')).toBe(true);
    expect(matchesFilter(DEALS[2], 'production')).toBe(true);
    expect(matchesFilter(DEALS[5], 'production')).toBe(true);
    expect(matchesFilter(DEALS[3], 'paid')).toBe(true);
    expect(matchesFilter(DEALS[4], 'declined')).toBe(true);
    expect(matchesFilter(DEALS[0], 'tier-s')).toBe(true);
    expect(matchesFilter(DEALS[1], 'tier-s')).toBe(false);
    expect(matchesFilter(DEALS[6], 'all')).toBe(true);
  });

  test('a leading slash token becomes a filter, the rest is free text; unknown tokens filter nothing', () => {
    expect(parseQuery('/talks notion')).toEqual({ slash: '/talks', token: 'talks', text: 'notion' });
    expect(parseQuery('/s')).toEqual({ slash: '/s', token: 'tier-s', text: '' });
    expect(parseQuery('/nope shopify')).toEqual({ slash: '/nope', token: null, text: 'shopify' });
    expect(parseQuery('  Framer ')).toEqual({ slash: null, token: null, text: 'framer' });
  });

  test('free text searches brand, contact, status, channel, format, source and tier', () => {
    expect(filterDeals(DEALS, { filter: 'all', query: 'rivera' }).map((d) => d.id)).toEqual(['a']);
    expect(filterDeals(DEALS, { filter: 'all', query: 'instagram' }).map((d) => d.id)).toEqual(['a']);
    expect(filterDeals(DEALS, { filter: 'all', query: 'filming' }).map((d) => d.id)).toEqual(['c']);
    expect(filterDeals(DEALS, { filter: 'talks', query: '/s' }).map((d) => d.id)).toEqual(['a']);
    expect(filterDeals(DEALS, { filter: 'all', query: '' })).toHaveLength(7);
  });
});

describe('volume and the funnel hero', () => {
  test('open dollars exclude paid, declined and paused; the split reconciles', () => {
    const v = volume(DEALS);
    expect(v.talksUsd).toBe(6000);
    expect(v.productionUsd).toBe(8500 + 12000);
    expect(v.openUsd).toBe(v.talksUsd + v.productionUsd);
    expect(v.paidUsd).toBe(2500);
    expect(v.declinedUsd).toBe(1200);
    expect(v.quotedDeals).toBe(5);
    expect(v.counts).toEqual({ all: 7, talks: 2, production: 2, paid: 1, declined: 1, tierS: 2 });
  });

  test('four hero stages, each a working filter, each carrying its dollars', () => {
    const s = funnelStages(DEALS);
    expect(s.map((x) => x.filter)).toEqual(['all', 'talks', 'production', 'paid']);
    expect(s.map((x) => x.value)).toEqual([7, 2, 2, 1]);
    expect(s[0].usd).toBe(6000 + 8500 + 2500 + 1200 + 12000);
    expect(s[3].usd).toBe(2500);
    expect(s[3].note).toContain('1 declined');
  });
});

describe('activity, sizes, what needs you', () => {
  test('activity bins Notion edits per day across the window, quiet days kept so the line has steps', () => {
    const series = activitySeries(DEALS, NOW, 7);
    expect(series).toHaveLength(7);
    expect(series[series.length - 1]).toEqual({ label: '09/17', count: 1 });
    expect(series.find((s) => s.label === '09/15')?.count).toBe(2);
    expect(series.find((s) => s.label === '09/14')?.count).toBe(0);
    expect(series.reduce((n, s) => n + s.count, 0)).toBe(5);
  });

  test('deal sizes bucket by dollars and skip unquoted deals', () => {
    expect(sizeMatrix(DEALS)).toEqual([
      { label: '<1k', count: 0 },
      { label: '1-3k', count: 2 },
      { label: '3-5k', count: 0 },
      { label: '5-10k', count: 2 },
      { label: '10k+', count: 1 },
    ]);
  });

  test('follow-ups due (including overdue) and deadlines inside the week, never for closed deals', () => {
    const d = dueSoon(DEALS, NOW, 7);
    expect(d.followUps.map((x) => x.id)).toEqual(['b', 'a']);
    expect(d.deadlines.map((x) => x.id)).toEqual(['c']);
  });

  test('timeAgo reads in minutes, hours, then days', () => {
    expect(timeAgo('2026-09-17T11:30:00.000Z', NOW)).toBe('30m ago');
    expect(timeAgo('2026-09-16T12:00:00.000Z', NOW)).toBe('24h ago');
    expect(timeAgo('2026-09-10T12:00:00.000Z', NOW)).toBe('7d ago');
    expect(timeAgo(null, NOW)).toBe('');
  });
});
