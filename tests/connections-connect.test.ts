import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { POST, DELETE } from '@/app/api/connections/connect/route';
import { readEnvLocal } from '@/lib/creds';

/** The connect flow writes ONLY to .env.local (gitignored) — never to
 *  the operator's canonical machine files, never into the repo. */
describe('POST /api/connections/connect', () => {
  let tmp: string;
  const prevOverride = process.env.FOUNDER_OS_ENV_LOCAL;

  beforeEach(() => {
    tmp = path.join(os.tmpdir(), `founder-connect-${process.pid}-${Math.random().toString(36).slice(2)}`);
    process.env.FOUNDER_OS_ENV_LOCAL = tmp;
  });
  afterEach(() => {
    if (prevOverride === undefined) delete process.env.FOUNDER_OS_ENV_LOCAL;
    else process.env.FOUNDER_OS_ENV_LOCAL = prevOverride;
    try { fs.unlinkSync(tmp); } catch {}
  });

  const post = (body: unknown) =>
    POST(new Request('http://test/api/connections/connect', { method: 'POST', body: JSON.stringify(body) }));

  test('saves allowed keys for a listed integration and reports keySaved without echoing values', async () => {
    const res = await post({ slug: 'fathom', values: { FATHOM_API_KEY: 'ntn_secret_123' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.keySaved).toBe(true);
    expect(JSON.stringify(body)).not.toContain('ntn_secret_123');
    expect(readEnvLocal().FATHOM_API_KEY).toBe('ntn_secret_123');
  });

  // DocuSign's RSA key is base64 PEM — ~2.2KB. The catalog declares it a
  // connect key, so the endpoint has to accept one that long.
  test('saves a multi-kilobyte key such as a base64 RSA private key', async () => {
    const keyB64 = Buffer.from('-----BEGIN RSA PRIVATE KEY-----\n' + 'a'.repeat(1600)).toString('base64');
    expect(keyB64.length).toBeGreaterThan(2000);
    const res = await post({
      slug: 'docusign',
      values: {
        DOCUSIGN_INTEGRATION_KEY: 'ik',
        DOCUSIGN_USER_ID: 'uid',
        DOCUSIGN_ACCOUNT_ID: 'aid',
        DOCUSIGN_PRIVATE_KEY_B64: keyB64,
      },
    });
    expect(res.status).toBe(200);
    expect(readEnvLocal().DOCUSIGN_PRIVATE_KEY_B64).toBe(keyB64);
  });

  test('a no-connector tile saves its generic key', async () => {
    const res = await post({ slug: 'discord', values: { DISCORD_API_KEY: 'dsc-1' } });
    expect(res.status).toBe(200);
    expect(readEnvLocal().DISCORD_API_KEY).toBe('dsc-1');
  });

  test('rejects unknown slugs, foreign keys, and unsafe values', async () => {
    expect((await post({ slug: 'not-a-tool', values: { X_API_KEY: 'v' } })).status).toBe(400);
    // a key that does not belong to this integration must never be written
    expect((await post({ slug: 'fathom', values: { ATTIO_API_KEY: 'steal' } })).status).toBe(400);
    expect(readEnvLocal().ATTIO_API_KEY).toBeUndefined();
    expect((await post({ slug: 'fathom', values: { FATHOM_API_KEY: 'a\nb' } })).status).toBe(400);
    expect((await post({ slug: 'fathom', values: {} })).status).toBe(400);
    // guidance-only tiles (whatsapp needs Full Disk Access, not a key) take no keys
    expect((await post({ slug: 'whatsapp', values: { WHATSAPP_API_KEY: 'x' } })).status).toBe(400);
  });

  test('DELETE removes exactly the integration keys (disconnect)', async () => {
    await post({ slug: 'fathom', values: { FATHOM_API_KEY: 'k1' } });
    await post({ slug: 'discord', values: { DISCORD_API_KEY: 'k2' } });
    const res = await DELETE(
      new Request('http://test/api/connections/connect', { method: 'DELETE', body: JSON.stringify({ slug: 'fathom' }) }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).keySaved).toBe(false);
    expect(readEnvLocal().FATHOM_API_KEY).toBeUndefined();
    expect(readEnvLocal().DISCORD_API_KEY).toBe('k2');
  });
});
