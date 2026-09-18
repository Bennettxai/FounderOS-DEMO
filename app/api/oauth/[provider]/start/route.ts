import { NextResponse } from 'next/server';
import { authorizeUrl, oauthProvider, redirectUri } from '@/lib/oauth/providers';
import { stateSecret } from '@/lib/oauth/store';
import { newState, newVerifier, challengeFor, signState } from '@/lib/oauth/pkce';
import { readEnvLocal } from '@/lib/creds';

export const dynamic = 'force-dynamic';

/**
 * Step one of the authorization-code flow: mint a verifier, sign it into the
 * state, and bounce the browser to the provider. The verifier never goes to
 * the provider, only its S256 challenge.
 *
 * The base URL is taken from the request, not from config, so the redirect the
 * provider is handed always matches the host the operator actually opened the OS on
 * (localhost on the box, or the private network name). Registering both in the app's
 * console is what makes either work.
 */
export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const p = oauthProvider(params.provider);
  if (!p) return NextResponse.json({ ok: false, error: 'unknown provider' }, { status: 404 });

  const env = { ...readEnvLocal(), ...process.env } as Record<string, string>;
  const clientId = env[p.clientIdEnv];
  if (!clientId || !env[p.clientSecretEnv]) {
    return NextResponse.json(
      {
        ok: false,
        error: `${p.name} has no OAuth app yet`,
        detail: `Register one at ${p.consoleUrl}, set redirect URI to ${redirectUri(new URL(req.url).origin)}, then save ${p.clientIdEnv} and ${p.clientSecretEnv}.`,
      },
      { status: 400 },
    );
  }

  const verifier = newVerifier();
  const state = signState(newState(p.slug, verifier), stateSecret());
  const url = authorizeUrl(p, {
    clientId,
    state,
    challenge: challengeFor(verifier),
    base: new URL(req.url).origin,
  });
  return NextResponse.redirect(url, 302);
}
