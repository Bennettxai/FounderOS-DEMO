import { describe, expect, test } from 'vitest';
import { loomStatus, loomVideoMeta, isLoomUrl } from '@/lib/connectors/loom';

/**
 * Loom connector. Atlassian states plainly that Loom "does not offer an open
 * API at this time" — there is no way to list an account's videos, and no key
 * to set. What DOES exist is the public oEmbed endpoint, which resolves any
 * Loom URL to title/thumbnail/duration without auth.
 *
 * So this connector never claims the account is wired: it reports the oEmbed
 * lane honestly and says why there is nothing to configure.
 */

const oembedBody = {
  title: 'Founder OS walkthrough',
  author_name: 'Alex Rivera',
  thumbnail_url: 'https://cdn.loom.com/sessions/thumbnails/abc-00001.jpg',
  duration: 184.5,
  html: '<iframe src="https://www.loom.com/embed/abc"></iframe>',
};

const okFetch = (body: unknown = oembedBody, status = 200): typeof fetch =>
  (async (url: string | URL) => {
    const u = String(url);
    if (!u.startsWith('https://www.loom.com/v1/oembed')) throw new Error(`unexpected url ${u}`);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;

describe('isLoomUrl', () => {
  test('accepts share and embed links, rejects anything else', () => {
    expect(isLoomUrl('https://www.loom.com/share/abc123')).toBe(true);
    expect(isLoomUrl('https://loom.com/embed/abc123')).toBe(true);
    expect(isLoomUrl('https://vimeo.com/123')).toBe(false);
    expect(isLoomUrl('not a url')).toBe(false);
    // no scheme-relative or javascript: sneaking through
    expect(isLoomUrl('javascript:alert(1)//loom.com/share/x')).toBe(false);
  });
});

describe('loomStatus', () => {
  test('reports connected via oEmbed and is explicit that there is no account API', async () => {
    const s = await loomStatus(okFetch());
    expect(s.id).toBe('loom');
    expect(s.state).toBe('connected');
    // the honesty that matters: this is link-level, not account-level
    expect(s.detail.toLowerCase()).toContain('no account api');
    expect(s.meta?.scope).toBe('link-level');
  });

  test('error when oEmbed itself is unreachable', async () => {
    const boom = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const s = await loomStatus(boom);
    expect(s.state).toBe('error');
  });

  test('never claims a key is needed, because none exists', async () => {
    const s = await loomStatus(okFetch());
    expect(s.detail).not.toMatch(/LOOM_API_KEY/i);
  });
});

describe('loomVideoMeta', () => {
  test('resolves a Loom link to title, author, thumbnail and duration', async () => {
    const m = await loomVideoMeta('https://www.loom.com/share/abc123', okFetch());
    expect(m).not.toBeNull();
    expect(m!.title).toBe('Founder OS walkthrough');
    expect(m!.author).toBe('Alex Rivera');
    expect(m!.durationSeconds).toBe(184.5);
    expect(m!.thumbnailUrl).toContain('cdn.loom.com');
  });

  test('returns null for a non-Loom url without calling out', async () => {
    const never = (async () => {
      throw new Error('should not be called');
    }) as unknown as typeof fetch;
    expect(await loomVideoMeta('https://youtube.com/watch?v=1', never)).toBeNull();
  });

  test('returns null (not a throw) when the video is private or gone', async () => {
    expect(await loomVideoMeta('https://www.loom.com/share/abc', okFetch({}, 404))).toBeNull();
  });
});
