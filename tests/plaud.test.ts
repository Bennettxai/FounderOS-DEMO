import { describe, expect, test, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parsePlaudFiles,
  plaudStatus,
  recentPlaudRecordings,
  resolvePlaudAccessToken,
  __resetPlaudTokenCache,
} from '@/lib/connectors/plaud';

/**
 * Plaud (AI voice recorder) connector. Real API (the same one the
 * @plaud-ai/mcp server calls): GET platform.plaud.ai/developer/api/open/third-party/files/
 * with a Bearer access token, refreshed from a refresh token at
 * .../oauth/third-party/access-token/refresh. The refresh token is the durable
 * credential: PLAUD_REFRESH_TOKEN in .env.local (the host), or the MCP's own
 * ~/.plaud/tokens.json on the laptop. Honest states only.
 */

const OLD = { ...process.env };
const tmpDirs: string[] = [];

beforeEach(() => {
  __resetPlaudTokenCache();
  // Point every cred source at empty scratch files so the laptop's real
  // ~/.plaud/tokens.json and .env.local never leak into a test.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plaud-'));
  tmpDirs.push(dir);
  process.env.FOUNDER_OS_ENV_LOCAL = path.join(dir, '.env.local');
  process.env.PLAUD_TOKEN_FILE = path.join(dir, 'tokens-mcp.json');
  delete process.env.PLAUD_REFRESH_TOKEN;
  delete process.env.PLAUD_ACCESS_TOKEN;
});
afterEach(() => {
  process.env = { ...OLD };
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const filesBody = {
  type: 'list',
  data: [
    {
      id: '00000000000000000000000000000000',
      name: 'Acme Parking on-site walkthrough',
      created_at: '2026-08-26T02:10:35',
      start_at: '2026-08-26T02:10:35.468000',
      duration: 4865796,
    },
    { id: '00000000000000000000000000000000', name: 'Welcome to Plaud.ai', created_at: '2026-08-26T02:10:34', duration: 253260 },
  ],
  page: 1,
  page_size: 20,
};

type Call = { url: string; method: string; auth: string | null; body: string | null };

/** A fake Plaud backend: the files endpoint wants a Bearer token it knows,
 *  the refresh endpoint mints one from a refresh token it knows. */
function fakePlaud(opts: { refreshToken?: string; accessToken?: string; rotateTo?: string; filesStatus?: number; body?: unknown } = {}) {
  const goodRefresh = opts.refreshToken ?? 'rt_good';
  const goodAccess = opts.accessToken ?? 'at_minted';
  const calls: Call[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? init.body : init?.body ? String(init.body) : null;
    calls.push({ url: u, method: init?.method ?? 'GET', auth: headers.get('Authorization'), body });
    if (u === 'https://platform.plaud.ai/developer/api/oauth/third-party/access-token/refresh') {
      const params = new URLSearchParams(body ?? '');
      if (params.get('refresh_token') !== goodRefresh)
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 401 });
      return new Response(
        JSON.stringify({ access_token: goodAccess, token_type: 'Bearer', expires_in: 3600, refresh_token: opts.rotateTo }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (u.startsWith('https://platform.plaud.ai/developer/api/open/third-party/files/')) {
      if (headers.get('Authorization') !== `Bearer ${goodAccess}`)
        return new Response(JSON.stringify({ detail: 'unauthorized' }), { status: 401 });
      return new Response(JSON.stringify(opts.body ?? filesBody), {
        status: opts.filesStatus ?? 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`unexpected url ${u}`);
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

describe('parsePlaudFiles', () => {
  test('maps the list payload to flat rows: ms → minutes, naive UTC stamps → ISO', () => {
    const rows = parsePlaudFiles(filesBody);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('00000000000000000000000000000000');
    expect(rows[0].title).toBe('Acme Parking on-site walkthrough');
    expect(rows[0].durationMinutes).toBe(81);
    expect(rows[0].at).toBe('2026-08-26T02:10:35Z');
    expect(rows[1].durationMinutes).toBe(4);
  });

  test('tolerates a missing/!array payload instead of throwing', () => {
    expect(parsePlaudFiles({})).toEqual([]);
    expect(parsePlaudFiles(null)).toEqual([]);
    expect(parsePlaudFiles({ data: 'nope' })).toEqual([]);
  });
});

describe('resolvePlaudAccessToken', () => {
  test('null with no credential anywhere', async () => {
    const { fetchFn, calls } = fakePlaud();
    expect(await resolvePlaudAccessToken(fetchFn)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test('PLAUD_REFRESH_TOKEN in .env.local mints an access token, then caches it', async () => {
    fs.writeFileSync(process.env.FOUNDER_OS_ENV_LOCAL!, 'PLAUD_REFRESH_TOKEN=rt_good\n');
    const { fetchFn, calls } = fakePlaud();
    expect(await resolvePlaudAccessToken(fetchFn)).toBe('at_minted');
    expect(await resolvePlaudAccessToken(fetchFn)).toBe('at_minted');
    expect(calls.filter((c) => c.url.endsWith('/refresh'))).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toContain('refresh_token=rt_good');
  });

  test('a rotated refresh token is written back to .env.local so the next boot still works', async () => {
    fs.writeFileSync(process.env.FOUNDER_OS_ENV_LOCAL!, 'OTHER=1\nPLAUD_REFRESH_TOKEN=rt_good\n');
    const { fetchFn } = fakePlaud({ rotateTo: 'rt_next' });
    await resolvePlaudAccessToken(fetchFn);
    const saved = fs.readFileSync(process.env.FOUNDER_OS_ENV_LOCAL!, 'utf8');
    expect(saved).toContain('PLAUD_REFRESH_TOKEN=rt_next');
    expect(saved).toContain('OTHER=1');
  });

  test('the MCP token file is used when its access token is still fresh (no refresh call)', async () => {
    fs.writeFileSync(
      process.env.PLAUD_TOKEN_FILE!,
      JSON.stringify({ access_token: 'at_file', refresh_token: 'rt_good', token_type: 'Bearer', expires_at: Date.now() + 3_600_000 }),
    );
    const { fetchFn, calls } = fakePlaud({ accessToken: 'at_file' });
    expect(await resolvePlaudAccessToken(fetchFn)).toBe('at_file');
    expect(calls).toHaveLength(0);
  });

  test('an expired MCP token file is refreshed and rewritten in place, so the MCP stays signed in too', async () => {
    fs.writeFileSync(
      process.env.PLAUD_TOKEN_FILE!,
      JSON.stringify({ access_token: 'at_stale', refresh_token: 'rt_good', token_type: 'Bearer', expires_at: Date.now() - 1000 }),
    );
    const { fetchFn } = fakePlaud({ rotateTo: 'rt_next' });
    expect(await resolvePlaudAccessToken(fetchFn)).toBe('at_minted');
    const file = JSON.parse(fs.readFileSync(process.env.PLAUD_TOKEN_FILE!, 'utf8'));
    expect(file.access_token).toBe('at_minted');
    expect(file.refresh_token).toBe('rt_next');
    expect(file.expires_at).toBeGreaterThan(Date.now());
  });

  test('.env.local outranks the MCP token file', async () => {
    fs.writeFileSync(process.env.FOUNDER_OS_ENV_LOCAL!, 'PLAUD_REFRESH_TOKEN=rt_good\n');
    fs.writeFileSync(
      process.env.PLAUD_TOKEN_FILE!,
      JSON.stringify({ access_token: 'at_file', refresh_token: 'rt_other', expires_at: Date.now() + 3_600_000 }),
    );
    const { fetchFn } = fakePlaud();
    expect(await resolvePlaudAccessToken(fetchFn)).toBe('at_minted');
  });
});

describe('plaudStatus', () => {
  test('not_configured without a credential, and names the key to set', async () => {
    const s = await plaudStatus(fakePlaud().fetchFn);
    expect(s.state).toBe('not_configured');
    expect(s.detail).toContain('PLAUD_REFRESH_TOKEN');
    expect(s.id).toBe('plaud');
    expect(s.kind).toBe('knowledge');
  });

  test('connected with a working refresh token, and reports how many recordings it can see', async () => {
    fs.writeFileSync(process.env.FOUNDER_OS_ENV_LOCAL!, 'PLAUD_REFRESH_TOKEN=rt_good\n');
    const s = await plaudStatus(fakePlaud().fetchFn);
    expect(s.state).toBe('connected');
    expect(s.detail).toContain('2');
    expect(s.meta?.recordings).toBe(2);
  });

  test('error (never a fake connected) when the refresh token is rejected', async () => {
    fs.writeFileSync(process.env.FOUNDER_OS_ENV_LOCAL!, 'PLAUD_REFRESH_TOKEN=rt_revoked\n');
    const s = await plaudStatus(fakePlaud().fetchFn);
    expect(s.state).toBe('error');
    expect(s.detail).toContain('401');
  });

  test('error when the network is down', async () => {
    fs.writeFileSync(process.env.FOUNDER_OS_ENV_LOCAL!, 'PLAUD_REFRESH_TOKEN=rt_good\n');
    const boom = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const s = await plaudStatus(boom);
    expect(s.state).toBe('error');
    expect(s.detail).toContain('ECONNREFUSED');
  });
});

describe('recentPlaudRecordings', () => {
  test('returns [] without a credential rather than throwing', async () => {
    expect(await recentPlaudRecordings(5, fakePlaud().fetchFn)).toEqual([]);
  });

  test('returns parsed recordings with a credential, honouring the limit', async () => {
    fs.writeFileSync(process.env.FOUNDER_OS_ENV_LOCAL!, 'PLAUD_REFRESH_TOKEN=rt_good\n');
    const rows = await recentPlaudRecordings(1, fakePlaud().fetchFn);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Acme Parking on-site walkthrough');
  });

  test('returns [] (never throws) when the API fails', async () => {
    fs.writeFileSync(process.env.FOUNDER_OS_ENV_LOCAL!, 'PLAUD_REFRESH_TOKEN=rt_good\n');
    expect(await recentPlaudRecordings(5, fakePlaud({ filesStatus: 500 }).fetchFn)).toEqual([]);
  });
});
