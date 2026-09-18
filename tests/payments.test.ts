import { describe, it, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  configuredProcessors,
  parseWiseTransfers,
  parsePaykitCustomers,
  sumPaykitMonthCents,
  paykitMonthIncomeCents,
  paykitMonthToDateIncome,
  diffPaykitSnapshots,
  paykitMonthFromSnapshots,
  monthsSpanned,
  type PaykitCustomer,
  type PaykitSnapshot,
} from '@/lib/connectors/payments';

describe('configuredProcessors', () => {
  it('lists the 6 real processors; configured derives from env keys', () => {
    const procs = configuredProcessors({
      STRIPE_SECRET_KEY: 'sk_x',
      STRIPE_VANTAGE_KEY: 'sk_m',
      PAYPAL_CLIENT_ID: 'a',
      PAYPAL_CLIENT_SECRET: 'b',
      PAYKIT_VANTAGE_KEY: 'm',
      WISE_1_TOKEN: 'w1',
    });
    expect(procs.map((p) => p.id)).toEqual([
      'stripe',
      'stripe-vantage',
      'paypal',
      'paykit-vantage',
      'paykit-lc',
      'wise-1',
    ]);
    const byId = Object.fromEntries(procs.map((p) => [p.id, p.configured]));
    expect(byId.stripe).toBe(true);
    expect(byId['stripe-vantage']).toBe(true);
    expect(byId.paypal).toBe(true);
    expect(byId['paykit-vantage']).toBe(true);
    expect(byId['paykit-lc']).toBe(false);
    expect(byId['wise-1']).toBe(true);
  });

  it('drops the second Wise slot — not connectable for now (2026-08-08)', () => {
    expect(configuredProcessors({ WISE_2_TOKEN: 'w2' }).some((p) => p.id === 'wise-2')).toBe(false);
  });

  it('the Vantage Stripe slot keys off STRIPE_VANTAGE_KEY alone', () => {
    const withoutKey = configuredProcessors({ STRIPE_SECRET_KEY: 'sk_x' });
    expect(withoutKey.find((p) => p.id === 'stripe-vantage')!.configured).toBe(false);
  });

  it('paypal needs BOTH client id and secret', () => {
    expect(configuredProcessors({ PAYPAL_CLIENT_ID: 'a' }).find((p) => p.id === 'paypal')!.configured).toBe(false);
  });

  it('drops the unused square/whop slots', () => {
    const ids = configuredProcessors({}).map((p) => p.id);
    expect(ids).not.toContain('square');
    expect(ids).not.toContain('whop');
  });
});

describe('parseWiseTransfers', () => {
  it('maps Wise transfers to outgoing {amountCents, currency, status, created, reference}', () => {
    const out = parseWiseTransfers({
      transfers: [
        {
          id: 1,
          targetValue: 250.5,
          targetCurrency: 'USD',
          status: 'outgoing_payment_sent',
          created: '2026-06-10T00:00:00Z',
          reference: 'rent',
        },
      ],
    });
    expect(out).toEqual([
      {
        amountCents: 25050,
        currency: 'USD',
        status: 'outgoing_payment_sent',
        created: '2026-06-10T00:00:00Z',
        reference: 'rent',
      },
    ]);
  });

  it('accepts a bare array and skips malformed rows', () => {
    const out = parseWiseTransfers([
      { targetValue: 10, targetCurrency: 'EUR', status: 's', created: 'x' },
      { nope: 1 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].amountCents).toBe(1000);
    expect(out[0].currency).toBe('EUR');
  });

  it('returns [] for malformed input', () => {
    expect(parseWiseTransfers(null)).toEqual([]);
    expect(parseWiseTransfers({})).toEqual([]);
  });
});

describe('parsePaykitCustomers + sumPaykitMonthCents', () => {
  const payload = {
    data: {
      customers: [
        { id: 1, total_spent: '3400.00', last_transaction_date: '2026-06-10T12:12:13-05:00', total_transactions: 1 },
        { id: 2, total_spent: '1,250.00', last_transaction_date: '2026-06-02T09:00:00-05:00', total_transactions: 1 },
        { id: 3, total_spent: '500.00', last_transaction_date: '2026-05-20T09:00:00-05:00', total_transactions: 1 },
      ],
    },
  };

  it('normalizes total_spent → cents and last_transaction_date → YYYY-MM', () => {
    expect(parsePaykitCustomers(payload)).toEqual([
      { id: '1', totalSpentCents: 340000, month: '2026-06', transactions: 1, lastTransactionDate: '2026-06-10T12:12:13-05:00' },
      { id: '2', totalSpentCents: 125000, month: '2026-06', transactions: 1, lastTransactionDate: '2026-06-02T09:00:00-05:00' },
      { id: '3', totalSpentCents: 50000, month: '2026-05', transactions: 1, lastTransactionDate: '2026-05-20T09:00:00-05:00' },
    ]);
  });

  // The differencing key. A row with no id must not become id '' and collide
  // with every other id-less row, which would fabricate deltas between them.
  it('keeps the customer id as a string, and an absent one as empty', () => {
    expect(parsePaykitCustomers(payload).map((c) => c.id)).toEqual(['1', '2', '3']);
    expect(parsePaykitCustomers({ data: { customers: [{ total_spent: '1.00' }] } })[0].id).toBe('');
  });

  it('sums spend for customers whose latest transaction is in the given month', () => {
    const cs = parsePaykitCustomers(payload);
    expect(sumPaykitMonthCents(cs, '2026-06')).toBe(465000); // 3400 + 1250
    expect(sumPaykitMonthCents(cs, '2026-05')).toBe(50000);
  });

  it('returns [] for malformed input', () => {
    expect(parsePaykitCustomers(null)).toEqual([]);
    expect(parsePaykitCustomers({})).toEqual([]);
  });

  // A missing/garbled total_transactions must NOT be optimistically read as a
  // one-time buyer — that is exactly the assumption that overstated six months.
  it('treats an absent or unparseable transaction count as unsplittable', () => {
    const cs = parsePaykitCustomers({
      data: {
        customers: [
          { total_spent: '100.00', last_transaction_date: '2026-06-01 09:00:00' },
          { total_spent: '200.00', last_transaction_date: '2026-06-02 09:00:00', total_transactions: 'many' },
        ],
      },
    });
    expect(cs.map((c) => c.transactions)).toEqual([0, 0]);
    expect(paykitMonthIncomeCents(cs, '2026-06')).toEqual({
      exactCents: 0,
      upperCents: 30000,
      unsplittableCustomers: 2,
    });
  });
});

/**
 * The defect this pins: a repeat buyer's LIFETIME spend was booked into the
 * month of their most recent transaction, so a $1,000 payment against $2,000
 * of lifetime spend over 3 transactions made the month read $2,000 — a 100%
 * overstatement. The PayKit public API has only /customers and /products, so
 * the true split is not recoverable; the figure must therefore be a band,
 * never a confident single number.
 */
describe('paykitMonthIncomeCents refuses to guess', () => {
  it('reports the exact floor and a separate ceiling for the September shape', () => {
    const cs = parsePaykitCustomers({
      data: {
        customers: [
          { total_spent: '2,000.00', last_transaction_date: '2026-09-10 10:00:00', total_transactions: 3 },
        ],
      },
    });
    // The old code returned a flat 200000 here. $1,000 of that was never September's.
    expect(paykitMonthIncomeCents(cs, '2026-09')).toEqual({
      exactCents: 0,
      upperCents: 200000,
      unsplittableCustomers: 1,
    });
  });

  it('collapses the band when every buyer in the month is one-time', () => {
    const cs = parsePaykitCustomers({
      data: {
        customers: [
          { total_spent: '1,500.00', last_transaction_date: '2026-08-09 10:00:00', total_transactions: 1 },
          { total_spent: '1,500.00', last_transaction_date: '2026-08-09 11:00:00', total_transactions: 1 },
        ],
      },
    });
    expect(paykitMonthIncomeCents(cs, '2026-08')).toEqual({
      exactCents: 300000,
      upperCents: 300000,
      unsplittableCustomers: 0,
    });
  });

  it('counts only the requested month, mixing one-time and repeat buyers', () => {
    const cs = parsePaykitCustomers({
      data: {
        customers: [
          { total_spent: '9,125.00', last_transaction_date: '2025-10-07 10:00:00', total_transactions: 1 },
          { total_spent: '1,250.00', last_transaction_date: '2025-10-07 11:00:00', total_transactions: 2 },
          { total_spent: '6,000.00', last_transaction_date: '2025-09-01 11:00:00', total_transactions: 1 },
        ],
      },
    });
    expect(paykitMonthIncomeCents(cs, '2025-10')).toEqual({
      exactCents: 912500,
      upperCents: 1037500, // the old, overstated single figure
      unsplittableCustomers: 1,
    });
  });
});

/**
 * A dead PayKit key must fail honestly (the operator, 2026-08-16: the LC card
 * said "live · $0 this month" while $4,500 of real August cohort payments sat
 * in the account — the host's stale key 401'd and the connector converted
 * that into fake zero income instead of null).
 */
describe('paykitMonthToDateIncome honesty', () => {
  const okPage = (customers: unknown[]) =>
    new Response(JSON.stringify({ data: { customers } }), { status: 200 });

  test('auth failure on the first page returns null, never 0', async () => {
    const fetchMock = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      expect(await paykitMonthToDateIncome('bad-key', '2026-08')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('a mid-pagination failure also returns null rather than a partial sum', async () => {
    const page1 = Array.from({ length: 100 }, () => ({
      total_spent: '10.00',
      last_transaction_date: '2026-08-09 12:00:00',
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okPage(page1))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      expect(await paykitMonthToDateIncome('key', '2026-08')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('a real month still sums correctly (the Aug 2026 cohort shape)', async () => {
    // All three August buyers were single-transaction, which is why August was
    // exact under the old code too — by luck, not by construction.
    const customers = [
      { total_spent: '1,500.00', last_transaction_date: '2026-08-09 10:00:00', total_transactions: 1 },
      { total_spent: '1,500.00', last_transaction_date: '2026-08-09 11:00:00', total_transactions: 1 },
      { total_spent: '1,500.00', last_transaction_date: '2026-08-09 12:00:00', total_transactions: 1 },
      { total_spent: '999.00', last_transaction_date: '2026-07-01 09:00:00', total_transactions: 1 },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okPage(customers))
      .mockResolvedValueOnce(okPage([]));
    vi.stubGlobal('fetch', fetchMock);
    try {
      expect(await paykitMonthToDateIncome('key', '2026-08')).toEqual({
        exactUsd: 4500,
        upperUsd: 4500,
        unsplittableCustomers: 0,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('a repeat buyer yields a band, not the inflated single figure', async () => {
    const customers = [
      { total_spent: '2,000.00', last_transaction_date: '2026-09-10 10:00:00', total_transactions: 3 },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okPage(customers))
      .mockResolvedValueOnce(okPage([]));
    vi.stubGlobal('fetch', fetchMock);
    try {
      expect(await paykitMonthToDateIncome('key', '2026-09')).toEqual({
        exactUsd: 0,
        upperUsd: 2000,
        unsplittableCustomers: 1,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/**
 * OS-658: /customers reports RUNNING lifetime totals, so two reads bracket the
 * money that moved between them. That is exactness the lifetime band cannot
 * reach, and it needs no endpoint PayKit does not have.
 */
describe('diffPaykitSnapshots', () => {
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
  const snap = (capturedOn: string, customers: PaykitCustomer[]): PaykitSnapshot => ({
    capturedOn,
    source: 'live',
    customers,
  });

  it('spans months inclusively across a year boundary', () => {
    expect(monthsSpanned('2026-09-01', '2026-09-30')).toEqual(['2026-09']);
    expect(monthsSpanned('2026-08-20', '2026-09-17')).toEqual(['2026-08', '2026-09']);
    expect(monthsSpanned('2025-11-30', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  // Inside one month the transaction count is irrelevant: wherever the money
  // came from, it came in that month. This is the case the old code could not
  // express at all.
  it('is exact for a repeat buyer when the window sits inside one month', () => {
    const d = diffPaykitSnapshots(
      snap('2026-09-10', [cust('a', 100000, 2, '2026-09-04T09:00:00-05:00')]),
      snap('2026-09-11', [cust('a', 250000, 4, '2026-09-11T09:00:00-05:00')]),
    );
    expect(d).toEqual({
      exactCents: { '2026-09': 150000 },
      upperCents: { '2026-09': 150000 },
      ambiguousCustomers: 0,
    });
  });

  // One new transaction IS the customer's latest, so its own date places it —
  // even when the window straddles a month boundary.
  it('dates a single new transaction across a month boundary', () => {
    const d = diffPaykitSnapshots(
      snap('2026-08-31', [cust('a', 100000, 2, '2026-07-02T09:00:00-05:00')]),
      snap('2026-09-01', [cust('a', 200000, 3, '2026-09-01T09:00:00-05:00')]),
    );
    expect(d.exactCents).toEqual({ '2026-09': 100000 });
    expect(d.ambiguousCustomers).toBe(0);
  });

  // Several transactions across a boundary: the money is real, its month is not
  // knowable. It must raise the ceiling of both candidates and the floor of
  // neither — the OS-655 discipline, on a far smaller residue.
  it('refuses to split several transactions straddling a boundary', () => {
    const d = diffPaykitSnapshots(
      snap('2026-08-31', [cust('a', 100000, 1, '2026-08-02T09:00:00-05:00')]),
      snap('2026-09-01', [cust('a', 400000, 3, '2026-09-01T09:00:00-05:00')]),
    );
    expect(d.exactCents).toEqual({});
    expect(d.upperCents).toEqual({ '2026-08': 300000, '2026-09': 300000 });
    expect(d.ambiguousCustomers).toBe(1);
  });

  it('books a customer absent from the previous snapshot as entirely new money', () => {
    const d = diffPaykitSnapshots(
      snap('2026-09-10', []),
      snap('2026-09-11', [cust('new', 500000, 1, '2026-09-11T09:00:00-05:00')]),
    );
    expect(d.exactCents).toEqual({ '2026-09': 500000 });
  });

  // A refund reverses a month we cannot identify. Booking it against the window
  // it SURFACED in would understate a month that was never credited.
  it('ignores a decrease rather than guessing which month it reverses', () => {
    const d = diffPaykitSnapshots(
      snap('2026-09-10', [cust('a', 500000, 2, '2026-08-01T09:00:00-05:00')]),
      snap('2026-09-11', [cust('a', 350000, 2, '2026-08-01T09:00:00-05:00')]),
    );
    expect(d).toEqual({ exactCents: {}, upperCents: {}, ambiguousCustomers: 0 });
  });
});

describe('paykitMonthFromSnapshots covers only what it can prove', () => {
  const one = (capturedOn: string, cents: number, txns: number, at: string | null): PaykitSnapshot => ({
    capturedOn,
    source: 'live',
    customers: [{ id: 'a', totalSpentCents: cents, transactions: txns, lastTransactionDate: at, month: at ? at.slice(0, 7) : null }],
  });

  it('returns null with fewer than two snapshots — nothing to difference', () => {
    expect(paykitMonthFromSnapshots([one('2026-09-17', 100000, 1, null)], '2026-09')).toBeNull();
  });

  // The scope line of OS-658: months that began before the first snapshot are
  // NOT answerable here, and must fall back to the band rather than report a
  // silent understatement.
  it('returns null for a month that began before the first snapshot', () => {
    const history = [one('2026-09-05', 100000, 1, null), one('2026-09-17', 200000, 2, '2026-09-10T09:00:00-05:00')];
    expect(paykitMonthFromSnapshots(history, '2026-09')).toBeNull();
    expect(paykitMonthFromSnapshots(history, '2026-08')).toBeNull();
  });

  it('rejects a snapshot taken ON the first of the month as too late', () => {
    const history = [one('2026-09-01', 100000, 1, null), one('2026-09-17', 200000, 2, '2026-09-10T09:00:00-05:00')];
    expect(paykitMonthFromSnapshots(history, '2026-09')).toBeNull();
  });

  // The measurement this card was filed on. Under the band, September rendered
  // $0 – $2,000; the truth was $1,000 and differencing recovers it exactly.
  it('recovers the September 2026 figure the band could only bound', () => {
    const history = [
      one('2026-08-20', 100000, 2, null),
      one('2026-09-17', 200000, 3, '2026-09-10T14:49:30-05:00'),
    ];
    expect(paykitMonthFromSnapshots(history, '2026-09')).toEqual({
      exactCents: 100000,
      upperCents: 100000,
      unsplittableCustomers: 0,
    });
  });

  it('sums a month across several daily windows', () => {
    const history = [
      one('2026-08-31', 0, 0, null),
      one('2026-09-05', 30000, 1, '2026-09-05T09:00:00-05:00'),
      one('2026-09-12', 80000, 2, '2026-09-12T09:00:00-05:00'),
      one('2026-09-19', 95000, 3, '2026-09-19T09:00:00-05:00'),
    ];
    expect(paykitMonthFromSnapshots(history, '2026-09')?.exactCents).toBe(95000);
  });
});

describe('paykitMonthToDateIncome with a snapshot history', () => {
  const okPage = (customers: unknown[]) =>
    new Response(JSON.stringify({ data: { customers } }), { status: 200 });

  const memoryHistory = (seed: PaykitSnapshot[] = []) => {
    const days = new Map(seed.map((s) => [s.capturedOn, s]));
    return {
      record: (s: PaykitSnapshot) => void days.set(s.capturedOn, s),
      snapshots: () => [...days.values()],
      recorded: days,
    };
  };

  // End to end: the exact same live payload that renders "$0 – $2,000" without a
  // history renders a flat $1,000 with one, because the August snapshot brackets
  // the payment. unsplittableCustomers 0 is what collapses the band in the UI.
  it('turns the September band into the exact figure', async () => {
    const history = memoryHistory([
      {
        capturedOn: '2026-08-20',
        source: 'reconstructed',
        customers: [{ id: '700001', totalSpentCents: 100000, transactions: 2, lastTransactionDate: null, month: null }],
      },
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        okPage([
          { id: 700001, total_spent: '2,000.00', last_transaction_date: '2026-09-10T14:49:30-05:00', total_transactions: 3 },
        ]),
      )
      .mockResolvedValueOnce(okPage([]));
    vi.stubGlobal('fetch', fetchMock);
    try {
      expect(await paykitMonthToDateIncome('key', '2026-09', history)).toEqual({
        exactUsd: 1000,
        upperUsd: 1000,
        unsplittableCustomers: 0,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('records the pull even when the month is not yet coverable', async () => {
    const history = memoryHistory();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        okPage([{ id: 1, total_spent: '500.00', last_transaction_date: '2026-09-10 10:00:00', total_transactions: 1 }]),
      )
      .mockResolvedValueOnce(okPage([]));
    vi.stubGlobal('fetch', fetchMock);
    try {
      // Falls back to the OS-655 band — but the snapshot is now stored, which
      // is what makes the NEXT month answerable.
      expect(await paykitMonthToDateIncome('key', '2026-09', history)).toEqual({
        exactUsd: 500,
        upperUsd: 500,
        unsplittableCustomers: 0,
      });
      expect(history.recorded.size).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Precision is worth less than the number. A store that throws must not turn a
  // real figure into null — that is the fake-$0 failure mode wearing a new hat.
  it('degrades to the band when the store throws', async () => {
    const broken = {
      record: () => {
        throw new Error('disk full');
      },
      snapshots: () => [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        okPage([{ id: 1, total_spent: '2,000.00', last_transaction_date: '2026-09-10 10:00:00', total_transactions: 3 }]),
      )
      .mockResolvedValueOnce(okPage([]));
    vi.stubGlobal('fetch', fetchMock);
    try {
      expect(await paykitMonthToDateIncome('key', '2026-09', broken)).toEqual({
        exactUsd: 0,
        upperUsd: 2000,
        unsplittableCustomers: 1,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('PayKit keys are rotatable on the host without a deploy', () => {
  test('both account keys are KEY_SLOTS', () => {
    const src = readFileSync(join(process.cwd(), 'lib/keys.ts'), 'utf8');
    expect(src).toContain("'PAYKIT_LC_KEY'");
    expect(src).toContain("'PAYKIT_VANTAGE_KEY'");
  });
});
