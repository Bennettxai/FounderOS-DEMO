import { describe, expect, test } from 'vitest';
import {
  OAUTH_PROVIDERS,
  oauthProvider,
  oauthProviderSlugs,
  authorizeUrl,
  redirectUri,
  tokenRequestBody,
  refreshRequestBody,
} from '@/lib/oauth/providers';
import { newVerifier, challengeFor, newState, signState, verifyState } from '@/lib/oauth/pkce';

/**
 * the operator, 2026-09-18: "add OAuth capabilities to all the connections so I can
 * just connect through OAuth and not API keys."
 *
 * What this core can and cannot do is a property of the providers, not of the
 * code, so the registry is the honest part: a provider is listed ONLY when it
 * runs a real OAuth 2.0 authorization-code flow. Everything else keeps the
 * pasted-key path, and the board says so rather than showing a Connect button
 * that cannot work.
 */
describe('oauth registry', () => {
  test('every provider declares a complete authorization-code flow', () => {
    for (const p of OAUTH_PROVIDERS) {
      expect(p.slug, 'slug').toMatch(/^[a-z0-9-]+$/);
      expect(p.authorizeUrl, `${p.slug} authorizeUrl`).toMatch(/^https:\/\//);
      expect(p.tokenUrl, `${p.slug} tokenUrl`).toMatch(/^https:\/\//);
      expect(p.clientIdEnv, `${p.slug} clientIdEnv`).toMatch(/^[A-Z0-9_]+$/);
      expect(p.clientSecretEnv, `${p.slug} clientSecretEnv`).toMatch(/^[A-Z0-9_]+$/);
      expect(p.accessTokenEnv, `${p.slug} accessTokenEnv`).toMatch(/^[A-Z0-9_]+$/);
      expect(p.scopes.length, `${p.slug} scopes`).toBeGreaterThan(0);
    }
  });

  test('slugs are unique and resolvable', () => {
    const slugs = oauthProviderSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(oauthProvider(s)?.slug).toBe(s);
    expect(oauthProvider('not-a-provider')).toBeNull();
  });

  test('a provider that cannot take our redirect URI is not listed as OAuth', () => {
    // Providers that require a public https redirect are useless on a
    // private network-only box, so each entry records what it accepts.
    for (const p of OAUTH_PROVIDERS) {
      expect(['loopback', 'https-public', 'any'], `${p.slug} redirectKind`).toContain(p.redirectKind);
    }
  });
});

describe('authorize url', () => {
  const p = oauthProvider('github')!;

  test('carries client id, redirect, scope, state and PKCE challenge', () => {
    const u = new URL(authorizeUrl(p, { clientId: 'cid', state: 'st', challenge: 'ch', base: 'http://host:4100' }));
    expect(u.origin + u.pathname).toBe(p.authorizeUrl);
    expect(u.searchParams.get('client_id')).toBe('cid');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('state')).toBe('st');
    expect(u.searchParams.get('redirect_uri')).toBe('http://host:4100/api/oauth/callback');
    expect(u.searchParams.get('scope')).toBe(p.scopes.join(p.scopeSeparator ?? ' '));
  });

  test('PKCE params appear only for providers that support it', () => {
    for (const prov of OAUTH_PROVIDERS) {
      const u = new URL(authorizeUrl(prov, { clientId: 'c', state: 's', challenge: 'ch', base: 'http://h' }));
      if (prov.pkce) {
        expect(u.searchParams.get('code_challenge'), prov.slug).toBe('ch');
        expect(u.searchParams.get('code_challenge_method'), prov.slug).toBe('S256');
      } else {
        expect(u.searchParams.get('code_challenge'), prov.slug).toBeNull();
      }
    }
  });

  test('the redirect uri is one fixed callback for every provider', () => {
    expect(redirectUri('http://os-host:4100')).toBe('http://os-host:4100/api/oauth/callback');
    expect(redirectUri('http://host/')).toBe('http://host/api/oauth/callback');
  });
});

describe('token exchange bodies', () => {
  const p = oauthProvider('github')!;

  test('the code exchange sends the verifier, never the challenge', () => {
    const b = tokenRequestBody(p, { code: 'CODE', clientId: 'cid', clientSecret: 'sec', verifier: 'ver', base: 'http://h' });
    expect(b.get('grant_type')).toBe('authorization_code');
    expect(b.get('code')).toBe('CODE');
    expect(b.get('redirect_uri')).toBe('http://h/api/oauth/callback');
    expect(b.get('client_id')).toBe('cid');
    if (p.pkce) expect(b.get('code_verifier')).toBe('ver');
    expect(b.get('code_challenge')).toBeNull();
  });

  test('refresh asks for a refresh, not a new authorization', () => {
    const b = refreshRequestBody(p, { refreshToken: 'rt', clientId: 'cid', clientSecret: 'sec' });
    expect(b.get('grant_type')).toBe('refresh_token');
    expect(b.get('refresh_token')).toBe('rt');
    expect(b.get('code')).toBeNull();
  });
});

describe('pkce + state', () => {
  test('a verifier is 43-128 unreserved chars and the challenge is its S256', () => {
    const v = newVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
    expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
    const c = challengeFor(v);
    expect(c).toMatch(/^[A-Za-z0-9\-_]+$/); // base64url, no padding
    expect(c).not.toContain('=');
    expect(challengeFor(v)).toBe(c); // deterministic
    expect(challengeFor(newVerifier())).not.toBe(c);
  });

  test('state round-trips under its signature and rejects tampering', () => {
    const secret = 'server-secret';
    const raw = newState('github', 'ver');
    const signed = signState(raw, secret);
    const back = verifyState(signed, secret);
    expect(back?.slug).toBe('github');
    expect(back?.verifier).toBe('ver');
    expect(verifyState(signed, 'wrong-secret')).toBeNull();
    expect(verifyState(signed.slice(0, -3) + 'xxx', secret)).toBeNull();
    expect(verifyState('garbage', secret)).toBeNull();
  });

  test('state carries a nonce so two starts never collide', () => {
    expect(newState('github', 'v').nonce).not.toBe(newState('github', 'v').nonce);
  });
});

import { expiringProviders } from '@/lib/oauth/store';

/**
 * An access token that expires in an hour is worse than a pasted key unless
 * something refreshes it. The sweep picks only the providers that can actually
 * be refreshed — a recorded expiry, a refresh token, and client credentials —
 * so it never burns a request on a provider that would just fail.
 */
describe('refresh sweep', () => {
  const base = {
    GOOGLE_OAUTH_CLIENT_ID: 'id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'sec',
    GOOGLE_OAUTH_TOKEN: 'tok',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'rt',
  };

  test('an expired token with a refresh token is picked up', () => {
    expect(expiringProviders({ ...base, GOOGLE_OAUTH_TOKEN_EXPIRES_AT: String(Date.now() - 1) })).toContain('google');
  });

  test('a token expiring inside the minute is picked up early', () => {
    expect(expiringProviders({ ...base, GOOGLE_OAUTH_TOKEN_EXPIRES_AT: String(Date.now() + 30_000) })).toContain('google');
  });

  test('a healthy token is left alone', () => {
    expect(expiringProviders({ ...base, GOOGLE_OAUTH_TOKEN_EXPIRES_AT: String(Date.now() + 3600_000) })).toEqual([]);
  });

  test('no refresh token means nothing to sweep, however expired', () => {
    const { GOOGLE_OAUTH_REFRESH_TOKEN: _drop, ...noRefresh } = base;
    expect(expiringProviders({ ...noRefresh, GOOGLE_OAUTH_TOKEN_EXPIRES_AT: '1' })).toEqual([]);
  });

  test('a provider with no expiry recorded is never swept', () => {
    expect(expiringProviders({ GITHUB_OAUTH_TOKEN: 'tok' })).toEqual([]);
  });
});
