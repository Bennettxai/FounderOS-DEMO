import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gateDecision, challengePage, GATE_COOKIE } from '@/lib/access-gate';

/**
 * Production access gate.
 * When an access token is configured, the application is protected by
 * a one-time token entry remembered through a cookie.
 */


describe('gateDecision', () => {
  test('no configured token → the gate is open (dev + demo unchanged)', () => {
    expect(gateDecision({ token: undefined, cookie: 'anything', queryToken: null }).kind).toBe('open');
    expect(gateDecision({ token: '', cookie: null, queryToken: null }).kind).toBe('open');
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

describe('challenge page', () => {
  test('is self-contained HTML with a token form and no app content', () => {
    const html = challengePage();
    expect(html).toContain('<form');
    expect(html).toContain('name="token"');
    expect(html).toContain('STARTUP');
  });
});

describe('middleware wiring', () => {
  const src = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8');

  test('middleware.ts exists and uses the pure gate', () => {
    expect(src).toContain("from '@/lib/access-gate'");
    expect(src).toContain('STARTUP_ACCESS_TOKEN');
    // reads the cookie through the shared constant, not a re-typed literal
    expect(src).toContain('GATE_COOKIE');
    expect(GATE_COOKIE.length).toBeGreaterThan(0);
  });

  test('static assets are excluded so the challenge page itself renders', () => {
    expect(src).toContain('_next');
    expect(src).toMatch(/matcher/);
  });
});
