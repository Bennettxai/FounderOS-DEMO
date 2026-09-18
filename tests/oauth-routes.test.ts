import { describe, expect, test } from 'vitest';

/**
 * The two OAuth endpoints, which answer with redirects rather than JSON and so
 * sit outside the smoke net in tests/smoke-api.test.ts.
 */
describe('GET /api/oauth/[provider]/start', () => {
  test('an unknown provider is a 404, not a redirect into nowhere', async () => {
    const mod = await import('@/app/api/oauth/[provider]/start/route');
    const res = await mod.GET(new Request('http://localhost/api/oauth/nope/start'), {
      params: { provider: 'nope' },
    });
    expect(res.status).toBe(404);
  });

  test('a known provider with no app registered explains itself instead of failing', async () => {
    const mod = await import('@/app/api/oauth/[provider]/start/route');
    const res = await mod.GET(new Request('http://localhost/api/oauth/github/start'), {
      params: { provider: 'github' },
    });
    // Either it redirects (credentials happen to be present) or it returns the
    // 400 that names the console URL and the exact redirect URI to register.
    expect([302, 400]).toContain(res.status);
    if (res.status === 400) {
      const body = (await res.json()) as { detail?: string };
      expect(body.detail).toContain('/api/oauth/callback');
      expect(body.detail).toContain('GITHUB_OAUTH_CLIENT_ID');
    }
  });
});

describe('GET /api/oauth/callback', () => {
  const call = async (qs: string) => {
    const mod = await import('@/app/api/oauth/callback/route');
    return mod.GET(new Request(`http://localhost/api/oauth/callback${qs}`));
  };

  test('a provider-side denial comes back to the board with the reason', async () => {
    const res = await call('?error=access_denied&error_description=user%20said%20no');
    expect(res.status).toBe(302);
    const loc = res.headers.get('location')!;
    expect(loc).toContain('/integrations?oauth=error');
    expect(decodeURIComponent(loc)).toContain('user said no');
  });

  test('a callback with no code is refused', async () => {
    const loc = (await call('')).headers.get('location')!;
    expect(loc).toContain('oauth=error');
  });

  test('a forged state never reaches a token exchange', async () => {
    const loc = (await call('?code=abc&state=forged.signature')).headers.get('location')!;
    expect(decodeURIComponent(loc)).toContain('did not start here');
  });
});
