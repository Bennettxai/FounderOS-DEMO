import { afterEach, describe, expect, test, vi } from 'vitest';
import { hasSession, requireSession } from '@/lib/session';
import { GATE_COOKIE } from '@/lib/access-gate';

const req = (cookie?: string) =>
  new Request('http://localhost/api/x', cookie ? { headers: { cookie } } : undefined);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('hasSession', () => {
  test('no token, outside production → open', () => {
    expect(hasSession(req(), { NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(true);
    expect(hasSession(req(), { NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(true);
  });

  test('no token in production → closed (fail closed)', () => {
    expect(hasSession(req(), { NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
  });

  test('token configured → the gate cookie must match', () => {
    const env = { NODE_ENV: 'production', FOUNDER_OS_ACCESS_TOKEN: 'sekrit' } as NodeJS.ProcessEnv;
    expect(hasSession(req(), env)).toBe(false);
    expect(hasSession(req(`${GATE_COOKIE}=wrong`), env)).toBe(false);
    expect(hasSession(req(`${GATE_COOKIE}=sekrit`), env)).toBe(true);
    // survives other cookies present alongside it
    expect(hasSession(req(`foo=bar; ${GATE_COOKIE}=sekrit; baz=1`), env)).toBe(true);
  });
});

describe('requireSession', () => {
  test('returns a 401 Response when there is no session', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FOUNDER_OS_ACCESS_TOKEN', '');
    const res = requireSession(req());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    expect((await res!.json()).error).toBe('unauthorized');
  });

  test('returns null (proceed) when the session is valid', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FOUNDER_OS_ACCESS_TOKEN', 'sekrit');
    expect(requireSession(req(`${GATE_COOKIE}=sekrit`))).toBeNull();
  });

  test('returns null in dev when no token is configured', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('FOUNDER_OS_ACCESS_TOKEN', '');
    expect(requireSession(req())).toBeNull();
  });
});
