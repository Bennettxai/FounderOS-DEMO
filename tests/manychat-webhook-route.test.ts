import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Own temp DB so ingest is observable in isolation. The shared secret is now
// REQUIRED, so it's set for the whole suite; individual tests toggle it to
// exercise the disabled (503) and unauthorized (401) paths.
beforeAll(() => {
  process.env.FOUNDER_OS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'alex-mc-wh-')), 'test.db');
  process.env.MANYCHAT_WEBHOOK_SECRET = 's3cret';
});

const URL = 'http://localhost/api/webhooks/manychat';
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(URL, { method: 'POST', headers, body: JSON.stringify(body) });

describe('POST /api/webhooks/manychat', () => {
  test('ingests a DM and it lands in the inbox as source=manychat', async () => {
    const { POST } = await import('@/app/api/webhooks/manychat/route');
    const res = await POST(
      post(
        { subscriber_id: 'wh-1', name: 'Webhook Wendy', handle: 'wendy', text: 'came from manychat', ts: '2026-07-18T16:00:00.000Z' },
        { 'x-manychat-secret': 's3cret' },
      ),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const { getDb } = await import('@/lib/data');
    const found = getDb().social.dmMessages('instagram').find((m) => m.subscriberId === 'wh-1');
    expect(found?.text).toBe('came from manychat');
    expect(found?.source).toBe('manychat');
  });

  test('rejects an unparseable payload with 400 (once authenticated)', async () => {
    const { POST } = await import('@/app/api/webhooks/manychat/route');
    const res = await POST(post({ text: 'no subscriber id' }, { 'x-manychat-secret': 's3cret' }));
    expect(res.status).toBe(400);
  });

  test('is disabled with 503 when no secret is configured', async () => {
    delete process.env.MANYCHAT_WEBHOOK_SECRET;
    const { POST } = await import('@/app/api/webhooks/manychat/route');
    const res = await POST(post({ subscriber_id: 'x', text: 'hi' }));
    expect(res.status).toBe(503);
    process.env.MANYCHAT_WEBHOOK_SECRET = 's3cret';
  });

  test('enforces the shared secret: 401 without it, 200 with it', async () => {
    const { POST } = await import('@/app/api/webhooks/manychat/route');

    const bad = await POST(post({ subscriber_id: 'x', text: 'hi' }));
    expect(bad.status).toBe(401);

    const good = await POST(post({ subscriber_id: 'x', text: 'hi' }, { 'x-manychat-secret': 's3cret' }));
    expect(good.status).toBe(200);
  });
});
