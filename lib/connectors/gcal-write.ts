/**
 * Google Calendar, write side.
 *
 * The sibling `gcal.ts` reads calendars over legacy CalDAV using the Gmail app
 * passwords the inboxes already carry. That path cannot manage attendees: Google's
 * legacy CalDAV endpoint accepts an ATTENDEE change but does not reliably send
 * the invitation mail, which is the entire point of adding someone. So writes go
 * through the real Calendar API with OAuth instead, and the two modules stay
 * separate rather than pretending one credential covers both.
 *
 * Setup is a one-time consent: `node scripts/gcal-auth.mjs` mints
 * GCAL_REFRESH_TOKEN into .env.local from a Desktop-app OAuth client. Scope is
 * https://www.googleapis.com/auth/calendar.events, which is enough to patch an
 * event and NOT enough to read mail or touch anything else.
 *
 * Two safety properties this module holds on purpose, both pinned by tests:
 *
 *   1. `sendUpdates` defaults to 'none'. Every call that actually mails people
 *      has to say so. A mistaken invocation against a 43-person recurring call
 *      is not something you can un-send.
 *   2. Attendees are MERGED, never replaced. PUT semantics on a Google event
 *      would silently drop everyone already invited, and re-listing an existing
 *      attendee resets their RSVP to needsAction and re-notifies them. The merge
 *      is case-insensitive and preserves each existing row verbatim.
 *
 * Patching a recurring event's parent id propagates the guest list to every
 * instance, which is what "add them to the weekly call" means.
 */

export type GcalFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type GcalWriteCreds = { clientId: string; clientSecret: string; refreshToken: string };

/** An attendee row as Google returns it. Unknown keys are preserved on merge. */
export type Attendee = { email: string; [k: string]: unknown };

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';
const TIMEOUT_MS = 20_000;

/**
 * All three parts or nothing. A client id without a refresh token cannot mint
 * an access token, so reporting "configured" on a partial set would turn a
 * setup mistake into a runtime failure at the worst moment.
 */
export function resolveGcalWriteCreds(
  env: Record<string, string | undefined> = process.env,
): GcalWriteCreds | null {
  const clientId = env.GCAL_CLIENT_ID;
  const clientSecret = env.GCAL_CLIENT_SECRET;
  const refreshToken = env.GCAL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

/** Deliberately strict: a domain must have a dot, so `x@y` is caught here
    rather than by Google after the invite has partly gone out. */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function validEmails(input: string[]): { ok: string[]; bad: string[] } {
  const ok: string[] = [];
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const e = raw.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) {
      bad.push(raw.trim());
      continue;
    }
    if (seen.has(e)) continue;
    seen.add(e);
    ok.push(e);
  }
  return { ok, bad };
}

/** Existing rows pass through untouched; only genuinely new addresses are appended. */
export function mergeAttendees(existing: Attendee[], add: string[]): Attendee[] {
  const have = new Set(existing.map((a) => String(a.email).trim().toLowerCase()));
  const out: Attendee[] = [...existing];
  for (const e of add) {
    const k = e.trim().toLowerCase();
    if (have.has(k)) continue;
    have.add(k);
    out.push({ email: k });
  }
  return out;
}

async function mintAccessToken(creds: GcalWriteCreds, fetchImpl: GcalFetch): Promise<string> {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`token refresh failed: ${body.error || res.status}`);
  }
  return body.access_token;
}

export type AddGuestsResult = {
  ok: boolean;
  /** Addresses newly added to the event by this call. */
  added: string[];
  /** Valid addresses that were already on the invite, left alone. */
  alreadyPresent: string[];
  /** Addresses that never reached Google because they are malformed. */
  rejected: string[];
  error?: string;
};

export async function addEventGuests(opts: {
  creds: GcalWriteCreds | null;
  calendarId: string;
  eventId: string;
  emails: string[];
  /** 'all' mails every guest. Defaults to 'none' so mailing is always deliberate. */
  sendUpdates?: 'all' | 'externalOnly' | 'none';
  fetchImpl?: GcalFetch;
}): Promise<AddGuestsResult> {
  const { creds, calendarId, eventId, emails } = opts;
  const sendUpdates = opts.sendUpdates ?? 'none';
  const fetchImpl = opts.fetchImpl ?? fetch;
  const { ok: valid, bad: rejected } = validEmails(emails);

  if (!creds) {
    return { ok: false, added: [], alreadyPresent: [], rejected, error: 'no Google Calendar credentials (GCAL_CLIENT_ID / GCAL_CLIENT_SECRET / GCAL_REFRESH_TOKEN)' };
  }

  try {
    const token = await mintAccessToken(creds, fetchImpl);
    const auth = { Authorization: `Bearer ${token}` };
    const evUrl = `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;

    const getRes = await fetchImpl(evUrl, { headers: auth, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!getRes.ok) throw new Error(`event read failed: ${getRes.status}`);
    const event = (await getRes.json()) as { attendees?: Attendee[] };
    const existing = Array.isArray(event.attendees) ? event.attendees : [];

    const have = new Set(existing.map((a) => String(a.email).trim().toLowerCase()));
    const alreadyPresent = valid.filter((e) => have.has(e));
    const added = valid.filter((e) => !have.has(e));

    // Nothing to do is a success, and must not cost a re-notify.
    if (added.length === 0) return { ok: true, added: [], alreadyPresent, rejected };

    const patchRes = await fetchImpl(`${evUrl}?sendUpdates=${sendUpdates}`, {
      method: 'PATCH',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendees: mergeAttendees(existing, added) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!patchRes.ok) {
      const detail = (await patchRes.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(`patch failed (${patchRes.status}): ${detail.error?.message ?? ''}`.trim());
    }

    return { ok: true, added, alreadyPresent, rejected };
  } catch (err) {
    return {
      ok: false,
      added: [],
      alreadyPresent: [],
      rejected,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
