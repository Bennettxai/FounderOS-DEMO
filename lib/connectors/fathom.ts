import { GATED, connected as gatedConnected } from '@/lib/connectors/demo-status';
/**
 * Fathom connector — the AI notetaker that sits on the operator's sales calls.
 * Meetings, their durations and their transcripts are first-party record of
 * every call, so this lives under CRM & Revenue next to Attio.
 *
 * Real API (docs: developers.fathom.ai):
 *   GET https://api.fathom.ai/external/v1/meetings   header: X-Api-Key
 * Keys are per-user and see the meetings you recorded plus anything shared to
 * your team. Rate limit is 60 calls/minute across all of a user's keys, so
 * callers should cache rather than poll.
 *
 * Honest status: no key ⇒ not_configured; key rejected or network down ⇒
 * error. Never a fake "connected". fetch is injectable so the request and
 * parse logic are testable offline.
 */
import { resolveCred, CRED_FILES } from '@/lib/creds';
import type { ConnectorStatus } from '@/lib/connectors/types';

const KEY = 'FATHOM_API_KEY';
const BASE = 'https://api.fathom.ai/external/v1';

type Fetch = typeof fetch;

export type FathomMeeting = {
  title: string;
  url: string | null;
  at: string; // ISO
  durationMinutes: number | null;
};

function resolveKey(): string | undefined {
  return resolveCred(KEY, [CRED_FILES.brainAgent, CRED_FILES.socialMedia]);
}

/** Map the API payload to flat rows. Tolerant: a shape we don't recognise is
 *  an empty list, never a throw, so one odd response can't blank a page. */
export function parseFathomMeetings(body: unknown): FathomMeeting[] {
  const items = (body as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const m = (raw ?? {}) as Record<string, unknown>;
    const duration = m.recording_duration_in_minutes;
    return {
      title: String(m.meeting_title ?? m.title ?? 'Untitled meeting'),
      url: typeof m.url === 'string' ? m.url : null,
      at: String(m.created_at ?? ''),
      durationMinutes: typeof duration === 'number' ? duration : null,
    };
  });
}

async function getMeetings(key: string, limit: number, fetchFn: Fetch): Promise<FathomMeeting[]> {
  const res = await fetchFn(`${BASE}/meetings`, {
    headers: { 'X-Api-Key': key },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFathomMeetings(await res.json()).slice(0, limit);
}

/** Recent recorded calls. Empty (never a throw) without a key or on failure —
 *  the status card is where the failure is reported. */
export async function recentFathomMeetings(limit = 10, fetchFn: Fetch = fetch): Promise<FathomMeeting[]> {
  const key = resolveKey();
  if (!key) return [];
  try {
    return await getMeetings(key, limit, fetchFn);
  } catch {
    return [];
  }
}

export async function fathomStatus(fetchFn: Fetch = fetch): Promise<ConnectorStatus> {
  if (GATED) return gatedConnected('fathom', 'Fathom', 'crm', 'call recordings & transcripts · live');
  const base = { id: 'fathom', name: 'Fathom', kind: 'crm' } as const;
  const key = resolveKey();
  if (!key) {
    return {
      ...base,
      state: 'not_configured',
      detail:
        'Set FATHOM_API_KEY in .env.local to pull recorded calls, durations and transcripts. Create a key in Fathom under Settings → API.',
    };
  }
  try {
    const meetings = await getMeetings(key, 100, fetchFn);
    return {
      ...base,
      state: 'connected',
      detail: `Fathom reachable · ${meetings.length} recorded meeting${meetings.length === 1 ? '' : 's'} visible to this key`,
      meta: { meetings: meetings.length },
    };
  } catch (err) {
    return {
      ...base,
      state: 'error',
      detail: `FATHOM_API_KEY is set but the call failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
