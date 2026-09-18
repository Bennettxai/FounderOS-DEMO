import { GATED, connected as gatedConnected } from '@/lib/connectors/demo-status';
/**
 * Trakyo connector — organic attribution: ties content → clicks → leads →
 * booked calls → revenue, so you can see which post actually produced money.
 * Lives under CRM & Revenue.
 *
 * Built against the published Trakyo API v1
 * (`https://api.trakyo.io/v1`, `Authorization: Bearer tky_live_…`). Keys carry
 * scopes; a valid key without the endpoint's scope answers 403, which surfaces
 * as an honest `error` rather than a fake "connected".
 */
import { resolveCred, CRED_FILES } from '@/lib/creds';
import type { ConnectorStatus } from '@/lib/connectors/types';

const KEY = 'TRAKYO_API_KEY';
export const TRAKYO_API = 'https://api.trakyo.io/v1';

export type TrakyoMetrics = {
  clicks: number;
  visits: number;
  formSubmissions: number;
  bookings: number;
  transactions: number;
  revenueUsd: number;
  rangeStart: string;
  rangeEnd: string;
};

/** Trakyo returns money as a decimal string ("4500.50") and omits counters that
 *  are zero for the range, so coerce both rather than trusting the wire. */
function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Map a `GET /v1/metrics` envelope. Null when there is no usable `totals`
 *  object — callers treat that as an error, never as zeroed-out real numbers. */
export function parseTrakyoMetrics(raw: unknown): TrakyoMetrics | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const totals = r.totals;
  if (!totals || typeof totals !== 'object') return null;
  const t = totals as Record<string, unknown>;
  const range = (r.range ?? {}) as Record<string, unknown>;
  return {
    clicks: num(t.clicks),
    visits: num(t.visits),
    formSubmissions: num(t.form_submissions),
    bookings: num(t.bookings),
    transactions: num(t.transactions),
    revenueUsd: num(t.revenue),
    rangeStart: str(range.start),
    rangeEnd: str(range.end),
  };
}

export function trakyoKey(): string | undefined {
  return resolveCred(KEY, [CRED_FILES.brainAgent, CRED_FILES.socialMedia]);
}

/** Account-wide totals for Trakyo's default window. Throws on transport or
 *  auth failure so the caller can report the real reason. */
export async function trakyoMetrics(
  fetchImpl: typeof fetch = fetch,
): Promise<TrakyoMetrics | null> {
  const key = trakyoKey();
  if (!key) return null;
  const res = await fetchImpl(`${TRAKYO_API}/metrics`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseTrakyoMetrics(await res.json());
}

export async function trakyoStatus(fetchImpl: typeof fetch = fetch): Promise<ConnectorStatus> {
  if (GATED) return gatedConnected('trakyo', 'Trakyo', 'crm', 'organic attribution · live');
  const base = { id: 'trakyo', name: 'Trakyo', kind: 'crm' } as const;
  if (!trakyoKey()) {
    return {
      ...base,
      state: 'not_configured',
      detail:
        'Organic attribution (content → leads → booked calls → revenue). Set TRAKYO_API_KEY.',
    };
  }
  try {
    const m = await trakyoMetrics(fetchImpl);
    if (!m) throw new Error('metrics response carried no totals');
    const money = m.revenueUsd > 0 ? ` · $${m.revenueUsd.toLocaleString('en-US')} revenue` : '';
    const window = m.rangeStart && m.rangeEnd ? ` (${m.rangeStart} → ${m.rangeEnd})` : '';
    return {
      ...base,
      state: 'connected',
      detail: `${m.clicks} clicks · ${m.visits} visits · ${m.formSubmissions} form submissions${money}${window}`,
      meta: {
        clicks: m.clicks,
        visits: m.visits,
        formSubmissions: m.formSubmissions,
        bookings: m.bookings,
        revenueUsd: m.revenueUsd,
      },
    };
  } catch (err) {
    return {
      ...base,
      state: 'error',
      detail: `TRAKYO_API_KEY set but the Trakyo API call failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}
