import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

beforeAll(() => {
  process.env.FOUNDER_OS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'alex-dm-reply-')), 'test.db');
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MANYCHAT_API_KEY;
});

const URL = 'http://localhost/api/social/dm/reply';
const post = (body: unknown) =>
  new Request(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('POST /api/social/dm/reply', () => {
  test('400 on a missing text/subscriberId', async () => {
    const { POST } = await import('@/app/api/social/dm/reply/route');
    expect((await POST(post({ subscriberId: 'ig-alex' }))).status).toBe(400);
  });

  test('honest 502 and stores nothing when ManyChat is not connected', async () => {
    const { POST } = await import('@/app/api/social/dm/reply/route');
    const { getDb } = await import('@/lib/data');
    const before = getDb().social.dmMessages('instagram').filter((m) => m.direction === 'out').length;

    const res = await POST(post({ subscriberId: 'ig-alex', text: 'on it' }));
    expect(res.status).toBe(502);
    expect((await res.json()).ok).toBe(false);

    const after = getDb().social.dmMessages('instagram').filter((m) => m.direction === 'out').length;
    expect(after).toBe(before); // never fakes a send
  });

  test('sends via ManyChat and stores the outbound message when keyed', async () => {
    process.env.MANYCHAT_API_KEY = 'sk-test';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success' }) })));

    const { POST } = await import('@/app/api/social/dm/reply/route');
    const { getDb } = await import('@/lib/data');

    const res = await POST(post({ subscriberId: 'ig-alex', text: 'here is pricing' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message.direction).toBe('out');

    const stored = getDb().social.dmMessages('instagram').find((m) => m.id === body.message.id);
    expect(stored?.text).toBe('here is pricing');
    expect(stored?.source).toBe('manychat');
    expect(stored?.name).toBe('Alex Rivera'); // resolved from the existing thread
  });
});
