/**
 * Trakyo seam — organic content attribution for the funnel (mainly the
 * Launchpad Cohort: which post/reel actually produced a lead). Live
 * against Trakyo API v1: `trakyoTouches` pulls `GET /v1/leads` and maps each
 * lead's `first_touch` onto the journey of the same name.
 */
import { resolveCred, CRED_FILES } from '@/lib/creds';
import { TRAKYO_API } from '@/lib/connectors/trakyo';
import { matchAcquisition } from '@/lib/funnel-radial';
import type { FunnelAcquisition, FunnelJourney } from '@/lib/schemas';

/** One attributed content event as Trakyo will report it. */
export type TrakyoEvent = {
  lead: string; // primary display identity (first name, else first email)
  names: string[]; // every name Trakyo captured for this lead
  emails: string[]; // every email Trakyo captured for this lead
  label: string; // the content piece, e.g. 'IG reel: "3 AI offers…"'
  channel: 'organic' | 'ads';
  at: string; // YYYY-MM-DD
  sourceType: string; // Trakyo first_touch.type: youtube | custom | meta_ad | referrer | other
  sourceName: string | null; // e.g. 'Instagram', 'YouTube', a tracked-link name
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The rim wedge a Trakyo first touch justifies. Structural types map
 * directly (youtube stays youtube; meta_ad is the IG/FB machine, matching the
 * radial's paid-traffic rule). Custom links and referrers classify on the
 * source name first, then the content label — falling honestly to
 * word_of_mouth when Trakyo tracked the click but not the platform.
 */
export function trakyoAcquisition(e: TrakyoEvent): FunnelAcquisition {
  if (e.sourceType === 'youtube') return 'youtube';
  if (e.sourceType === 'meta_ad') return 'instagram';
  return matchAcquisition(`${e.sourceName ?? ''} ${e.label}`) ?? 'word_of_mouth';
}

/**
 * Swap a journey's synthetic first touch for the real Trakyo-attributed
 * content touch — matched by any normalized name or email the two systems
 * share (CRM deal names rarely equal Trakyo's captured identity; emails
 * usually do). The swapped touch carries its `acquisition` stamp so the
 * radial trusts Trakyo over keyword sniffing. Everything else — stage
 * history, stall math, the node's transit — is untouched.
 */
export function mergeTrakyoTouches(journeys: FunnelJourney[], events: TrakyoEvent[]): FunnelJourney[] {
  if (events.length === 0) return journeys;
  const byIdentity = new Map<string, TrakyoEvent>();
  for (const e of events) {
    for (const id of [e.lead, ...e.names, ...e.emails]) {
      const key = norm(id);
      if (key && !byIdentity.has(key)) byIdentity.set(key, e); // first event wins
    }
  }
  const lookup = (j: FunnelJourney): TrakyoEvent | undefined =>
    [j.name, j.person, j.email]
      .filter((v): v is string => Boolean(v))
      .map((v) => byIdentity.get(norm(v)))
      .find(Boolean);
  return journeys.map((j) => {
    const event = lookup(j);
    if (!event || j.touches.length === 0) return j;
    const [first, ...rest] = j.touches;
    return {
      ...j,
      touches: [
        {
          ...first,
          channel: event.channel,
          label: event.label,
          source: 'trakyo',
          at: event.at,
          acquisition: trakyoAcquisition(event),
        },
        ...rest,
      ],
    };
  });
}

/**
 * Map `GET /v1/leads` into first-touch events. A lead is only usable when
 * Trakyo captured both an identity and an attributed first touch; anything
 * else is skipped rather than guessed at.
 *
 * The payload carries structural provenance (`first_touch.type` +
 * `source_name`), so channel is honest: `meta_ad` first touches are `ads`,
 * everything else is `organic` (Trakyo is this OS's organic lane).
 */
export function mapTrakyoLeads(raw: unknown): TrakyoEvent[] {
  const data = (raw as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const strings = (values: unknown): string[] =>
    (Array.isArray(values) ? values : []).filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    );

  const out: TrakyoEvent[] = [];
  for (const rec of data) {
    if (!rec || typeof rec !== 'object') continue;
    const r = rec as Record<string, unknown>;
    const touch = r.first_touch;
    if (!touch || typeof touch !== 'object') continue;
    const t = touch as Record<string, unknown>;

    const ids = (r.identifiers ?? {}) as Record<string, unknown>;
    const names = strings(ids.names);
    const emails = strings(ids.emails);
    const lead = names[0] ?? emails[0];
    if (!lead) continue;

    const content = (t.content_item ?? {}) as Record<string, unknown>;
    const label = [content.name, t.name, t.source_name].find(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    );
    if (!label) continue;

    const at = typeof t.occurred_at === 'string' ? t.occurred_at.slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) continue;

    const sourceType = typeof t.type === 'string' ? t.type : 'other';
    const sourceName = typeof t.source_name === 'string' && t.source_name.trim() ? t.source_name : null;
    out.push({
      lead,
      names,
      emails,
      label,
      channel: sourceType === 'meta_ad' ? 'ads' : 'organic',
      at,
      sourceType,
      sourceName,
    });
  }
  return out;
}

/** How many leads to pull per funnel render. Trakyo paginates via
 *  `starting_after`; the funnel only needs the recent cohort. */
const LEAD_LIMIT = 100;

/**
 * The live pull. Degrades to an empty set on any failure so a Trakyo outage
 * can never take down the funnel — journeys just keep their existing touches.
 */
export async function trakyoTouches(fetchImpl: typeof fetch = fetch): Promise<TrakyoEvent[]> {
  const key = resolveCred('TRAKYO_API_KEY', [CRED_FILES.brainAgent, CRED_FILES.socialMedia]);
  if (!key) return [];
  try {
    const res = await fetchImpl(`${TRAKYO_API}/leads?limit=${LEAD_LIMIT}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return mapTrakyoLeads(await res.json());
  } catch {
    return [];
  }
}
