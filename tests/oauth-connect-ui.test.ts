import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { oauthReadiness } from '@/lib/oauth/store';
import { OAUTH_PROVIDERS } from '@/lib/oauth/providers';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * The Connections tab has to tell the truth about OAuth per provider, because
 * the answer genuinely differs: GitHub works over the private network today, Google
 * works only from localhost, and seven others need a public https redirect
 * before their Connect button can ever complete. A button that cannot finish
 * is worse than a line of text saying why.
 */
describe('oauthReadiness', () => {
  test('reports the app-registration state separately from the token state', () => {
    const r = oauthReadiness('github', {})!;
    expect(r.slug).toBe('github');
    expect(r.appConfigured).toBe(false); // no client id/secret in an empty env
    expect(r.connected).toBe(false);
    expect(r.consoleUrl).toMatch(/^https:\/\//);
    expect(r.clientIdEnv).toBe('GITHUB_OAUTH_CLIENT_ID');
  });

  test('a registered app with a token reads as connected', () => {
    const r = oauthReadiness('github', {
      GITHUB_OAUTH_CLIENT_ID: 'id',
      GITHUB_OAUTH_CLIENT_SECRET: 'sec',
      GITHUB_OAUTH_TOKEN: 'tok',
    })!;
    expect(r.appConfigured).toBe(true);
    expect(r.connected).toBe(true);
    expect(r.expired).toBe(false);
  });

  test('an expiry in the past reads as expired so the UI can say "reconnect"', () => {
    const r = oauthReadiness('google', {
      GOOGLE_OAUTH_CLIENT_ID: 'id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'sec',
      GOOGLE_OAUTH_TOKEN: 'tok',
      GOOGLE_OAUTH_TOKEN_EXPIRES_AT: String(Date.now() - 1000),
    })!;
    expect(r.expired).toBe(true);
  });

  test('a token with no recorded expiry is not treated as expired', () => {
    const r = oauthReadiness('github', { GITHUB_OAUTH_TOKEN: 'tok' })!;
    expect(r.expired).toBe(false);
  });

  test('a non-OAuth slug has no readiness at all', () => {
    expect(oauthReadiness('beehiiv', {})).toBeNull();
  });
});

describe('the tile shows the right affordance', () => {
  const flow = read('components/ConnectFlow.tsx');
  const card = read('components/ConnectionCard.tsx');

  test('a registered app gets a real link to the start route, not a fetch', () => {
    // The flow is a browser redirect chain; an XHR cannot follow it.
    expect(flow).toContain('/api/oauth/');
    expect(flow).toContain('/start');
    expect(flow).toMatch(/<a\b[^>]*href=\{`\/api\/oauth\//);
  });

  test('an unregistered app is told where to register and what URI to paste', () => {
    expect(flow).toContain('consoleUrl');
    expect(flow).toContain('/api/oauth/callback');
  });

  test('a provider needing a public https redirect says so instead of offering a dead button', () => {
    expect(flow).toContain('https-public');
  });

  test('the card threads readiness down from the server', () => {
    expect(card).toContain('oauth');
    expect(read('app/integrations/page.tsx')).toContain('oauthReadiness');
  });
});

describe('the registry stays honest about reach', () => {
  test('exactly one provider is usable over the private network host today', () => {
    const any = OAUTH_PROVIDERS.filter((p) => p.redirectKind === 'any').map((p) => p.slug);
    expect(any).toEqual(['github']);
  });

  test('google is loopback-only, which is a real limit and is recorded', () => {
    expect(OAUTH_PROVIDERS.find((p) => p.slug === 'google')?.redirectKind).toBe('loopback');
  });
});
