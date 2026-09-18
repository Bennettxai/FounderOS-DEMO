import { describe, expect, test } from 'vitest';
import { isGated } from '@/lib/gate';

/**
 * The demo gate must be platform-agnostic: it fired on `process.env.VERCEL`,
 * but Railway never sets that, so the gate has to key on explicit intent
 * (DEMO_GATE) plus any known deployment platform. Local dev stays open.
 */
describe('isGated', () => {
  test('local dev (no platform env) is NOT gated', () => {
    expect(isGated({})).toBe(false);
  });

  test('gated on Vercel (transition: the old demo stays gated)', () => {
    expect(isGated({ VERCEL: '1' })).toBe(true);
  });

  test('gated on Railway (RAILWAY_ENVIRONMENT is auto-set there)', () => {
    expect(isGated({ RAILWAY_ENVIRONMENT: 'production' })).toBe(true);
  });

  test('DEMO_GATE=1 forces the gate on even with no platform env', () => {
    expect(isGated({ DEMO_GATE: '1' })).toBe(true);
  });

  test('DEMO_GATE=0 forces the gate OFF even on a deployment platform', () => {
    expect(isGated({ DEMO_GATE: '0', VERCEL: '1', RAILWAY_ENVIRONMENT: 'production' })).toBe(false);
  });
});
