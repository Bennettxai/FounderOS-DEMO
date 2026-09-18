import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPaykitHistory, SEED_2026_08_20 } from '@/lib/paykit-history';
import { paykitMonthFromSnapshots, type PaykitCustomer } from '@/lib/connectors/payments';

const tmpDb = () => join(mkdtempSync(join(tmpdir(), 'paykit-')), 'paykit.db');

const cust = (
  id: string,
  cents: number,
  txns: number,
  lastTransactionDate: string | null = null,
): PaykitCustomer => ({
  id,
  totalSpentCents: cents,
  transactions: txns,
  lastTransactionDate,
  month: lastTransactionDate ? lastTransactionDate.slice(0, 7) : null,
});

/**
 * The 2026-08-20 seed is a RECONSTRUCTION, not a capture, and its whole claim to
 * being usable is that it reproduces the aggregate recorded for that day:
 * 8 customers · 12 transactions · $29,000.00, spanning 2025-07-01 → 2026-08-01.
 * If any of those four drift, the reconstruction is wrong and every month
 * resting on it is wrong with it.
 */
describe('the reconstructed 2026-08-20 seed', () => {
  const dates = SEED_2026_08_20.customers
    .map((c) => c.lastTransactionDate)
    .filter((d): d is string => d != null)
    .sort();

  it('reproduces the aggregate recorded that day', () => {
    expect(SEED_2026_08_20.customers).toHaveLength(8);
    expect(SEED_2026_08_20.customers.reduce((n, c) => n + c.transactions, 0)).toBe(12);
    expect(SEED_2026_08_20.customers.reduce((n, c) => n + c.totalSpentCents, 0)).toBe(2900000);
  });

  it('reproduces both ends of the recorded date range', () => {
    expect(dates[0].slice(0, 10)).toBe('2025-07-01');
    expect(dates[dates.length - 1].slice(0, 10)).toBe('2026-08-01');
  });

  it('is labelled an inference, never a measurement', () => {
    expect(SEED_2026_08_20.source).toBe('reconstructed');
  });

  // The single derived row. Its prior transaction date is genuinely unknown, so
  // it is null — inventing one would be fabrication dressed as data.
  it('holds the derived customer one transaction and $1,000 short of today', () => {
    const derived = SEED_2026_08_20.customers.find((c) => c.id === '900001')!;
    expect(derived).toMatchObject({ totalSpentCents: 250000, transactions: 2, lastTransactionDate: null });
  });
});

describe('openPaykitHistory', () => {
  it('installs the seed on a fresh store', () => {
    const h = openPaykitHistory('paykit-lc', tmpDb());
    try {
      expect(h.capturedDates()).toEqual(['2026-08-20']);
      expect(h.snapshots()[0].customers).toHaveLength(8);
      expect(h.snapshots()[0].source).toBe('reconstructed');
    } finally {
      h.close();
    }
  });

  it('seeds only the LC account — the seed is that account\'s history, not a default', () => {
    const h = openPaykitHistory('paykit-vantage', tmpDb());
    try {
      expect(h.capturedDates()).toEqual([]);
    } finally {
      h.close();
    }
  });

  it('round-trips a snapshot and keeps accounts apart', () => {
    const file = tmpDb();
    const aa = openPaykitHistory('paykit-lc', file);
    try {
      aa.record({ capturedOn: '2026-09-17', source: 'live', customers: [cust('a', 100000, 1, '2026-09-10T09:00:00-05:00')] });
      expect(aa.capturedDates()).toEqual(['2026-08-20', '2026-09-17']);
      const day = aa.snapshots().find((s) => s.capturedOn === '2026-09-17')!;
      expect(day.source).toBe('live');
      expect(day.customers).toEqual([cust('a', 100000, 1, '2026-09-10T09:00:00-05:00')]);
    } finally {
      aa.close();
    }
    const other = openPaykitHistory('paykit-vantage', file);
    try {
      expect(other.capturedDates()).toEqual([]);
    } finally {
      other.close();
    }
  });

  // A day is replaced wholesale, not merged. A customer who drops out of the API
  // must not survive as a stale row, or the next diff reads their disappearance
  // as a refund and their return as brand-new lifetime spend.
  it('replaces a day rather than merging into it', () => {
    const h = openPaykitHistory('paykit-lc', tmpDb());
    try {
      h.record({ capturedOn: '2026-09-17', source: 'live', customers: [cust('a', 1000, 1), cust('b', 2000, 1)] });
      h.record({ capturedOn: '2026-09-17', source: 'live', customers: [cust('a', 5000, 2)] });
      const day = h.snapshots().find((s) => s.capturedOn === '2026-09-17')!;
      expect(day.customers.map((c) => c.id)).toEqual(['a']);
      expect(day.customers[0].totalSpentCents).toBe(5000);
    } finally {
      h.close();
    }
  });

  it('drops id-less rows, which cannot be joined across snapshots', () => {
    const h = openPaykitHistory('paykit-lc', tmpDb());
    try {
      h.record({ capturedOn: '2026-09-17', source: 'live', customers: [cust('', 1000, 1), cust('', 2000, 1), cust('c', 3000, 1)] });
      const day = h.snapshots().find((s) => s.capturedOn === '2026-09-17')!;
      expect(day.customers.map((c) => c.id)).toEqual(['c']);
    } finally {
      h.close();
    }
  });

  it('never overwrites a real capture of the seed date with the inference', () => {
    const file = tmpDb();
    const first = openPaykitHistory('paykit-lc', file);
    first.record({ capturedOn: '2026-08-20', source: 'live', customers: [cust('real', 4242, 1)] });
    first.close();
    const second = openPaykitHistory('paykit-lc', file);
    try {
      const day = second.snapshots().find((s) => s.capturedOn === '2026-08-20')!;
      expect(day.source).toBe('live');
      expect(day.customers).toEqual([cust('real', 4242, 1)]);
    } finally {
      second.close();
    }
  });

  /**
   * The end-to-end claim, through the real store and the real seed: record the
   * 2026-09-17 live shape and September resolves to exactly $1,000, where the
   * lifetime band could only say "$0 – $2,000".
   */
  it('makes September 2026 exact once the live pull is recorded', () => {
    const h = openPaykitHistory('paykit-lc', tmpDb());
    try {
      h.record({
        capturedOn: '2026-09-17',
        source: 'live',
        customers: SEED_2026_08_20.customers.map((c) =>
          c.id === '900001' ? cust('900001', 350000, 3, '2026-09-10T14:00:00Z') : c,
        ),
      });
      expect(paykitMonthFromSnapshots(h.snapshots(), '2026-09')).toEqual({
        exactCents: 100000,
        upperCents: 100000,
        unsplittableCustomers: 0,
      });
      // August is NOT covered by a snapshot taken inside it — it keeps the band.
      expect(paykitMonthFromSnapshots(h.snapshots(), '2026-08')).toBeNull();
    } finally {
      h.close();
    }
  });
});
