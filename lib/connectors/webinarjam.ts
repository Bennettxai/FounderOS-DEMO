/**
 * WebinarJam connector — Launchpad Cohort webinar funnel. Registrants and
 * attendees are inbound leads, so this lives under CRM & Revenue. The API key
 * is account-wide (POST form params, not a bearer header). Honest status: no
 * key ⇒ not_configured; key present but rejected ⇒ error. fetch is injectable
 * so the request/parse logic is testable offline.
 *
 * Endpoints (api.webinarjam.com):
 *   POST /webinarjam/webinars     { api_key }                       → validate
 *   POST /webinarjam/registrants  { api_key, webinar_id, schedule_id } → leads
 */
import { resolveCred, CRED_FILES } from '@/lib/creds';
import type { ConnectorStatus } from '@/lib/connectors/types';

const KEY = 'WEBINARJAM_API_KEY';
const BASE = 'https://api.webinarjam.com/webinarjam';

type Fetch = typeof fetch;

function resolveKey(): string | undefined {
  return resolveCred(KEY, [CRED_FILES.agentsEnv, CRED_FILES.socialMedia]);
}

function form(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}

export async function webinarjamStatus(fetchFn: Fetch = fetch): Promise<ConnectorStatus> {
  const base = { id: 'webinarjam', name: 'WebinarJam', kind: 'crm' } as const;
  const key = resolveKey();
  if (!key) {
    return {
      ...base,
      state: 'not_configured',
      detail: 'Set WEBINARJAM_API_KEY in .env.local to pull Launchpad Cohort webinar registrants & attendees.',
    };
  }
  try {
    const res = await fetchFn(`${BASE}/webinars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ api_key: key }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { status?: string; webinars?: unknown[] };
    if (body.status && body.status !== 'success') throw new Error(`API status: ${body.status}`);
    const count = body.webinars?.length ?? 0;
    return {
      ...base,
      state: 'connected',
      detail: `Launchpad Cohort webinars reachable · ${count} webinar${count === 1 ? '' : 's'} on the account`,
      meta: { webinars: count },
    };
  } catch (err) {
    return {
      ...base,
      state: 'error',
      detail: `Key found but WebinarJam API failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Registrants (leads) for one webinar schedule. Returns [] when unconfigured. */
export async function listRegistrants(
  webinarId: string,
  scheduleId: string,
  fetchFn: Fetch = fetch,
): Promise<unknown[]> {
  const key = resolveKey();
  if (!key) return [];
  const res = await fetchFn(`${BASE}/registrants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ api_key: key, webinar_id: webinarId, schedule_id: scheduleId }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`WebinarJam registrants HTTP ${res.status}`);
  const body = (await res.json()) as { registrants?: unknown[] };
  return body.registrants ?? [];
}
