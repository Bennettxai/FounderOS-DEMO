import { afterEach, describe, expect, test } from 'vitest';

/**
 * Launchpad Cohort tooling. The status block that used to lead this file went
 * with its connector when the webinar funnel was retired (2026-08-19); Trakyo
 * is the lane's only live attribution source now.
 */
import { trakyoStatus } from '@/lib/connectors/trakyo';

const TK = 'TRAKYO_API_KEY';
const prevTk = process.env[TK];

afterEach(() => {
  if (prevTk === undefined) delete process.env[TK];
  else process.env[TK] = prevTk;
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('trakyoStatus', () => {
  // Full coverage of the live metrics query lives in tests/trakyo.test.ts.
  test('honest not_configured without a key', async () => {
    delete process.env[TK];
    const status = await trakyoStatus((async () => json({})) as unknown as typeof fetch);
    expect(status.state).toBe('not_configured');
    expect(status.id).toBe('trakyo');
    expect(status.kind).toBe('crm');
  });

  test('connected once a key validates against /v1/metrics', async () => {
    process.env[TK] = 'tky_test_key';
    const status = await trakyoStatus((async () =>
      json({ totals: { clicks: 12, visits: 3, revenue: '0' } })) as unknown as typeof fetch);
    expect(status.state).toBe('connected');
  });
});
