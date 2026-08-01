import { describe, it, expect } from 'vitest';
import {
  configuredProcessors,
  parseWiseTransfers,
  parseFanbasisCustomers,
  sumFanbasisMonthCents,
} from '@/lib/connectors/payments';

describe('configuredProcessors', () => {
  it('lists the 6 real processors; configured derives from env keys', () => {
    const procs = configuredProcessors({
      STRIPE_SECRET_KEY: 'sk_x',
      PAYPAL_CLIENT_ID: 'a',
      PAYPAL_CLIENT_SECRET: 'b',
      FANBASIS_VANTAGE_KEY: 'm',
      WISE_1_TOKEN: 'w1',
    });
    expect(procs.map((p) => p.id)).toEqual([
      'stripe',
      'paypal',
      'fanbasis-vantage',
      'fanbasis-lc',
      'wise-1',
      'wise-2',
    ]);
    const byId = Object.fromEntries(procs.map((p) => [p.id, p.configured]));
    expect(byId.stripe).toBe(true);
    expect(byId.paypal).toBe(true);
    expect(byId['fanbasis-vantage']).toBe(true);
    expect(byId['fanbasis-lc']).toBe(false);
    expect(byId['wise-1']).toBe(true);
    expect(byId['wise-2']).toBe(false);
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

describe('parseFanbasisCustomers + sumFanbasisMonthCents', () => {
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
    expect(parseFanbasisCustomers(payload)).toEqual([
      { totalSpentCents: 340000, month: '2026-06' },
      { totalSpentCents: 125000, month: '2026-06' },
      { totalSpentCents: 50000, month: '2026-05' },
    ]);
  });

  it('sums spend for customers whose latest transaction is in the given month', () => {
    const cs = parseFanbasisCustomers(payload);
    expect(sumFanbasisMonthCents(cs, '2026-06')).toBe(465000); // 3400 + 1250
    expect(sumFanbasisMonthCents(cs, '2026-05')).toBe(50000);
  });

  it('returns [] for malformed input', () => {
    expect(parseFanbasisCustomers(null)).toEqual([]);
    expect(parseFanbasisCustomers({})).toEqual([]);
  });
});
