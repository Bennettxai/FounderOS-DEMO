import { afterEach, describe, expect, test, vi } from 'vitest';
import { imapClientOptions, parseInboxConfigs } from '@/lib/connectors/email';
import { configuredProcessors } from '@/lib/connectors/payments';
import { metaAdsStatus } from '@/lib/connectors/meta-ads';
import { ghlStatus } from '@/lib/connectors/ghl';

describe('parseInboxConfigs', () => {
  test('returns empty when nothing is configured', () => {
    expect(parseInboxConfigs({})).toEqual([]);
  });

  test('parses up to four complete inbox slots', () => {
    const env = {
      INBOX_1_HOST: 'imap.gmail.com',
      INBOX_1_USER: 'admin@founderos.ai',
      INBOX_1_PASS: 'app-pass-1',
      INBOX_2_HOST: 'imap.gmail.com',
      INBOX_2_USER: 'alex@example.com',
      INBOX_2_PASS: 'app-pass-2',
      INBOX_2_NAME: 'LC Main',
      INBOX_3_HOST: 'imap.fastmail.com',
      INBOX_3_PORT: '1993',
      INBOX_3_USER: 'ops@vantage.co',
      INBOX_3_PASS: 'app-pass-3',
      INBOX_4_HOST: 'imap.gmail.com',
      INBOX_4_USER: 'personal@gmail.com',
      INBOX_4_PASS: 'app-pass-4',
    };
    const inboxes = parseInboxConfigs(env);
    expect(inboxes).toHaveLength(4);
    expect(inboxes[0]).toEqual({
      id: 'inbox-1',
      name: 'admin@founderos.ai',
      host: 'imap.gmail.com',
      port: 993,
      user: 'admin@founderos.ai',
      pass: 'app-pass-1',
      smtpHost: 'smtp.gmail.com', // imap. → smtp. default
      smtpPort: 465,
    });
    expect(inboxes[1].name).toBe('LC Main');
    expect(inboxes[2].port).toBe(1993);
  });

  test('imap clients fail fast: connect/greeting/socket timeouts are always set', () => {
    // Without these, a throttled Gmail connect hangs the home render and the
    // comms feed for tens of seconds (dashboards must degrade, not stall).
    const opts = imapClientOptions({
      id: 'inbox-1', name: 'x', host: 'imap.gmail.com', port: 993,
      user: 'a@b.c', pass: 'p', smtpHost: 'smtp.gmail.com', smtpPort: 465,
    });
    expect(opts.connectionTimeout).toBeLessThanOrEqual(5000);
    expect(opts.greetingTimeout).toBeLessThanOrEqual(5000);
    expect(opts.socketTimeout).toBeLessThanOrEqual(10000);
    expect(opts.host).toBe('imap.gmail.com');
    expect(opts.auth).toEqual({ user: 'a@b.c', pass: 'p' });
  });

  test('skips slots that are missing host, user, or pass', () => {
    const env = {
      INBOX_1_HOST: 'imap.gmail.com',
      INBOX_1_USER: 'a@b.c',
      // no pass — incomplete
      INBOX_2_HOST: 'imap.gmail.com',
      INBOX_2_USER: 'x@y.z',
      INBOX_2_PASS: 'ok',
    };
    const inboxes = parseInboxConfigs(env);
    expect(inboxes).toHaveLength(1);
    expect(inboxes[0].id).toBe('inbox-2');
  });
});

describe('metaAdsStatus', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('reports not_configured without a token — never a fake connected', async () => {
    vi.stubEnv('META_ADS_ACCESS_TOKEN', '');
    const status = await metaAdsStatus();
    expect(status.id).toBe('meta-ads');
    expect(status.kind).toBe('ads');
    expect(status.state).toBe('not_configured');
    expect(status.detail).toMatch(/META_ADS_ACCESS_TOKEN/);
  });

  test('reports connected once META_ADS_ACCESS_TOKEN is set', async () => {
    vi.stubEnv('META_ADS_ACCESS_TOKEN', 'EAAG-test-token');
    const status = await metaAdsStatus();
    expect(status.state).toBe('connected');
  });
});

describe('ghlStatus', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('needs BOTH the private-integration token and the location id', async () => {
    vi.stubEnv('GHL_API_KEY', 'pit-token');
    vi.stubEnv('GHL_LOCATION_ID', '');
    expect((await ghlStatus()).state).toBe('not_configured');
    vi.stubEnv('GHL_LOCATION_ID', 'loc_123');
    const status = await ghlStatus();
    expect(status.state).toBe('connected');
    expect(status.id).toBe('ghl');
    expect(status.kind).toBe('crm');
  });
});

describe('configuredProcessors', () => {
  test('reports all processors unconfigured with an empty env', () => {
    const procs = configuredProcessors({});
    expect(procs.length).toBeGreaterThanOrEqual(3);
    expect(procs.every((p) => !p.configured)).toBe(true);
  });

  test('detects Stripe when STRIPE_SECRET_KEY is set', () => {
    const procs = configuredProcessors({ STRIPE_SECRET_KEY: 'sk_test_123' });
    const stripe = procs.find((p) => p.id === 'stripe');
    expect(stripe?.configured).toBe(true);
  });

  test('detects PayPal only when both client id and secret are set', () => {
    expect(
      configuredProcessors({ PAYPAL_CLIENT_ID: 'cid' }).find((p) => p.id === 'paypal')?.configured,
    ).toBe(false);
    expect(
      configuredProcessors({ PAYPAL_CLIENT_ID: 'cid', PAYPAL_CLIENT_SECRET: 'sec' }).find(
        (p) => p.id === 'paypal',
      )?.configured,
    ).toBe(true);
  });
});
