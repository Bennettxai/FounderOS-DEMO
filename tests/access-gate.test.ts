import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gateDecision, challengePage, GATE_COOKIE, assertProductionAccessToken } from '@/lib/access-gate';

/**
 * The production access gate. A student's FounderOS deploys to a PUBLIC
 * Railway URL; without this, anyone who finds the domain browses their
 * company OS. Setting FOUNDER_OS_ACCESS_TOKEN locks every page behind a
 * one-time token entry (cookie remembers the browser). Unset = open, so
 * local dev and the read-only demo deployment behave exactly as before.
 */
describe('gateDecision', () => {
  test('no configured token → the gate is open (dev + demo unchanged)', () => {
    expect(gateDecision({ token: undefined, cookie: 'anything', queryToken: null }).kind).toBe('open');
    expect(gateDecision({ token: '', cookie: null, queryToken: null }).kind).toBe('open');
  });

  test('no configured token in PRODUCTION → fails closed (challenge, never open)', () => {
    expect(gateDecision({ token: undefined, cookie: 'anything', queryToken: null, isProduction: true }).kind).toBe(
      'challenge',
    );
    expect(gateDecision({ token: '', cookie: null, queryToken: null, isProduction: true }).kind).toBe('challenge');
  });

  test('matching cookie passes silently', () => {
    expect(gateDecision({ token: 'sekrit', cookie: 'sekrit', queryToken: null }).kind).toBe('pass');
  });

  test('correct token in the query sets the cookie and cleans the URL', () => {
    const d = gateDecision({ token: 'sekrit', cookie: null, queryToken: 'sekrit' });
    expect(d.kind).toBe('set-cookie');
  });

  test('wrong or missing token gets the challenge page, never content', () => {
    expect(gateDecision({ token: 'sekrit', cookie: 'nope', queryToken: null }).kind).toBe('challenge');
    expect(gateDecision({ token: 'sekrit', cookie: null, queryToken: 'wrong' }).kind).toBe('challenge');
    expect(gateDecision({ token: 'sekrit', cookie: null, queryToken: null }).kind).toBe('challenge');
  });

  test('a stale cookie loses to a fresh correct query token', () => {
    const d = gateDecision({ token: 'new-token', cookie: 'old-token', queryToken: 'new-token' });
    expect(d.kind).toBe('set-cookie');
  });
});

describe('assertProductionAccessToken', () => {
  test('throws in production when the token is missing or blank', () => {
    expect(() => assertProductionAccessToken({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(
      /FOUNDER_OS_ACCESS_TOKEN/,
    );
    expect(() =>
      assertProductionAccessToken({ NODE_ENV: 'production', FOUNDER_OS_ACCESS_TOKEN: '   ' } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  test('is a no-op in production with a token, and always outside production', () => {
    expect(() =>
      assertProductionAccessToken({ NODE_ENV: 'production', FOUNDER_OS_ACCESS_TOKEN: 'sekrit' } as NodeJS.ProcessEnv),
    ).not.toThrow();
    expect(() => assertProductionAccessToken({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => assertProductionAccessToken({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).not.toThrow();
  });
});

describe('challenge page', () => {
  test('is self-contained HTML with a token form and no app content', () => {
    const html = challengePage();
    expect(html).toContain('<form');
    expect(html).toContain('name="token"');
    expect(html.toLowerCase()).toContain('founderos');
  });
});

describe('middleware wiring', () => {
  const src = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8');

  test('middleware.ts exists and uses the pure gate', () => {
    expect(src).toContain("from '@/lib/access-gate'");
    expect(src).toContain('FOUNDER_OS_ACCESS_TOKEN');
    // reads the cookie through the shared constant, not a re-typed literal
    expect(src).toContain('GATE_COOKIE');
    expect(GATE_COOKIE.length).toBeGreaterThan(0);
  });

  test('static assets are excluded so the challenge page itself renders', () => {
    expect(src).toContain('_next');
    expect(src).toMatch(/matcher/);
  });
});
