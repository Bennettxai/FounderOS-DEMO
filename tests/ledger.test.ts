import { afterEach, describe, expect, it } from 'vitest';
import { openLedger, type Ledger } from '@/lib/ledger';
import type { LedgerRow } from '@/lib/statements';

let led: Ledger;
afterEach(() => led?.close());

const ROWS: LedgerRow[] = [
  { date: '2026-06-01', description: 'AWS', amountCents: 5700, direction: 'out', category: 'Infrastructure' },
  { date: '2026-06-02', description: 'Facebook Ads', amountCents: 150000, direction: 'out', category: 'Advertising' },
  { date: '2026-06-03', description: 'AWS extra', amountCents: 4300, direction: 'out', category: 'Infrastructure' },
  { date: '2026-06-04', description: 'Client', amountCents: 500000, direction: 'in', category: 'Income' },
];

describe('ledger store', () => {
  it('inserts rows and dedupes re-uploads by content hash', () => {
    led = openLedger(':memory:');
    expect(led.insertRows(ROWS)).toBe(4);
    expect(led.insertRows(ROWS)).toBe(0); // same statement again → nothing new
    expect(led.rowCount()).toBe(4);
  });

  it('monthly() groups out-rows by category in USD, descending; income excluded', () => {
    led = openLedger(':memory:');
    led.insertRows(ROWS);
    expect(led.monthly()).toEqual([
      { category: 'Advertising', total: 1500 },
      { category: 'Infrastructure', total: 100 },
    ]);
  });

  it('reconcile(income) returns income, expenses (out total), and net', () => {
    led = openLedger(':memory:');
    led.insertRows(ROWS);
    expect(led.reconcile(5000)).toEqual({ income: 5000, expenses: 1600, net: 3400 });
  });

  it('monthly()/latestMonth() report only the most recent month when data spans several', () => {
    led = openLedger(':memory:');
    led.insertRows([
      { date: '2026-05-10', description: 'May AWS', amountCents: 1000, direction: 'out', category: 'Infrastructure' },
      { date: '2026-06-10', description: 'Jun Ads', amountCents: 5000, direction: 'out', category: 'Advertising' },
      { date: '2026-06-12', description: 'Jun AWS', amountCents: 2000, direction: 'out', category: 'Infrastructure' },
    ]);
    expect(led.latestMonth()).toBe('2026-06');
    expect(led.monthly()).toEqual([
      { category: 'Advertising', total: 50 },
      { category: 'Infrastructure', total: 20 }, // May's 10 excluded
    ]);
  });
});

describe('ledger card lanes and month history', () => {
  const SPREAD: LedgerRow[] = [
    { date: '2026-06-05', description: 'AWS', amountCents: 5000, direction: 'out', category: 'Infrastructure', card: 'platinum' },
    { date: '2026-07-05', description: 'AWS', amountCents: 6000, direction: 'out', category: 'Infrastructure', card: 'platinum' },
    { date: '2026-07-06', description: 'Notion', amountCents: 4000, direction: 'out', category: 'Software', card: 'blue' },
    { date: '2026-07-07', description: 'Client', amountCents: 900000, direction: 'in', category: 'Income', card: 'blue' },
  ];

  it('stores the card lane on every row and keeps the same charge on two cards apart', () => {
    led = openLedger(':memory:');
    led.insertRows([
      { date: '2026-07-06', description: 'Notion', amountCents: 4000, direction: 'out', category: 'Software', card: 'platinum' },
      { date: '2026-07-06', description: 'Notion', amountCents: 4000, direction: 'out', category: 'Software', card: 'blue' },
    ]);
    expect(led.rowCount()).toBe(2);
  });

  it('defaults rows with no card to the default lane', () => {
    led = openLedger(':memory:');
    led.insertRows([{ date: '2026-07-06', description: 'Notion', amountCents: 4000, direction: 'out', category: 'Software' }]);
    expect(led.rows(null)[0].card).toBe('platinum');
  });

  it('months() lists every month with spend, newest first', () => {
    led = openLedger(':memory:');
    led.insertRows(SPREAD);
    expect(led.months()).toEqual(['2026-07', '2026-06']);
  });

  /**
   * months() is newest-first, but every month stepper on /finances walks the
   * list forwards through time — fed the raw order it opened on his OLDEST
   * statement and "next month" went backwards. The panels get this one.
   */
  it('monthsAscending() lists the same months oldest-first', () => {
    led = openLedger(':memory:');
    led.insertRows(SPREAD);
    expect(led.monthsAscending()).toEqual(['2026-06', '2026-07']);
  });

  it('byCategory(month) scopes to that month; null spans all of it', () => {
    led = openLedger(':memory:');
    led.insertRows(SPREAD);
    expect(led.byCategory('2026-06')).toEqual([{ category: 'Infrastructure', total: 50 }]);
    expect(led.byCategory(null)).toEqual([
      { category: 'Infrastructure', total: 110 },
      { category: 'Software', total: 40 },
    ]);
  });

  it('byCard(month) splits spend across the lanes, income excluded', () => {
    led = openLedger(':memory:');
    led.insertRows(SPREAD);
    expect(led.byCard('2026-07')).toEqual([
      { card: 'platinum', total: 60 },
      { card: 'blue', total: 40 },
    ]);
  });

  it('rows(month) returns the out-rows with their card, biggest first', () => {
    led = openLedger(':memory:');
    led.insertRows(SPREAD);
    const rows = led.rows('2026-07');
    expect(rows.map((r) => r.amountCents)).toEqual([6000, 4000]);
    expect(rows[1].card).toBe('blue');
  });

  it('allRows() hands the whole ledger over for the month-to-month report', () => {
    led = openLedger(':memory:');
    led.insertRows(SPREAD);
    expect(led.allRows()).toHaveLength(4);
  });
});
