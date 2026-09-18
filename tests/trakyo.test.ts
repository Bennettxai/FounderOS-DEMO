import { afterEach, describe, expect, test } from 'vitest';
import { parseTrakyoMetrics, trakyoStatus } from '@/lib/connectors/trakyo';

const TK = 'TRAKYO_API_KEY';
const prev = process.env[TK];

afterEach(() => {
  if (prev === undefined) delete process.env[TK];
  else process.env[TK] = prev;
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Mirrors the GET /v1/metrics envelope. Every number here is invented — real
 *  account figures never belong in a fixture (this repo syncs to a public demo). */
const METRICS = {
  object: 'metrics',
  range: { start: '2026-07-01', end: '2026-07-31', timezone: 'UTC' },
  attribution: 'first_touch',
  currency: 'USD',
  totals: {
    clicks: 1200,
    visits: 90,
    form_submissions: 8,
    bookings: 3,
    transactions: 2,
    revenue: '4500.50',
    aov: '1500.17',
  },
};

describe('parseTrakyoMetrics', () => {
  test('maps the /v1/metrics envelope into typed totals', () => {
    const m = parseTrakyoMetrics(METRICS);
    expect(m).toEqual({
      clicks: 1200,
      visits: 90,
      formSubmissions: 8,
      bookings: 3,
      transactions: 2,
      revenueUsd: 4500.5,
      rangeStart: '2026-07-01',
      rangeEnd: '2026-07-31',
    });
  });

  test('revenue arrives as a decimal string and becomes a number', () => {
    expect(parseTrakyoMetrics(METRICS)?.revenueUsd).toBe(4500.5);
    const zero = parseTrakyoMetrics({ ...METRICS, totals: { ...METRICS.totals, revenue: '0' } });
    expect(zero?.revenueUsd).toBe(0);
  });

  test('missing optional counters collapse to 0 rather than NaN', () => {
    const sparse = parseTrakyoMetrics({
      ...METRICS,
      totals: { clicks: 5, revenue: '0' },
    });
    expect(sparse?.clicks).toBe(5);
    expect(sparse?.bookings).toBe(0);
    expect(sparse?.transactions).toBe(0);
    expect(Number.isNaN(sparse?.revenueUsd)).toBe(false);
  });

  test('returns null when the payload has no totals object', () => {
    expect(parseTrakyoMetrics({ object: 'metrics' })).toBeNull();
    expect(parseTrakyoMetrics(null)).toBeNull();
    expect(parseTrakyoMetrics('nope')).toBeNull();
  });
});

describe('trakyoStatus', () => {
  test('not_configured without a key — and makes no network call', async () => {
    delete process.env[TK];
    let called = false;
    const status = await trakyoStatus((async () => {
      called = true;
      return json(METRICS);
    }) as unknown as typeof fetch);
    expect(status.state).toBe('not_configured');
    expect(status.id).toBe('trakyo');
    expect(status.kind).toBe('crm');
    expect(called).toBe(false);
  });

  test('connected reports live totals from the account', async () => {
    process.env[TK] = 'tky_test_key';
    const status = await trakyoStatus((async () => json(METRICS)) as unknown as typeof fetch);
    expect(status.state).toBe('connected');
    expect(status.detail).toContain('1200'); // clicks
    expect(status.meta?.formSubmissions).toBe(8);
  });

  test('sends the key as a bearer token', async () => {
    process.env[TK] = 'tky_test_key';
    let auth = '';
    await trakyoStatus((async (_url: string, init: RequestInit) => {
      auth = String((init.headers as Record<string, string>).Authorization);
      return json(METRICS);
    }) as unknown as typeof fetch);
    expect(auth).toBe('Bearer tky_test_key');
  });

  test('error — never a fake connected — when the key is rejected', async () => {
    process.env[TK] = 'bad';
    const status = await trakyoStatus((async () =>
      json({ error: 'unauthorized' }, 401)) as unknown as typeof fetch);
    expect(status.state).toBe('error');
  });

  test('error when the endpoint answers 200 with an unusable body', async () => {
    process.env[TK] = 'tky_test_key';
    const status = await trakyoStatus((async () => json({ object: 'metrics' })) as unknown as typeof fetch);
    expect(status.state).toBe('error');
  });
});
