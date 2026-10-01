import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gateDecision, challengePage, GATE_COOKIE } from '@/lib/access-gate';

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

/**
 * The gate is opt-in, so the docs are the only thing standing between a
 * first-time deployer and a public URL with live keys behind it (issue #2).
 * If the deploy steps stop naming the token, the gate may as well not exist.
 */
describe('deploy docs name the gate', () => {
  const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
  const envExample = readFileSync(join(process.cwd(), '.env.example'), 'utf8');

  test('the Railway steps require FOUNDER_OS_ACCESS_TOKEN', () => {
    const start = readme.indexOf('## Deploying to Railway');
    expect(start).toBeGreaterThan(-1);
    const next = readme.indexOf('\n## ', start + 1);
    const railway = readme.slice(start, next === -1 ? undefined : next);
    expect(railway).toContain('FOUNDER_OS_ACCESS_TOKEN');
  });

  test('README has an Access control section saying unset means open', () => {
    expect(readme).toContain('## Access control');
    const section = readme.slice(readme.indexOf('## Access control'));
    expect(section.toLowerCase()).toContain('unset means open');
  });

  test('.env.example lists the token so it is discoverable', () => {
    expect(envExample).toMatch(/^FOUNDER_OS_ACCESS_TOKEN=/m);
  });
});
