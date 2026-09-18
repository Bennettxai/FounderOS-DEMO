import { NextResponse } from 'next/server';
import { oauthProvider, tokenRequestBody } from '@/lib/oauth/providers';
import { accessTokenOf, saveTokens, stateSecret, type TokenResponse } from '@/lib/oauth/store';
import { verifyState } from '@/lib/oauth/pkce';
import { readEnvLocal } from '@/lib/creds';

export const dynamic = 'force-dynamic';

/** One callback for every provider; `state` says which one it was. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (msg: string, ok = false) =>
    NextResponse.redirect(`${url.origin}/integrations?oauth=${ok ? 'ok' : 'error'}&msg=${encodeURIComponent(msg)}`, 302);

  const denied = url.searchParams.get('error');
  if (denied) return back(url.searchParams.get('error_description') || denied);

  const code = url.searchParams.get('code');
  const rawState = url.searchParams.get('state');
  if (!code || !rawState) return back('the provider came back without a code');

  const state = verifyState(rawState, stateSecret());
  if (!state) return back('that authorization did not start here, or it expired');

  const p = oauthProvider(state.slug);
  if (!p) return back('unknown provider');

  const env = { ...readEnvLocal(), ...process.env } as Record<string, string>;
  const clientId = env[p.clientIdEnv];
  const clientSecret = env[p.clientSecretEnv];
  if (!clientId || !clientSecret) return back(`${p.name} lost its client credentials mid-flow`);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };
    if (p.basicAuth) {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    }
    const res = await fetch(p.tokenUrl, {
      method: 'POST',
      headers,
      body: tokenRequestBody(p, { code, clientId, clientSecret, verifier: state.verifier, base: url.origin }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json()) as TokenResponse;
    if (!res.ok || body.error) return back(body.error_description || body.error || `token exchange failed (${res.status})`);
    if (!accessTokenOf(body)) return back('the provider returned no access token');
    const { saved } = saveTokens(p, body);
    return back(`${p.name} connected · ${saved.length} value${saved.length === 1 ? '' : 's'} stored`, true);
  } catch (err) {
    return back(err instanceof Error ? err.message : 'token exchange failed');
  }
}
