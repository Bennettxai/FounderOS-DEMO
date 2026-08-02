import { describe, expect, test } from 'vitest';
import { bearerFrom, decideAccess, isPublicPath, safeEqual } from '@/lib/auth';

const TOKEN = 'a'.repeat(32);

describe('decideAccess', () => {
  test('allows an unconfigured development server so the local demo stays zero-config', () => {
    expect(
      decideAccess({
        token: undefined,
        presented: undefined,
        isProduction: false,
      }),
    ).toEqual({
      kind: 'allow',
    });
  });

  test('refuses to serve in production when no token is configured', () => {
    const decision = decideAccess({
      token: undefined,
      presented: undefined,
      isProduction: true,
    });
    expect(decision.kind).toBe('misconfigured');
  });

  test('treats a whitespace-only token as unset', () => {
    expect(decideAccess({ token: '   ', presented: undefined, isProduction: true }).kind).toBe(
      'misconfigured',
    );
  });

  test('rejects a token too short to resist guessing', () => {
    expect(decideAccess({ token: 'short', presented: 'short', isProduction: false }).kind).toBe(
      'misconfigured',
    );
  });

  test('allows a matching credential', () => {
    expect(decideAccess({ token: TOKEN, presented: TOKEN, isProduction: true })).toEqual({
      kind: 'allow',
    });
  });

  test.each([
    ['no credential', undefined],
    ['wrong credential', 'b'.repeat(32)],
    ['empty credential', ''],
    ['correct prefix only', 'a'.repeat(31)],
  ])('rejects %s once a token is configured', (_label, presented) => {
    expect(decideAccess({ token: TOKEN, presented, isProduction: true }).kind).toBe('unauthorized');
  });

  test('a configured token is enforced in development too', () => {
    expect(decideAccess({ token: TOKEN, presented: undefined, isProduction: false }).kind).toBe(
      'unauthorized',
    );
  });
});

describe('safeEqual', () => {
  test('matches identical strings and rejects everything else', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'ab')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
    expect(safeEqual('abc', '')).toBe(false);
  });

  test('a length mismatch cannot pass by prefix', () => {
    expect(safeEqual('secret', 'secretsecret')).toBe(false);
    expect(safeEqual('secretsecret', 'secret')).toBe(false);
  });
});

describe('bearerFrom', () => {
  test('extracts the credential and tolerates casing and padding', () => {
    expect(bearerFrom('Bearer abc123')).toBe('abc123');
    expect(bearerFrom('bearer abc123')).toBe('abc123');
    expect(bearerFrom('  Bearer   abc123  ')).toBe('abc123');
  });

  test('ignores anything that is not a bearer credential', () => {
    expect(bearerFrom(null)).toBeUndefined();
    expect(bearerFrom('')).toBeUndefined();
    expect(bearerFrom('Basic abc123')).toBeUndefined();
    expect(bearerFrom('Bearer')).toBeUndefined();
  });
});

describe('isPublicPath', () => {
  test('leaves the unlock exchange reachable so the gate cannot lock everyone out', () => {
    expect(isPublicPath('/unlock')).toBe(true);
    expect(isPublicPath('/api/unlock')).toBe(true);
  });

  test('leaves machine-to-machine webhooks reachable — they carry their own secret', () => {
    expect(isPublicPath('/api/webhooks/manychat')).toBe(true);
  });

  test.each(['/', '/agents', '/api/keys', '/api/comms/reply', '/api/agents/broadcast'])(
    'guards %s',
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );

  test('does not let a lookalike prefix escape the gate', () => {
    expect(isPublicPath('/unlocked-secrets')).toBe(false);
    expect(isPublicPath('/api/unlockable')).toBe(false);
  });
});
