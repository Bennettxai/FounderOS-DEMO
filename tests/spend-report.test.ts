import { describe, expect, it } from 'vitest';
import {
  cardTotals,
  categoryTotals,
  detectSubscriptions,
  monthAfterRefresh,
  monthlyTotals,
  normalizeMerchant,
  prevMonth,
  topMerchants,
  type SpendRow,
} from '@/lib/spend-report';

const out = (date: string, description: string, dollars: number, card: SpendRow['card'] = 'platinum', category = 'Software'): SpendRow => ({
  date,
  description,
  amountCents: Math.round(dollars * 100),
  direction: 'out',
  category,
  card,
});

describe('normalizeMerchant', () => {
  it('collapses the same merchant written with different reference noise', () => {
    expect(normalizeMerchant('ORBIT.COM*RT4G2  SAMPLE CITY XX')).toBe(normalizeMerchant('ORBIT.COM*9K12P SAMPLE CITY XX'));
  });

  it('strips store / order numbers so recurring charges group', () => {
    expect(normalizeMerchant('NORTHWIND 8829174 SAMPLE CITY')).toBe(normalizeMerchant('NORTHWIND 4410023 SAMPLE CITY'));
  });

  it('never returns an empty label', () => {
    expect(normalizeMerchant('####')).not.toBe('');
  });
});

describe('prevMonth', () => {
  it('rolls the year backwards over January', () => {
    expect(prevMonth('2026-01')).toBe('2025-12');
    expect(prevMonth('2026-08')).toBe('2026-07');
  });
});

describe('monthlyTotals', () => {
  it('sums out-rows per month ascending, split per card, ignoring income', () => {
    const rows: SpendRow[] = [
      out('2026-06-02', 'AWS', 100, 'platinum'),
      out('2026-06-20', 'VERCEL', 50, 'blue'),
      out('2026-07-04', 'AWS', 120, 'platinum'),
      { ...out('2026-07-05', 'CLIENT PAYMENT', 5000), direction: 'in', category: 'Income' },
    ];
    expect(monthlyTotals(rows)).toEqual([
      { month: '2026-06', totalCents: 15000, byCard: { gold: 0, platinum: 10000, blue: 5000 } },
      { month: '2026-07', totalCents: 12000, byCard: { gold: 0, platinum: 12000, blue: 0 } },
    ]);
  });
});

describe('detectSubscriptions', () => {
  const rows: SpendRow[] = [
    // recurring, still running
    out('2026-05-03', 'NORTHWIND CLOUD', 20),
    out('2026-06-03', 'NORTHWIND CLOUD', 20),
    out('2026-07-03', 'NORTHWIND CLOUD', 20),
    // recurring, stopped after May → cancelled
    out('2026-04-11', 'VELA TOOLS', 49),
    out('2026-05-11', 'VELA TOOLS', 49),
    // one-off, never a subscription
    out('2026-07-14', 'SKYLARK AIR', 400, 'platinum', 'Travel'),
  ];

  it('finds merchants charged in two or more months at a steady amount', () => {
    const subs = detectSubscriptions(rows, '2026-07');
    expect(subs.map((s) => s.merchant)).toContain(normalizeMerchant('NORTHWIND CLOUD'));
    expect(subs.map((s) => s.merchant)).not.toContain(normalizeMerchant('SKYLARK AIR'));
  });

  it('marks a subscription cancelled once it stops charging', () => {
    const subs = detectSubscriptions(rows, '2026-07');
    const stopped = subs.find((s) => s.merchant === normalizeMerchant('VELA TOOLS'));
    expect(stopped?.status).toBe('cancelled');
    expect(stopped?.lastMonth).toBe('2026-05');
    const running = subs.find((s) => s.merchant === normalizeMerchant('NORTHWIND CLOUD'));
    expect(running?.status).toBe('active');
    expect(running?.monthlyCents).toBe(2000);
    expect(running?.charges).toBe(3);
    expect(running?.firstMonth).toBe('2026-05');
  });

  it('keeps the same merchant on two cards as two separate subscriptions', () => {
    const twoCards: SpendRow[] = [
      out('2026-06-03', 'VELA TOOLS', 10, 'platinum'),
      out('2026-07-03', 'VELA TOOLS', 10, 'platinum'),
      out('2026-06-03', 'VELA TOOLS', 40, 'blue'),
      out('2026-07-03', 'VELA TOOLS', 40, 'blue'),
    ];
    const subs = detectSubscriptions(twoCards, '2026-07');
    expect(subs).toHaveLength(2);
    expect(new Set(subs.map((s) => s.card))).toEqual(new Set(['platinum', 'blue']));
  });

  it('sorts active subscriptions first, most expensive first', () => {
    const subs = detectSubscriptions(rows, '2026-07');
    expect(subs[0].status).toBe('active');
  });
});

describe('topMerchants', () => {
  it('ranks a month’s spend by merchant', () => {
    const rows: SpendRow[] = [
      out('2026-07-01', 'AWS', 100),
      out('2026-07-09', 'AWS', 40),
      out('2026-07-02', 'VERCEL', 90),
      out('2026-06-02', 'AWS', 900),
    ];
    const top = topMerchants(rows, '2026-07');
    expect(top[0]).toMatchObject({ merchant: 'AWS', amountCents: 14000, count: 2 });
    expect(top[1]).toMatchObject({ merchant: 'VERCEL', amountCents: 9000, count: 1 });
  });
});

describe('categoryTotals / cardTotals', () => {
  const rows: SpendRow[] = [
    out('2026-06-05', 'AWS', 50, 'platinum', 'Infrastructure'),
    out('2026-07-05', 'AWS', 60, 'platinum', 'Infrastructure'),
    out('2026-07-06', 'NOTION', 40, 'blue', 'Software'),
    { date: '2026-07-07', description: 'CLIENT', amountCents: 900000, direction: 'in', category: 'Income', card: 'blue' },
  ];

  it('scopes category totals to a month, income excluded', () => {
    expect(categoryTotals(rows, '2026-07')).toEqual([
      { category: 'Infrastructure', totalCents: 6000 },
      { category: 'Software', totalCents: 4000 },
    ]);
    expect(categoryTotals(rows, '2026-06')).toEqual([{ category: 'Infrastructure', totalCents: 5000 }]);
  });

  it('spans every month when the month is null', () => {
    expect(categoryTotals(rows, null)[0]).toEqual({ category: 'Infrastructure', totalCents: 11000 });
  });

  it('reports every lane for a month, silent lanes included as zero', () => {
    expect(cardTotals(rows, '2026-06')).toEqual([
      { card: 'gold', totalCents: 0 },
      { card: 'platinum', totalCents: 5000 },
      { card: 'blue', totalCents: 0 },
    ]);
  });
});

/**
 * the operator, 2026-08-26: "Once I submit the documents, it should auto update the
 * OS to show the latest data I submitted."
 *
 * The upload already refreshed the server data, but the panel had picked its
 * month once at mount and never moved, so the month he just uploaded sat there
 * as an unselected chip while the pie kept drawing the old one. This decides
 * where the view lands after the ledger changes underneath it.
 */
describe('monthAfterRefresh', () => {
  it('jumps to the month that just arrived', () => {
    expect(monthAfterRefresh('2026-06', ['2026-05', '2026-06'], ['2026-05', '2026-06', '2026-07'])).toBe('2026-07');
  });

  it('lands on a back-dated statement too, not just the newest month overall', () => {
    expect(monthAfterRefresh('2026-07', ['2026-06', '2026-07'], ['2026-03', '2026-06', '2026-07'])).toBe('2026-03');
  });

  it('takes the newest of several months uploaded at once', () => {
    expect(monthAfterRefresh(null, [], ['2026-05', '2026-06', '2026-07'])).toBe('2026-07');
  });

  it('keeps the month he is reading when the upload added no new month', () => {
    expect(monthAfterRefresh('2026-06', ['2026-06', '2026-07'], ['2026-06', '2026-07'])).toBe('2026-06');
  });

  it('falls back to the newest month when the current one is gone', () => {
    expect(monthAfterRefresh('2026-04', ['2026-04'], ['2026-06', '2026-07'])).toBe('2026-07');
  });

  it('is null on an empty ledger', () => {
    expect(monthAfterRefresh(null, [], [])).toBeNull();
  });
});
