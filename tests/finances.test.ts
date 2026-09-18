import { describe, expect, test } from 'vitest';
import {
  incomeAccounts,
  totalIncome,
  totalIncomeUpper,
  hasUnsplittableIncome,
  totalExpenses,
  expensesByCategory,
  net,
  monthStartUnix,
  sumChargeIncome,
  DECLARED_EXPENSES,
} from '@/lib/finances';

describe('incomeAccounts', () => {
  test('lists ONLY the API-connected processors (the operator, 2026-08-17: PayPal, PayKit Vantage, and Wise cut — no connections exist)', () => {
    const accounts = incomeAccounts({ connected: false, mtdUsd: null });
    expect(accounts).toHaveLength(3);
    expect(accounts.map((a) => a.id)).toEqual(['stripe', 'stripe-vantage', 'paykit-lc']);
  });

  test('Vantage Stripe goes live from the per-account income map', () => {
    const accounts = incomeAccounts(
      { connected: false, mtdUsd: null },
      { 'stripe-vantage': true },
      { 'stripe-vantage': 4200 },
    );
    const mer = accounts.find((a) => a.id === 'stripe-vantage')!;
    expect(mer.configured).toBe(true);
    expect(mer.live).toBe(true);
    expect(mer.income).toBe(4200);
    expect(mer.label).toBe('Stripe · Vantage');
  });

  test('Stripe goes live with its real month-to-date income when connected', () => {
    const accounts = incomeAccounts({ connected: true, mtdUsd: 7000 });
    const stripe = accounts.find((a) => a.id === 'stripe')!;
    expect(stripe.live).toBe(true);
    expect(stripe.income).toBe(7000);
  });

  test('Stripe stays pending when not connected', () => {
    const stripe = incomeAccounts({ connected: false, mtdUsd: null }).find((a) => a.id === 'stripe')!;
    expect(stripe.live).toBe(false);
    expect(stripe.income).toBeNull();
  });

  test('a keyed-but-unpulled account is honest pending — null income, not a faked zero', () => {
    const accounts = incomeAccounts({ connected: false, mtdUsd: null }, { 'paykit-lc': true });
    const aa = accounts.find((a) => a.id === 'paykit-lc')!;
    expect(aa.configured).toBe(true); // key present
    expect(aa.live).toBe(false); // but no live pull supplied
    expect(aa.income).toBeNull(); // so never a faked number
  });

  test('stripe.configured defaults to its connection state', () => {
    expect(incomeAccounts({ connected: true, mtdUsd: 100 }).find((a) => a.id === 'stripe')!.configured).toBe(true);
    expect(incomeAccounts({ connected: false, mtdUsd: null }).find((a) => a.id === 'stripe')!.configured).toBe(false);
  });

  test('PayKit LC goes live with real income when passed in liveIncomeUsd', () => {
    const accounts = incomeAccounts({ connected: false, mtdUsd: null }, { 'paykit-lc': true }, { 'paykit-lc': 3400 });
    const aa = accounts.find((a) => a.id === 'paykit-lc')!;
    expect(aa.configured).toBe(true);
    expect(aa.live).toBe(true);
    expect(aa.income).toBe(3400);
    expect(aa.incomeUpper).toBeNull(); // a plain number is exact
    expect(aa.unsplittableCustomers).toBe(0);
    // the other two still pending
    expect(accounts.find((a) => a.id === 'stripe-vantage')!.live).toBe(false);
  });

  // OS-655: PayKit cannot split a repeat buyer's lifetime spend across
  // months, so it hands over a band. The account must carry the FLOOR as its
  // income — never the ceiling, which overstated September by 100%.
  test('a bounded pull reports the floor as income and keeps the ceiling beside it', () => {
    const accounts = incomeAccounts(
      { connected: false, mtdUsd: null },
      { 'paykit-lc': true },
      { 'paykit-lc': { exactUsd: 0, upperUsd: 2000, unsplittableCustomers: 1 } },
    );
    const aa = accounts.find((a) => a.id === 'paykit-lc')!;
    expect(aa.live).toBe(true);
    expect(aa.income).toBe(0); // proven floor, not the $2,000 ceiling
    expect(aa.incomeUpper).toBe(2000);
    expect(aa.unsplittableCustomers).toBe(1);
  });

  test('a band with nothing unsplittable is an exact figure, not a range', () => {
    const accounts = incomeAccounts(
      { connected: false, mtdUsd: null },
      { 'paykit-lc': true },
      { 'paykit-lc': { exactUsd: 4500, upperUsd: 4500, unsplittableCustomers: 0 } },
    );
    const aa = accounts.find((a) => a.id === 'paykit-lc')!;
    expect(aa.income).toBe(4500);
    expect(aa.incomeUpper).toBeNull();
  });

  test('the headline total never inflates: floors sum, the ceiling rides alongside', () => {
    const accounts = incomeAccounts(
      { connected: true, mtdUsd: 1000 },
      { 'paykit-lc': true },
      { 'paykit-lc': { exactUsd: 0, upperUsd: 2000, unsplittableCustomers: 1 } },
    );
    expect(totalIncome(accounts)).toBe(1000);
    expect(totalIncomeUpper(accounts)).toBe(3000);
    expect(hasUnsplittableIncome(accounts)).toBe(true);
  });
});

describe('totalIncome', () => {
  test('sums live account income, treating pending (null) as zero', () => {
    const accounts = incomeAccounts({ connected: true, mtdUsd: 7000 });
    expect(totalIncome(accounts)).toBe(7000);
  });
});

describe('expenses', () => {
  const fixture = [
    { id: 'a', label: 'A', category: 'Software', monthly: 20 },
    { id: 'b', label: 'B', category: 'Software', monthly: 30 },
    { id: 'c', label: 'C', category: 'Advertising', monthly: 100 },
  ];

  test('totalExpenses sums the monthly amounts', () => {
    expect(totalExpenses(fixture)).toBe(150);
  });

  test('expensesByCategory groups + sorts by total descending', () => {
    expect(expensesByCategory(fixture)).toEqual([
      { category: 'Advertising', total: 100 },
      { category: 'Software', total: 50 },
    ]);
  });

  test('DECLARED_EXPENSES is a short illustrative placeholder, well-formed and positive', () => {
    // Deliberately tiny: real fixed costs arrive via statement upload, never a
    // hand-typed guess, so this list must never grow into a pretend ledger.
    expect(DECLARED_EXPENSES.length).toBeLessThanOrEqual(3);
    expect(DECLARED_EXPENSES.every((e) => e.monthly > 0)).toBe(true);
    expect(DECLARED_EXPENSES.every((e) => e.id && e.label && e.category)).toBe(true);
    expect(new Set(DECLARED_EXPENSES.map((e) => e.id)).size).toBe(DECLARED_EXPENSES.length);
    expect(totalExpenses(DECLARED_EXPENSES)).toBe(
      DECLARED_EXPENSES.reduce((sum, e) => sum + e.monthly, 0),
    );
  });
});

describe('net', () => {
  test('income minus expenses, positive or negative', () => {
    expect(net(150, 100)).toBe(50);
    expect(net(100, 150)).toBe(-50);
  });
});

describe('Stripe month-to-date helpers', () => {
  test('monthStartUnix returns the first of the calendar month at 00:00 UTC', () => {
    const unix = monthStartUnix(new Date('2026-06-16T10:30:00Z'));
    expect(new Date(unix * 1000).toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  test('sumChargeIncome counts only paid + succeeded charges', () => {
    const result = sumChargeIncome([
      { amount: 5000, currency: 'usd', paid: true, status: 'succeeded' },
      { amount: 2000, currency: 'usd', paid: true, status: 'succeeded' },
      { amount: 9999, currency: 'usd', paid: false, status: 'failed' },
      { amount: 100, currency: 'usd', paid: true, status: 'pending' },
    ]);
    expect(result).toEqual({ amountCents: 7000, currency: 'usd', count: 2 });
  });
});

/**
 * Mock 3d polish (the operator, 2026-09-07): the business income cards switch
 * metric and range with chip rows (Money in / Money out / Net + 3 mo / 6 mo /
 * All) instead of two dropdowns, the statement uploader takes a real drag-drop
 * with "drop a CSV or PDF" copy and a filled upload action, and Recent income
 * sits above the outgoing Wise transfers. Real lanes and live numbers stay —
 * the mock's Amex/Chase/Wise sample chips do not replace the three real cards.
 */
describe('/finances mock-3d polish', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, 'utf8');

  test('the business income cards use chips, not dropdowns', () => {
    const chart = read('components/BusinessIncomeChart.tsx');
    expect(chart).toContain('Chip');
    expect(chart).not.toContain('<select');
    expect(chart).toMatch(/Money in/);
    expect(chart).toMatch(/Money out/);
    expect(chart).toMatch(/3 mo/);
    expect(chart).toMatch(/6 mo/);
    expect(chart).toMatch(/All/);
  });

  test('the uploader takes a drop and carries the mock copy + filled action', () => {
    const up = read('components/StatementUploader.tsx');
    expect(up).toContain('onDrop');
    expect(up).toContain('onDragOver');
    expect(up).toMatch(/drop a CSV or PDF/i);
    // the upload action is the filled primary, not an outline
    expect(up).toMatch(/bg-os-text text-os-ink/);
    expect(up).toMatch(/↑ Upload/);
  });

  test('recent income reads above the outgoing Wise transfers', () => {
    const page = read('app/finances/page.tsx');
    const recent = page.indexOf('Recent income');
    const wise = page.indexOf('Outgoing · Wise');
    expect(recent).toBeGreaterThan(-1);
    expect(wise).toBeGreaterThan(-1);
    expect(recent).toBeLessThan(wise);
  });
});
