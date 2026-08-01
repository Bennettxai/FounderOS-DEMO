/**
 * GoHighLevel provider — the Launchpad Cohort pipeline
 * (owner@example.com sub-account) mapped into the same
 * FunnelJourney shape as Attio, so both CRMs share one space. Auth is a
 * Private Integration Token (Settings → Private Integrations, read scopes):
 * set GHL_API_KEY + GHL_LOCATION_ID in .env.local. Honest null when unkeyed
 * or unreachable; lost/abandoned opportunities are excluded but counted.
 *
 * GHL pipelines are custom per account, so stages map by pipeline position:
 * first stage → first_touch, then engaged (<0.4), nurtured (<0.75), opted_in;
 * a `won` opportunity is the conversion regardless of stage.
 */
import { resolveCred, CRED_FILES } from '@/lib/creds';
import { FUNNEL_STAGES } from '@/lib/funnel';
import { FunnelJourneySchema, type FunnelJourney, type FunnelStage, type FunnelTouch } from '@/lib/schemas';

export type GhlPipeline = {
  id: string;
  name: string;
  stages: { id: string; name: string; position?: number }[];
};

export type GhlOpportunity = {
  id: string;
  name: string;
  pipelineId: string;
  pipelineStageId: string;
  status: 'open' | 'won' | 'lost' | 'abandoned';
  monetaryValue?: number;
  createdAt?: string;
  updatedAt?: string;
  lastStatusChangeAt?: string;
  contactId?: string;
  contact?: { name?: string; email?: string | null; phone?: string | null };
  /** GHL attribution string (e.g. "Instagram DM", "LC - Opt In") when set. */
  source?: string;
  /** Session attribution trail — utmSource/medium carry the real channel. */
  attributions?: { utmSource?: string; medium?: string }[];
};

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

/**
 * Pipeline-position fraction → canonical hub for open opportunities. Stage
 * names win over position where the semantics are explicit (Alex's Main
 * Pipeline parks "Nurture 2 Weeks" stages late in the list).
 */
function stageFor(fraction: number, stageName: string): FunnelStage {
  if (/nurtur/i.test(stageName)) return 'nurtured';
  if (fraction <= 0) return 'first_touch';
  if (fraction < 0.4) return 'engaged';
  if (fraction < 0.75) return 'nurtured';
  return 'opted_in';
}

const day = (iso: string | undefined, fallback: string): string => (iso ?? fallback).slice(0, 10);

/** Pure mapper: GHL pipelines + opportunities → validated journeys. */
export function mapGhlOpportunities(
  pipelines: GhlPipeline[],
  opportunities: GhlOpportunity[],
  now: Date,
  locationId?: string,
): { journeys: FunnelJourney[]; excluded: number; total: number } {
  const stageIndex = new Map<string, { idx: number; count: number; name: string }>();
  for (const p of pipelines) {
    p.stages.forEach((s, idx) => stageIndex.set(`${p.id}:${s.id}`, { idx, count: p.stages.length, name: s.name }));
  }

  let excluded = 0;
  const journeys: FunnelJourney[] = [];

  for (const o of opportunities) {
    if (o.status === 'lost' || o.status === 'abandoned') {
      excluded++;
      continue;
    }
    const stage = stageIndex.get(`${o.pipelineId}:${o.pipelineStageId}`);
    if (!stage) continue; // unknown pipeline/stage — skip, never fatal

    const fraction = stage.count > 1 ? stage.idx / (stage.count - 1) : 0;
    const won = o.status === 'won';
    const canonical: FunnelStage = won ? 'converted' : stageFor(fraction, stage.name);
    const hubIdx = FUNNEL_STAGES.findIndex((s) => s.id === canonical);
    const id = `ghl-${o.id}`;
    const createdAt = day(o.createdAt, '1970-01-01');
    const lastAt = day(o.lastStatusChangeAt ?? o.updatedAt, o.createdAt ?? '1970-01-01');
    const value = o.monetaryValue ?? 0;
    // Attribution hints ride the entry label — that's what the radial view's
    // acquisition classifier (and the touch chip) reads. GHL sometimes stores
    // raw timestamps in `source`; drop those, they attribute nothing.
    const via = [
      ...new Set(
        [o.source, ...(o.attributions ?? []).flatMap((a) => [a.utmSource, a.medium])]
          .filter((v): v is string => Boolean(v))
          .filter((v) => !/^\d{4}-\d{2}-\d{2}T/.test(v)),
      ),
    ];
    // Legible fit score: pipeline depth is the strongest signal GHL gives us,
    // money on the table adds the rest. Won pins to 100.
    const score = won ? 100 : Math.min(100, 20 + Math.round(fraction * 50) + (value > 0 ? 15 : 0));

    const touches: FunnelTouch[] = FUNNEL_STAGES.slice(0, hubIdx + 1).map((s, i) => ({
      id: `${id}-t${i + 1}`,
      contactId: id,
      seq: i + 1,
      stage: s.id,
      channel: i === hubIdx && won ? 'checkout' : 'crm',
      label:
        i === 0
          ? `Opportunity created in GHL${via.length ? ` · via: ${via.join(', ')}` : ''}`
          : i === hubIdx
            ? `GHL stage: ${stage.name}${won ? ' (won)' : ''}`
            : `Progressed to ${s.label}`,
      source: 'ghl' as const,
      at: i === hubIdx ? lastAt : createdAt,
    }));

    try {
      journeys.push(
        FunnelJourneySchema.parse({
          id,
          name: o.contact?.name || o.name || 'Unnamed opportunity',
          venture: 'launchpad-cohort', // GHL is the LC machine
          status: canonical,
          product: won ? `GHL: ${stage.name}` : null,
          amountUsd: value > 0 ? value : won ? 0 : null,
          relationship: score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold',
          likelihood: score,
          url:
            locationId && o.contactId
              ? `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${o.contactId}`
              : null,
          email: o.contact?.email ?? null,
          phone: o.contact?.phone ?? null,
          createdAt,
          touches,
        }),
      );
    } catch {
      // malformed row — skip
    }
  }

  journeys.sort((a, b) => (b.touches.at(-1)?.at ?? '').localeCompare(a.touches.at(-1)?.at ?? ''));
  void now;
  return { journeys, excluded, total: opportunities.length };
}

/**
 * Fetch the live GHL pipeline. Null = not available (no token / API error);
 * the funnel simply runs without the GHL lane and the source strip says so.
 */
export async function ghlFunnelJourneys(
  now = new Date(),
): Promise<{ journeys: FunnelJourney[]; excluded: number; total: number } | null> {
  if ((process.env.FUNNEL_PROVIDER ?? 'attio') !== 'attio') return null; // seed-pinned (tests)
  const key = resolveCred('GHL_API_KEY', [CRED_FILES.agentsEnv]);
  const locationId = resolveCred('GHL_LOCATION_ID', [CRED_FILES.agentsEnv]);
  if (!key || !locationId) return null;
  const headers = { Authorization: `Bearer ${key}`, Version: GHL_VERSION, Accept: 'application/json' };
  try {
    const pipeRes = await fetch(`${GHL_BASE}/opportunities/pipelines?locationId=${locationId}`, {
      headers,
      cache: 'no-store',
    });
    if (!pipeRes.ok) return null;
    const pipelines = ((await pipeRes.json()) as { pipelines?: GhlPipeline[] }).pipelines ?? [];

    const opportunities: GhlOpportunity[] = [];
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(
        `${GHL_BASE}/opportunities/search?location_id=${locationId}&limit=100&page=${page}`,
        { headers, cache: 'no-store' },
      );
      if (!res.ok) return null;
      const batch = ((await res.json()) as { opportunities?: GhlOpportunity[] }).opportunities ?? [];
      opportunities.push(...batch);
      if (batch.length < 100) break;
    }
    return mapGhlOpportunities(pipelines, opportunities, now, locationId);
  } catch {
    return null;
  }
}
