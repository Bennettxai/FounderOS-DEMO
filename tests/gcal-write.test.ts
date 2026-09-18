import { describe, expect, test } from 'vitest';
import {
  addEventGuests,
  mergeAttendees,
  resolveGcalWriteCreds,
  validEmails,
  type GcalFetch,
} from '@/lib/connectors/gcal-write';

const CREDS = { clientId: 'cid', clientSecret: 'secret', refreshToken: 'rt' };

function fakeFetch(handlers: Record<string, { status?: number; body: unknown }>): GcalFetch & {
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const key = Object.keys(handlers).find((k) => url.includes(k));
    if (!key) return new Response('{}', { status: 404 });
    const h = handlers[key];
    return new Response(JSON.stringify(h.body), {
      status: h.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as GcalFetch & { calls: { url: string; init: RequestInit }[] };
  fn.calls = calls;
  return fn;
}

describe('credential resolution', () => {
  test('needs all three parts, because two of them cannot mint a token', () => {
    expect(resolveGcalWriteCreds({ GCAL_CLIENT_ID: 'a', GCAL_CLIENT_SECRET: 'b' })).toBeNull();
    expect(resolveGcalWriteCreds({})).toBeNull();
  });

  test('resolves when the refresh token is present', () => {
    const c = resolveGcalWriteCreds({
      GCAL_CLIENT_ID: 'a',
      GCAL_CLIENT_SECRET: 'b',
      GCAL_REFRESH_TOKEN: 'c',
    });
    expect(c).toEqual({ clientId: 'a', clientSecret: 'b', refreshToken: 'c' });
  });
});

describe('validEmails', () => {
  test('separates the sendable from the malformed instead of silently dropping', () => {
    const { ok, bad } = validEmails(['a@b.com', 'not-an-email', ' C@D.COM ', 'x@y']);
    expect(ok).toEqual(['a@b.com', 'c@d.com']);
    expect(bad).toEqual(['not-an-email', 'x@y']);
  });

  test('dedupes case-insensitively so nobody is invited twice', () => {
    expect(validEmails(['A@b.com', 'a@B.com']).ok).toEqual(['a@b.com']);
  });
});

describe('mergeAttendees', () => {
  test('keeps every existing guest and their RSVP', () => {
    const merged = mergeAttendees(
      [{ email: 'keep@x.com', responseStatus: 'accepted' }],
      ['new@y.com'],
    );
    expect(merged).toEqual([
      { email: 'keep@x.com', responseStatus: 'accepted' },
      { email: 'new@y.com' },
    ]);
  });

  test('never re-adds someone already on the invite, whatever the casing', () => {
    // Re-adding an existing attendee resets their RSVP to needsAction and
    // re-notifies them. On a 43-person recurring call that is a visible mistake.
    const merged = mergeAttendees(
      [{ email: 'Dupe@X.com', responseStatus: 'declined' }],
      ['dupe@x.com', 'fresh@z.com'],
    );
    expect(merged).toEqual([
      { email: 'Dupe@X.com', responseStatus: 'declined' },
      { email: 'fresh@z.com' },
    ]);
  });

  test('preserves the organizer row untouched', () => {
    const merged = mergeAttendees(
      [{ email: 'boss@x.com', organizer: true, responseStatus: 'accepted' }],
      ['a@b.com'],
    );
    expect(merged[0]).toEqual({ email: 'boss@x.com', organizer: true, responseStatus: 'accepted' });
  });
});

describe('addEventGuests', () => {
  const base = {
    creds: CREDS,
    calendarId: 'primary',
    eventId: 'evt123',
    emails: ['new@y.com'],
  };

  test('refuses without credentials rather than half-doing it', async () => {
    const res = await addEventGuests({ ...base, creds: null, fetchImpl: fakeFetch({}) });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/credential/i);
  });

  test('reads the event, merges, and PATCHes the union back', async () => {
    const fetchImpl = fakeFetch({
      'oauth2.googleapis.com/token': { body: { access_token: 'at', expires_in: 3599 } },
      'events/evt123': { body: { id: 'evt123', attendees: [{ email: 'old@x.com' }] } },
    });
    const res = await addEventGuests({ ...base, fetchImpl });
    expect(res.ok).toBe(true);
    expect(res.added).toEqual(['new@y.com']);
    expect(res.alreadyPresent).toEqual([]);

    const patch = fetchImpl.calls.find((c) => c.init.method === 'PATCH')!;
    expect(JSON.parse(String(patch.init.body)).attendees).toEqual([
      { email: 'old@x.com' },
      { email: 'new@y.com' },
    ]);
  });

  test('sends invitation emails only when explicitly told to', async () => {
    const mk = () =>
      fakeFetch({
        'oauth2.googleapis.com/token': { body: { access_token: 'at', expires_in: 3599 } },
        'events/evt123': { body: { id: 'evt123', attendees: [] } },
      });
    const loud = mk();
    await addEventGuests({ ...base, sendUpdates: 'all', fetchImpl: loud });
    expect(loud.calls.find((c) => c.init.method === 'PATCH')!.url).toContain('sendUpdates=all');

    const quiet = mk();
    await addEventGuests({ ...base, sendUpdates: 'none', fetchImpl: quiet });
    expect(quiet.calls.find((c) => c.init.method === 'PATCH')!.url).toContain('sendUpdates=none');
  });

  test('defaults to none, so a mistaken call cannot email 43 people', async () => {
    const fetchImpl = fakeFetch({
      'oauth2.googleapis.com/token': { body: { access_token: 'at', expires_in: 3599 } },
      'events/evt123': { body: { id: 'evt123', attendees: [] } },
    });
    await addEventGuests({ ...base, fetchImpl });
    expect(fetchImpl.calls.find((c) => c.init.method === 'PATCH')!.url).toContain('sendUpdates=none');
  });

  test('does no PATCH at all when everyone is already invited', async () => {
    const fetchImpl = fakeFetch({
      'oauth2.googleapis.com/token': { body: { access_token: 'at', expires_in: 3599 } },
      'events/evt123': { body: { id: 'evt123', attendees: [{ email: 'new@y.com' }] } },
    });
    const res = await addEventGuests({ ...base, fetchImpl });
    expect(res.ok).toBe(true);
    expect(res.added).toEqual([]);
    expect(res.alreadyPresent).toEqual(['new@y.com']);
    expect(fetchImpl.calls.some((c) => c.init.method === 'PATCH')).toBe(false);
  });

  test('reports malformed addresses instead of shipping them to Google', async () => {
    const fetchImpl = fakeFetch({
      'oauth2.googleapis.com/token': { body: { access_token: 'at', expires_in: 3599 } },
      'events/evt123': { body: { id: 'evt123', attendees: [] } },
    });
    const res = await addEventGuests({ ...base, emails: ['good@x.com', 'bogus'], fetchImpl });
    expect(res.rejected).toEqual(['bogus']);
    expect(res.added).toEqual(['good@x.com']);
  });

  test('surfaces a refused token rather than reporting success', async () => {
    const fetchImpl = fakeFetch({
      'oauth2.googleapis.com/token': { status: 400, body: { error: 'invalid_grant' } },
    });
    const res = await addEventGuests({ ...base, fetchImpl });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/invalid_grant|token/i);
  });

  test('surfaces a failed PATCH rather than reporting success', async () => {
    const fetchImpl = fakeFetch({
      'oauth2.googleapis.com/token': { body: { access_token: 'at', expires_in: 3599 } },
      'events/evt123': { body: { id: 'evt123', attendees: [] } },
    });
    const failing = (async (input: string | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') return new Response('{"error":{"message":"forbidden"}}', { status: 403 });
      return fetchImpl(input, init);
    }) as GcalFetch;
    const res = await addEventGuests({ ...base, fetchImpl: failing });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/forbidden|403/i);
  });
});
