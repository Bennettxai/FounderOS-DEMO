import { describe, it, expect } from 'vitest';
import { parseManyChatPageInfo, manychatStatus, sendManyChatText } from '@/lib/connectors/manychat';

// Mirrors ManyChat `GET /fb/page/getInfo` → { status, data: { name, username, is_pro } }.
describe('parseManyChatPageInfo', () => {
  it('reads name / username / pro from data', () => {
    expect(
      parseManyChatPageInfo({ status: 'success', data: { name: 'Alex', username: 'founderos.ai', is_pro: true } }),
    ).toEqual({ name: 'Alex', username: 'founderos.ai', isPro: true });
  });

  it('tolerates a missing username and non-pro accounts', () => {
    expect(parseManyChatPageInfo({ data: { name: 'Alex' } })).toEqual({
      name: 'Alex',
      username: null,
      isPro: false,
    });
  });

  it('returns null when there is no usable name', () => {
    expect(parseManyChatPageInfo(null)).toBeNull();
    expect(parseManyChatPageInfo({})).toBeNull();
    expect(parseManyChatPageInfo({ data: {} })).toBeNull();
  });
});

describe('manychatStatus', () => {
  it('is not_configured with no key', async () => {
    const s = await manychatStatus({});
    expect(s.state).toBe('not_configured');
    expect(s.kind).toBe('social');
    expect(s.detail).toMatch(/MANYCHAT_API_KEY/);
  });

  it('is connected when getInfo returns a page, showing the handle', async () => {
    const fetchOk = (async () =>
      ({ ok: true, status: 200, json: async () => ({ data: { name: 'Alex', username: 'founderos.ai', is_pro: true } }) }) as unknown as Response) as typeof fetch;
    const s = await manychatStatus({ MANYCHAT_API_KEY: 'sk-test' }, fetchOk);
    expect(s.state).toBe('connected');
    expect(s.detail).toMatch(/@founderos\.ai/);
  });

  it('is error when the key is set but the API rejects it', async () => {
    const fetch401 = (async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response) as typeof fetch;
    const s = await manychatStatus({ MANYCHAT_API_KEY: 'bad' }, fetch401);
    expect(s.state).toBe('error');
    expect(s.detail).toMatch(/401/);
  });
});

describe('sendManyChatText', () => {
  it('refuses honestly when no key is set (no fake send)', async () => {
    const r = await sendManyChatText('42', 'hi', {});
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/MANYCHAT_API_KEY/);
  });

  it('POSTs sendContent with the v2 text payload when keyed', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchOk = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return { ok: true, status: 200, json: async () => ({ status: 'success' }) } as unknown as Response;
    }) as unknown as typeof fetch;

    const r = await sendManyChatText('42', 'on it', { MANYCHAT_API_KEY: 'sk-test' }, fetchOk);
    expect(r.ok).toBe(true);
    expect(calls[0].url).toBe('https://api.manychat.com/fb/sending/sendContent');
    expect(calls[0].init.method).toBe('POST');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.subscriber_id).toBe('42');
    expect(body.data.content.messages).toEqual([{ type: 'text', text: 'on it' }]);
    expect(body.message_tag).toBeTruthy();
  });

  it('reports an honest failure on a non-2xx', async () => {
    const fetch400 = (async () => ({ ok: false, status: 400, json: async () => ({ message: 'bad tag' }) }) as unknown as Response) as typeof fetch;
    const r = await sendManyChatText('42', 'hi', { MANYCHAT_API_KEY: 'sk-test' }, fetch400);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/400/);
  });
});
