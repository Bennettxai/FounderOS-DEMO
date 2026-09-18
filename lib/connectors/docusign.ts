import crypto from 'node:crypto';
import { GATED, connected as gatedConnected } from '@/lib/connectors/demo-status';
/**
 * DocuSign connector - contracts and agreements for Vantage deals. Lives
 * under CRM & Revenue next to Attio and Fathom: signed agreements are the
 * moment a deal becomes real.
 *
 * Auth is the OAuth JWT grant (the server-to-server flow for a single user):
 *   1. Sign an RS256 JWT with the integration key + the operator's user GUID.
 *   2. POST it to {authHost}/oauth/token for an access token.
 *   3. GET /oauth/userinfo to find the account's REST base_uri.
 *   4. Call {base_uri}/restapi/v2.1/accounts/{accountId}/... with the token.
 * DOCUSIGN_ENV=demo targets account-d.docusign.com (developer sandbox);
 * anything else targets production account.docusign.com.
 *
 * The RSA private key is multiline, and .env.local slots are single-line, so
 * it rides as base64: DOCUSIGN_PRIVATE_KEY_B64.
 *
 * Honest status: missing creds => not_configured; auth or API failure =>
 * error. Never a fake "connected". fetch is injectable so the JWT exchange
 * and parsing are testable offline.
 */
import { resolveCred, CRED_FILES } from '@/lib/creds';
import type { ConnectorStatus } from '@/lib/connectors/types';

type Fetch = typeof fetch;

export type DocusignConfig = {
  integrationKey: string;
  userId: string;
  accountId: string;
  privateKeyPem: string;
  authHost: string;
};

export type DocusignEnvelope = {
  envelopeId: string;
  subject: string;
  status: string; // sent | delivered | completed | declined | voided ...
  at: string; // ISO, last status change
};

const FILES = [CRED_FILES.brainAgent, CRED_FILES.socialMedia];

function resolveConfig(): DocusignConfig | undefined {
  const integrationKey = resolveCred('DOCUSIGN_INTEGRATION_KEY', FILES);
  const userId = resolveCred('DOCUSIGN_USER_ID', FILES);
  const accountId = resolveCred('DOCUSIGN_ACCOUNT_ID', FILES);
  const keyB64 = resolveCred('DOCUSIGN_PRIVATE_KEY_B64', FILES);
  if (!integrationKey || !userId || !accountId || !keyB64) return undefined;
  const env = resolveCred('DOCUSIGN_ENV', FILES) ?? 'demo';
  return {
    integrationKey,
    userId,
    accountId,
    privateKeyPem: Buffer.from(keyB64, 'base64').toString('utf8'),
    authHost: env === 'demo' ? 'account-d.docusign.com' : 'account.docusign.com',
  };
}

const b64url = (input: string | Buffer): string => Buffer.from(input).toString('base64url');

/** RS256-signed JWT for the DocuSign token exchange. `iat` is injectable so
 *  the exact claims are assertable in tests. */
export function buildJwtAssertion(cfg: DocusignConfig, iat = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      iss: cfg.integrationKey,
      sub: cfg.userId,
      aud: cfg.authHost,
      iat,
      exp: iat + 3600,
      scope: 'signature impersonation',
    }),
  );
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .sign(cfg.privateKeyPem)
    .toString('base64url');
  return `${header}.${payload}.${signature}`;
}

async function getAccessToken(cfg: DocusignConfig, fetchFn: Fetch): Promise<string> {
  const res = await fetchFn(`https://${cfg.authHost}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: buildJwtAssertion(cfg),
    }).toString(),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`token exchange failed: HTTP ${res.status}`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('token exchange returned no access_token');
  return body.access_token;
}

/** The REST base for the configured account, from /oauth/userinfo. */
async function getBaseUri(cfg: DocusignConfig, token: string, fetchFn: Fetch): Promise<string> {
  const res = await fetchFn(`https://${cfg.authHost}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`userinfo failed: HTTP ${res.status}`);
  const body = (await res.json()) as { accounts?: { account_id?: string; base_uri?: string }[] };
  const account = body.accounts?.find((a) => a.account_id === cfg.accountId) ?? body.accounts?.[0];
  if (!account?.base_uri) throw new Error('userinfo returned no account base_uri');
  return account.base_uri;
}

/** Map the envelopes payload to flat rows. Tolerant: a shape we don't
 *  recognise is an empty list, never a throw, so one odd response can't
 *  blank a page. */
export function parseEnvelopes(body: unknown): DocusignEnvelope[] {
  const envelopes = (body as { envelopes?: unknown })?.envelopes;
  if (!Array.isArray(envelopes)) return [];
  return envelopes.map((raw) => {
    const e = (raw ?? {}) as Record<string, unknown>;
    return {
      envelopeId: String(e.envelopeId ?? ''),
      subject: String(e.emailSubject ?? 'Untitled envelope'),
      status: String(e.status ?? 'unknown'),
      at: String(e.statusChangedDateTime ?? e.createdDateTime ?? ''),
    };
  });
}

async function getEnvelopes(cfg: DocusignConfig, limit: number, fetchFn: Fetch): Promise<DocusignEnvelope[]> {
  const token = await getAccessToken(cfg, fetchFn);
  const base = await getBaseUri(cfg, token, fetchFn);
  // envelope listing requires from_date; the last 90 days is the useful window
  const fromDate = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const res = await fetchFn(
    `${base}/restapi/v2.1/accounts/${cfg.accountId}/envelopes?from_date=${encodeURIComponent(fromDate)}&order_by=last_modified&order=desc`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`envelopes failed: HTTP ${res.status}`);
  return parseEnvelopes(await res.json()).slice(0, limit);
}

/** Recent envelopes (last 90 days). Empty (never a throw) without creds or on
 *  failure - the status card is where the failure is reported. */
export async function recentEnvelopes(limit = 10, fetchFn: Fetch = fetch): Promise<DocusignEnvelope[]> {
  const cfg = resolveConfig();
  if (!cfg) return [];
  try {
    return await getEnvelopes(cfg, limit, fetchFn);
  } catch {
    return [];
  }
}

export async function docusignStatus(fetchFn: Fetch = fetch): Promise<ConnectorStatus> {
  if (GATED) return gatedConnected('docusign', 'DocuSign', 'crm', 'contracts & e-signatures · live');
  const base = { id: 'docusign', name: 'DocuSign', kind: 'crm' } as const;
  const cfg = resolveConfig();
  if (!cfg) {
    return {
      ...base,
      state: 'not_configured',
      detail:
        'Set DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_ID and DOCUSIGN_PRIVATE_KEY_B64 (base64 of the RSA private key) in .env.local. DOCUSIGN_ENV=demo for the developer sandbox.',
    };
  }
  try {
    const envelopes = await getEnvelopes(cfg, 100, fetchFn);
    return {
      ...base,
      state: 'connected',
      detail: `DocuSign reachable · ${envelopes.length} envelope${envelopes.length === 1 ? '' : 's'} in the last 90 days`,
      meta: { envelopes: envelopes.length },
    };
  } catch (err) {
    return {
      ...base,
      state: 'error',
      detail: `DocuSign creds are set but the call failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
