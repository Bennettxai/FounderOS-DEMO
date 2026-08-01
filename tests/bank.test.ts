import { afterEach, describe, expect, it } from 'vitest';
import { openBankStore, type BankStore } from '@/lib/bank';
import type { BankSummary } from '@/lib/bank-statements';

let store: BankStore;
afterEach(() => store?.close());

const s = (account: string, business: string, month: string, c: number, d: number): BankSummary => ({
  account,
  business,
  month,
  creditsCents: c,
  debitsCents: d,
  netCents: c - d,
});

describe('bank store', () => {
  it('stores summaries and returns them ordered by month', () => {
    store = openBankStore(':memory:');
    store.upsert(s('4219', 'General Operations', '2026-04', 2589928, 2169558));
    store.upsert(s('5630', 'Vantage', '2026-04', 2086597, 2498023));
    store.upsert(s('4219', 'General Operations', '2026-03', 1800000, 1500000));
    expect(store.all()).toHaveLength(3);
    expect(store.all().map((x) => x.month)[0]).toBe('2026-03');
  });

  it('re-uploading the same account+month updates rather than duplicates', () => {
    store = openBankStore(':memory:');
    store.upsert(s('4219', 'General Operations', '2026-04', 1000, 500));
    store.upsert(s('4219', 'General Operations', '2026-04', 2589928, 2169558));
    expect(store.all()).toHaveLength(1);
    expect(store.all()[0].creditsCents).toBe(2589928);
    expect(store.all()[0].netCents).toBe(2589928 - 2169558);
  });
});
