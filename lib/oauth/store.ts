import { randomBytes } from 'node:crypto';
import { readEnvLocal, upsertEnvLocal } from '@/lib/creds';
import { OAUTH_PROVIDERS, oauthProvider, refreshRequestBody, type OAuthProvider } from '@/lib/oauth/providers';

/**
 * Where OAuth results live. Same destination as the pasted keys they replace:
 * .env.local, gitignored, read fresh at call time, so a token takes effect
 * without a restart and every existing connector keeps reading the env var it
 * already reads. Nothing about the connectors has to change for OAuth to feed
 * them, which is the whole point.
 */

/** The HMAC key for `state`. Minted once and kept, so a restart mid-flow does
 *  not invalidate an authorization the user is halfway through. */
export function stateSecret(): string {
  const env = readEnvLocal();
  const existing = env.OAUTH_STATE_SECRET || process.env.OAUTH_STATE_SECRET;
  if (existing) return existing;
  const minted = randomBytes(32).toString('hex');
  // Under test the secret stays in memory: minting is a side effect on a
  // credentials file, and a suite run must not leave one behind.
  if (!process.env.VITEST) upsertEnvLocal({ OAUTH_STATE_SECRET: minted });
  return minted;
}

export type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  /** Slack nests the bot token instead of returning it at the top level. */
  authed_user?: { access_token?: string };
  error?: string;
  error_description?: string;
};

/** Pull the usable access token out of a provider's reply shape. */
export function accessTokenOf(body: TokenResponse): string | null {
  return body.access_token || body.authed_user?.access_token || null;
}

/** Persist a token set under the env names the provider's connector reads. */
export function saveTokens(p: OAuthProvider, body: TokenResponse): { saved: string[] } {
  const access = accessTokenOf(body);
  const values: Record<string, string> = {};
  if (access) values[p.accessTokenEnv] = access;
  if (p.refreshTokenEnv && body.refresh_token) values[p.refreshTokenEnv] = body.refresh_token;
  if (body.expires_in && Number.isFinite(body.expires_in)) {
    values[`${p.accessTokenEnv}_EXPIRES_AT`] = String(Date.now() + body.expires_in * 1000);
  }
  if (Object.keys(values).length > 0) upsertEnvLocal(values);
  return { saved: Object.keys(values) };
}

/** True when a stored token is past, or within a minute of, its expiry. */
export function isExpired(env: Record<string, string>, p: OAuthProvider, now = Date.now()): boolean {
  const at = Number(env[`${p.accessTokenEnv}_EXPIRES_AT`]);
  if (!Number.isFinite(at) || at === 0) return false; // no expiry recorded = not expiring
  return now >= at - 60_000;
}

/**
 * Refresh one provider's access token in place. Returns null when it cannot
 * (no refresh token, no client credentials, or the provider said no) rather
 * than throwing, because every caller is a status check that must fail soft.
 */
export async function refreshToken(slug: string, doFetch: typeof fetch = fetch): Promise<string | null> {
  const p = oauthProvider(slug);
  if (!p?.refreshTokenEnv) return null;
  const env = { ...readEnvLocal(), ...process.env } as Record<string, string>;
  const refresh = env[p.refreshTokenEnv];
  const clientId = env[p.clientIdEnv];
  const clientSecret = env[p.clientSecretEnv];
  if (!refresh || !clientId || !clientSecret) return null;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };
    if (p.basicAuth) {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    }
    const res = await doFetch(p.tokenUrl, {
      method: 'POST',
      headers,
      body: refreshRequestBody(p, { refreshToken: refresh, clientId, clientSecret }).toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as TokenResponse;
    const access = accessTokenOf(body);
    if (!access) return null;
    saveTokens(p, body);
    return access;
  } catch {
    return null;
  }
}

/** What the board needs to decide which affordance to show for a provider. */
export function oauthReadiness(slug: string, env: Record<string, string> = readEnvLocal()) {
  const p = oauthProvider(slug);
  if (!p) return null;
  const merged = { ...env, ...process.env } as Record<string, string>;
  return {
    slug: p.slug,
    name: p.name,
    redirectKind: p.redirectKind,
    consoleUrl: p.consoleUrl,
    clientIdEnv: p.clientIdEnv,
    clientSecretEnv: p.clientSecretEnv,
    /** The app itself is registered: without this the button cannot start. */
    appConfigured: Boolean(merged[p.clientIdEnv] && merged[p.clientSecretEnv]),
    /** A token is already in hand. */
    connected: Boolean(merged[p.accessTokenEnv]),
    expired: isExpired(merged, p),
  };
}

/**
 * Which providers are worth a refresh right now: an expiry that has passed (or
 * is within the minute), a refresh token to spend, and the client credentials
 * to spend it with. Anything missing one of the three is skipped rather than
 * attempted, because a refresh that cannot succeed is just latency on a
 * status check.
 */
export function expiringProviders(env: Record<string, string> = readEnvLocal()): string[] {
  const merged = { ...env } as Record<string, string>;
  return OAUTH_PROVIDERS.filter((p) => {
    if (!p.refreshTokenEnv) return false;
    if (!merged[p.refreshTokenEnv] || !merged[p.clientIdEnv] || !merged[p.clientSecretEnv]) return false;
    const at = Number(merged[`${p.accessTokenEnv}_EXPIRES_AT`]);
    if (!Number.isFinite(at) || at === 0) return false;
    return isExpired(merged, p);
  }).map((p) => p.slug);
}

/** Refresh every provider the sweep names. Returns the slugs that succeeded. */
export async function refreshExpiredOAuth(doFetch: typeof fetch = fetch): Promise<string[]> {
  const slugs = expiringProviders({ ...readEnvLocal(), ...process.env } as Record<string, string>);
  if (slugs.length === 0) return [];
  const done = await Promise.all(slugs.map(async (s) => ((await refreshToken(s, doFetch)) ? s : null)));
  return done.filter((s): s is string => s !== null);
}
