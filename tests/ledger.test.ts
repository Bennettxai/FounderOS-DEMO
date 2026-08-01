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
