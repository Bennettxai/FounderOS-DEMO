import { describe, expect, test, afterEach } from 'vitest';
import { fathomStatus, recentFathomMeetings, parseFathomMeetings } from '@/lib/connectors/fathom';

/**
 * Fathom (AI notetaker) connector. Real API: GET api.fathom.ai/external/v1/meetings
 * with an `X-Api-Key` header, 60 calls/min per user. Honest states: no key ⇒
 * not_configured, key rejected ⇒ error, key good ⇒ connected with the meeting count.
 */

const OLD = { ...process.env };
afterEach(() => {
  process.env = { ...OLD };
});

const meetingsBody = {
  items: [
    {
      title: 'Vantage x Acme discovery',
      url: 'https://fathom.video/calls/123',
      created_at: '2026-08-04T15:00:00Z',
      recording_duration_in_minutes: 42,
      meeting_title: 'Vantage x Acme discovery',
    },
    {
      title: 'Cohort office hours',
      url: 'https://fathom.video/calls/124',
      created_at: '2026-08-02T17:00:00Z',
      recording_duration_in_minutes: 61,
    },
  ],
};

const okFetch = (body: unknown = meetingsBody, status = 200): typeof fetch =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (!u.startsWith('https://api.fathom.ai/external/v1/meetings')) throw new Error(`unexpected url ${u}`);
    const headers = new Headers(init?.headers);
    if (!headers.get('X-Api-Key')) throw new Error('missing X-Api-Key header');
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;

describe('parseFathomMeetings', () => {
  test('maps the API shape to flat rows, newest first', () => {
    const rows = parseFathomMeetings(meetingsBody);
    expect(rows).toHaveLength(2);
    expect(rows[0].title).toBe('Vantage x Acme discovery');
    expect(rows[0].url).toBe('https://fathom.video/calls/123');
    expect(rows[0].durationMinutes).toBe(42);
    expect(rows[0].at).toBe('2026-08-04T15:00:00Z');
  });

  test('tolerates a missing/!array payload instead of throwing', () => {
    expect(parseFathomMeetings({})).toEqual([]);
    expect(parseFathomMeetings(null)).toEqual([]);
    expect(parseFathomMeetings({ items: 'nope' })).toEqual([]);
  });
});

describe('fathomStatus', () => {
  test('not_configured without a key, and names the key to set', async () => {
    delete process.env.FATHOM_API_KEY;
    const s = await fathomStatus(okFetch());
    expect(s.state).toBe('not_configured');
    expect(s.detail).toContain('FATHOM_API_KEY');
    expect(s.id).toBe('fathom');
  });

  test('connected with a working key, and reports how many meetings it can see', async () => {
    process.env.FATHOM_API_KEY = 'fk_test';
    const s = await fathomStatus(okFetch());
    expect(s.state).toBe('connected');
    expect(s.detail).toContain('2');
    expect(s.meta?.meetings).toBe(2);
  });

  test('error (never a fake connected) when the key is rejected', async () => {
    process.env.FATHOM_API_KEY = 'fk_bad';
    const s = await fathomStatus(okFetch({ error: 'unauthorized' }, 401));
    expect(s.state).toBe('error');
    expect(s.detail).toContain('401');
  });

  test('error when the network is down', async () => {
    process.env.FATHOM_API_KEY = 'fk_test';
    const boom = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const s = await fathomStatus(boom);
    expect(s.state).toBe('error');
  });
});

describe('recentFathomMeetings', () => {
  test('returns [] without a key rather than throwing', async () => {
    delete process.env.FATHOM_API_KEY;
    expect(await recentFathomMeetings(5, okFetch())).toEqual([]);
  });

  test('returns parsed meetings with a key, honouring the limit', async () => {
    process.env.FATHOM_API_KEY = 'fk_test';
    const rows = await recentFathomMeetings(1, okFetch());
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Vantage x Acme discovery');
  });
});
