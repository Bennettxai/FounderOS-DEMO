import { describe, expect, test, afterEach } from 'vitest';
import crypto from 'node:crypto';
import {
  buildJwtAssertion,
  parseEnvelopes,
  docusignStatus,
  recentEnvelopes,
} from '@/lib/connectors/docusign';

/**
 * DocuSign connector. Auth is OAuth JWT grant: an RS256-signed assertion is
 * exchanged at account-d.docusign.com (demo) / account.docusign.com (prod)
 * for an access token; the API base comes from /oauth/userinfo. Honest
 * states: missing creds ⇒ not_configured, auth/API failure ⇒ error, working
 * ⇒ connected with the recent envelope count.
 */

const OLD = { ...process.env };
afterEach(() => {
  process.env = { ...OLD };
});

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

const CFG = {
  integrationKey: 'ik-123',
  userId: 'user-456',
  accountId: 'acct-789',
  privateKeyPem: privatePem,
  authHost: 'account-d.docusign.com',
};

function setEnv() {
  process.env.DOCUSIGN_INTEGRATION_KEY = CFG.integrationKey;
  process.env.DOCUSIGN_USER_ID = CFG.userId;
  process.env.DOCUSIGN_ACCOUNT_ID = CFG.accountId;
  process.env.DOCUSIGN_PRIVATE_KEY_B64 = Buffer.from(privatePem).toString('base64');
  process.env.DOCUSIGN_ENV = 'demo';
}

function clearEnv() {
  delete process.env.DOCUSIGN_INTEGRATION_KEY;
  delete process.env.DOCUSIGN_USER_ID;
  delete process.env.DOCUSIGN_ACCOUNT_ID;
  delete process.env.DOCUSIGN_PRIVATE_KEY_B64;
  delete process.env.DOCUSIGN_ENV;
}

const envelopesBody = {
  resultSetSize: '2',
  envelopes: [
    {
      envelopeId: 'env-1',
      emailSubject: 'Vantage - AI intake build agreement',
      status: 'completed',
      statusChangedDateTime: '2026-08-05T12:00:00Z',
    },
    {
      envelopeId: 'env-2',
      emailSubject: 'Vantage - ops retainer',
      status: 'sent',
      statusChangedDateTime: '2026-08-06T09:30:00Z',
    },
  ],
};

/** Mock the three-legged flow: token, userinfo, envelope list. */
const okFetch = (
  overrides: { tokenStatus?: number; envStatus?: number; envBody?: unknown } = {},
): typeof fetch =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

    if (u === 'https://account-d.docusign.com/oauth/token') {
      const params = new URLSearchParams(String(init?.body));
      if (params.get('grant_type') !== 'urn:ietf:params:oauth:grant-type:jwt-bearer')
        throw new Error('wrong grant_type');
      if (!params.get('assertion')) throw new Error('missing assertion');
      if (overrides.tokenStatus) return json({ error: 'consent_required' }, overrides.tokenStatus);
      return json({ access_token: 'tok-abc', expires_in: 3600 });
    }
    if (u === 'https://account-d.docusign.com/oauth/userinfo') {
      const headers = new Headers(init?.headers);
      if (headers.get('Authorization') !== 'Bearer tok-abc') throw new Error('missing bearer');
      return json({
        accounts: [
          { account_id: 'other', base_uri: 'https://wrong.docusign.net' },
          { account_id: 'acct-789', base_uri: 'https://demo.docusign.net' },
        ],
      });
    }
    if (u.startsWith('https://demo.docusign.net/restapi/v2.1/accounts/acct-789/envelopes')) {
      const headers = new Headers(init?.headers);
      if (headers.get('Authorization') !== 'Bearer tok-abc') throw new Error('missing bearer');
      if (!u.includes('from_date=')) throw new Error('missing from_date');
      if (overrides.envStatus) return json({ error: 'nope' }, overrides.envStatus);
      return json(overrides.envBody ?? envelopesBody);
    }
    throw new Error(`unexpected url ${u}`);
  }) as unknown as typeof fetch;

describe('buildJwtAssertion', () => {
  test('produces a valid RS256 JWT with DocuSign claims', () => {
    const assertion = buildJwtAssertion(CFG, 1_700_000_000);
    const [h, p, sig] = assertion.split('.');
    expect(sig).toBeTruthy();

    const header = JSON.parse(Buffer.from(h, 'base64url').toString());
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });

    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    expect(payload.iss).toBe('ik-123');
    expect(payload.sub).toBe('user-456');
    expect(payload.aud).toBe('account-d.docusign.com');
    expect(payload.scope).toBe('signature impersonation');
    expect(payload.iat).toBe(1_700_000_000);
    expect(payload.exp).toBe(1_700_000_000 + 3600);

    const verified = crypto
      .createVerify('RSA-SHA256')
      .update(`${h}.${p}`)
      .verify(publicKey, Buffer.from(sig, 'base64url'));
    expect(verified).toBe(true);
  });
});

describe('parseEnvelopes', () => {
  test('maps the API shape to flat rows', () => {
    const rows = parseEnvelopes(envelopesBody);
    expect(rows).toHaveLength(2);
    expect(rows[0].subject).toBe('Vantage - AI intake build agreement');
    expect(rows[0].status).toBe('completed');
    expect(rows[0].envelopeId).toBe('env-1');
    expect(rows[0].at).toBe('2026-08-05T12:00:00Z');
  });

  test('tolerates a missing/!array payload instead of throwing', () => {
    expect(parseEnvelopes({})).toEqual([]);
    expect(parseEnvelopes(null)).toEqual([]);
    expect(parseEnvelopes({ envelopes: 'nope' })).toEqual([]);
  });
});

describe('docusignStatus', () => {
  test('not_configured without creds, and names the keys to set', async () => {
    clearEnv();
    const s = await docusignStatus(okFetch());
    expect(s.state).toBe('not_configured');
    expect(s.detail).toContain('DOCUSIGN_INTEGRATION_KEY');
    expect(s.id).toBe('docusign');
  });

  test('connected with working creds, reporting recent envelope count', async () => {
    setEnv();
    const s = await docusignStatus(okFetch());
    expect(s.state).toBe('connected');
    expect(s.detail).toContain('2');
    expect(s.meta?.envelopes).toBe(2);
  });

  test('error (never fake connected) when the token exchange is rejected', async () => {
    setEnv();
    const s = await docusignStatus(okFetch({ tokenStatus: 400 }));
    expect(s.state).toBe('error');
    expect(s.detail).toContain('400');
  });

  test('error when the envelopes call fails', async () => {
    setEnv();
    const s = await docusignStatus(okFetch({ envStatus: 401 }));
    expect(s.state).toBe('error');
  });
});

describe('recentEnvelopes', () => {
  test('returns [] without creds rather than throwing', async () => {
    clearEnv();
    expect(await recentEnvelopes(5, okFetch())).toEqual([]);
  });

  test('returns parsed envelopes with creds, honouring the limit', async () => {
    setEnv();
    const rows = await recentEnvelopes(1, okFetch());
    expect(rows).toHaveLength(1);
    expect(rows[0].subject).toBe('Vantage - AI intake build agreement');
  });

  test('returns [] on API failure rather than throwing', async () => {
    setEnv();
    expect(await recentEnvelopes(5, okFetch({ envStatus: 500 }))).toEqual([]);
  });
});
