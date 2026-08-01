import ical from 'node-ical';
import type { ConnectorStatus } from '@/lib/connectors/types';

/**
 * Google Calendar via CalDAV. Reuses the IMAP inbox app passwords (INBOX_*_*):
 * a Google app password also authorizes the legacy CalDAV endpoint
 * (https://www.google.com/calendar/dav/{email}/events/) over Basic auth, so the
 * four already-configured Gmail accounts get calendars with zero extra setup.
 * Read-only: we REPORT events in a window, expand recurrences client-side
 * (Google's legacy CalDAV ignores server-side <expand>), and surface a join URL
 * (Meet / Zoom / Teams) per event.
 */

export type CalAccount = { user: string; pass: string; name: string; color: string };

export type CalEvent = {
  id: string;
  account: string;
  color: string;
  title: string;
  start: string; // ISO
  end: string | null; // ISO
  allDay: boolean;
  location: string | null;
  joinUrl: string | null;
};

// One stable color per inbox slot (matches the by-platform accent family).
const CAL_COLORS = ['#3df08c', '#5ec9f8', '#e1306c', '#ffc53d'];

/** Inbox slots whose host is Google → CalDAV-capable accounts. */
export function caldavAccounts(env: Record<string, string | undefined> = process.env): CalAccount[] {
  const out: CalAccount[] = [];
  for (let slot = 1; slot <= 4; slot++) {
    const host = env[`INBOX_${slot}_HOST`];
    const user = env[`INBOX_${slot}_USER`];
    const pass = env[`INBOX_${slot}_PASS`];
    if (!host || !user || !pass) continue;
    if (!/gmail|google/i.test(host)) continue; // legacy CalDAV path is Google-only
    out.push({
      user,
      pass: pass.replace(/\s+/g, ''),
      name: env[`INBOX_${slot}_NAME`] || user,
      color: CAL_COLORS[(slot - 1) % CAL_COLORS.length],
    });
  }
  return out;
}

const JOIN_RE =
  /(https?:\/\/(?:[a-z0-9-]+\.)?(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com|whereby\.com|meet\.jit\.si)\/[^\s"'<>]+)/i;

/** Pull a video-call link from a calendar event (Meet/Zoom/Teams/…), or null. */
export function extractJoinUrl(ev: {
  'X-GOOGLE-CONFERENCE'?: unknown;
  'GOOGLE-CONFERENCE'?: unknown;
  location?: unknown;
  description?: unknown;
  url?: unknown;
}): string | null {
  // node-ical strips the leading "X-", so real events expose GOOGLE-CONFERENCE.
  const conf = ev['GOOGLE-CONFERENCE'] ?? ev['X-GOOGLE-CONFERENCE'];
  const confStr = typeof conf === 'string' ? conf : (conf as { val?: string })?.val;
  if (typeof confStr === 'string' && /^https?:\/\//.test(confStr)) return confStr;
  for (const field of [ev.location, ev.description, ev.url]) {
    if (typeof field === 'string') {
      const m = field.match(JOIN_RE);
      if (m) return m[1];
    }
  }
  return null;
}

function toEvent(
  account: CalAccount,
  id: string,
  title: string,
  start: Date,
  end: Date | null,
  allDay: boolean,
  location: string | null,
  joinUrl: string | null,
): CalEvent {
  return {
    // namespaced by account: the same meeting can live on multiple calendars
    // (shared invites), so the UID alone isn't unique across accounts.
    id: `${account.user}:${id}`,
    account: account.name,
    color: account.color,
    title: title || '(no title)',
    start: start.toISOString(),
    end: end ? end.toISOString() : null,
    allDay,
    location: location || null,
    joinUrl,
  };
}

/** Parse iCal blobs into normalized events within [startMs, endMs), expanding
    recurring events client-side and applying EXDATE / overrides. */
export function eventsFromIcal(icalStrings: string[], account: CalAccount, startMs: number, endMs: number): CalEvent[] {
  const out: CalEvent[] = [];
  const winStart = new Date(startMs);
  const winEnd = new Date(endMs);
  const asStr = (v: unknown): string =>
    typeof v === 'string' ? v : v && typeof v === 'object' && 'val' in v ? String((v as { val: unknown }).val) : '';
  for (const s of icalStrings) {
    let data: ical.CalendarResponse;
    try {
      data = ical.sync.parseICS(s);
    } catch {
      continue;
    }
    for (const key of Object.keys(data)) {
      const ev = data[key] as ical.VEvent & Record<string, unknown>;
      if (!ev || ev.type !== 'VEVENT' || !(ev.start instanceof Date)) continue;
      const start = ev.start as Date;
      const end = ev.end instanceof Date ? (ev.end as Date) : null;
      const durationMs = end ? end.getTime() - start.getTime() : 0;
      const allDay = (ev as { datetype?: string }).datetype === 'date';
      const baseTitle = (ev.summary as string) || '';
      const baseLoc = (ev.location as string) || null;
      const baseJoin = extractJoinUrl(ev);
      const rrule = (ev as { rrule?: { between(a: Date, b: Date, inc?: boolean): Date[] } }).rrule;

      if (rrule) {
        const exdate = (ev as { exdate?: Record<string, Date> }).exdate || {};
        const recurrences = (ev as { recurrences?: Record<string, ical.VEvent> }).recurrences || {};
        for (const d of rrule.between(winStart, winEnd, true)) {
          const dayKey = d.toISOString().slice(0, 10);
          if (Object.keys(exdate).some((k) => k.slice(0, 10) === dayKey)) continue;
          const ov = recurrences[dayKey];
          if (ov && ov.start instanceof Date) {
            const ovEnd = ov.end instanceof Date ? ov.end : new Date(ov.start.getTime() + durationMs);
            out.push(
              toEvent(account, `${ev.uid}-${dayKey}`, asStr(ov.summary) || baseTitle, ov.start, ovEnd, allDay, asStr(ov.location) || baseLoc, extractJoinUrl(ov) || baseJoin),
            );
          } else {
            out.push(toEvent(account, `${ev.uid}-${dayKey}`, baseTitle, d, new Date(d.getTime() + durationMs), allDay, baseLoc, baseJoin));
          }
        }
      } else {
        const evEnd = end || start;
        if (start.getTime() < endMs && evEnd.getTime() >= startMs) {
          out.push(toEvent(account, (ev.uid as string) || key, baseTitle, start, end, allDay, baseLoc, baseJoin));
        }
      }
    }
  }
  return out;
}

/** Flatten per-account events, sort by start, drop duplicates of the same
    meeting shared across calendars (same title + start), cap at limit. */
export function mergeUpcoming(perAccount: CalEvent[][], limit = 25): CalEvent[] {
  const sorted = perAccount.flat().sort((a, b) => a.start.localeCompare(b.start));
  const seen = new Set<string>();
  const deduped: CalEvent[] = [];
  for (const ev of sorted) {
    const key = `${ev.title}|${ev.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(ev);
  }
  return deduped.slice(0, limit);
}

// ── Network (CalDAV REPORT) ────────────────────────────────────────────────

const compact = (iso: string) => `${iso.slice(0, 19).replace(/[-:]/g, '')}Z`;

function extractCalendarData(xml: string): string[] {
  const out: string[] = [];
  const re = /<[^>]*calendar-data[^>]*>([\s\S]*?)<\/[^>]*calendar-data>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const decoded = m[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#13;/g, '')
      .replace(/&amp;/g, '&')
      .trim();
    if (decoded.includes('BEGIN:VCALENDAR')) out.push(decoded);
  }
  return out;
}

type FetchLike = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** REPORT one account's events collection for the window; returns iCal blobs. */
export async function fetchAccountIcal(
  account: CalAccount,
  startISO: string,
  endISO: string,
  doFetch: FetchLike = fetch as unknown as FetchLike,
): Promise<string[]> {
  const url = `https://www.google.com/calendar/dav/${encodeURIComponent(account.user)}/events/`;
  const body = `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${compact(startISO)}" end="${compact(endISO)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  const res = await doFetch(url, {
    method: 'REPORT',
    headers: {
      Authorization: `Basic ${Buffer.from(`${account.user}:${account.pass}`).toString('base64')}`,
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body,
  });
  if (!res.ok && res.status !== 207) throw new Error(`CalDAV ${res.status}`);
  return extractCalendarData(await res.text());
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

/** Upcoming events across every Google calendar, sorted, within `days`. */
export async function upcomingEvents(
  env: Record<string, string | undefined> = process.env,
  opts: { days?: number; limit?: number; now?: Date } = {},
): Promise<CalEvent[]> {
  const { days = 14, limit = 25, now = new Date() } = opts;
  const accounts = caldavAccounts(env);
  if (accounts.length === 0) return [];
  const startMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const endMs = startMs + days * 86_400_000;
  const startISO = new Date(startMs).toISOString();
  const endISO = new Date(endMs).toISOString();
  const perAccount = await Promise.all(
    accounts.map(async (account) => {
      try {
        const blobs = await withTimeout(fetchAccountIcal(account, startISO, endISO), 8000);
        return eventsFromIcal(blobs, account, startMs, endMs);
      } catch {
        return [];
      }
    }),
  );
  return mergeUpcoming(perAccount, limit);
}

export async function calendarStatus(env: Record<string, string | undefined> = process.env): Promise<ConnectorStatus> {
  const accounts = caldavAccounts(env);
  if (accounts.length === 0) {
    return {
      id: 'calendar',
      name: 'Calendar',
      kind: 'calendar',
      state: 'not_configured',
      detail: 'No Google inboxes configured — calendars reuse the INBOX_* Gmail app passwords.',
      meta: { calendars: 0 },
    };
  }
  try {
    const events = await upcomingEvents(env, { days: 14 });
    return {
      id: 'calendar',
      name: 'Calendar',
      kind: 'calendar',
      state: 'connected',
      detail: `${events.length} upcoming · ${accounts.length} calendar${accounts.length > 1 ? 's' : ''} (next 14 days, CalDAV)`,
      meta: { calendars: accounts.length, upcoming: events.length },
    };
  } catch (err) {
    return {
      id: 'calendar',
      name: 'Calendar',
      kind: 'calendar',
      state: 'error',
      detail: `CalDAV read failed: ${err instanceof Error ? err.message : String(err)}`,
      meta: { calendars: accounts.length },
    };
  }
}
