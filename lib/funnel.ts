/**
 * Funnel stage math — pure functions over FunnelJourney rows. The journeys
 * themselves come from db.funnel (seeded dummy today; Trakyo / Meta Ads MCP
 * fill the same shape live), so everything here stays source-agnostic.
 */
import {
  FunnelSummarySchema,
  type FunnelJourney,
  type FunnelStage,
  type FunnelSummary,
  type FunnelTouch,
  type FunnelVenture,
} from '@/lib/schemas';

/** Canonical stage order with display labels — the 4–5 data points. */
export const FUNNEL_STAGES: { id: FunnelStage; label: string }[] = [
  { id: 'first_touch', label: 'First touch' },
  { id: 'engaged', label: 'Engaged' },
  { id: 'nurtured', label: 'Nurtured' },
  { id: 'opted_in', label: 'Opted in' },
  { id: 'converted', label: 'Converted' },
];

const STAGE_INDEX: Record<FunnelStage, number> = Object.fromEntries(
  FUNNEL_STAGES.map((s, i) => [s.id, i]),
) as Record<FunnelStage, number>;

/** Display glyphs for touch channels (journey chips). */
export const CHANNEL_GLYPHS: Record<string, string> = {
  organic: '◉',
  ads: '▣',
  dm: '✉',
  email: '@',
  webinar: '▶',
  call: '☎',
  checkout: '$',
  crm: '◈',
};

/* ---------------------------------------------------------------- decay ----
 * The staleness math moved to lib/funnel-decay.ts — same functions, same
 * numbers, no dependencies. It is re-exported from here so every existing
 * '@/lib/funnel' import (page, API route, FunnelSpace, FunnelRadial,
 * FunnelNodeCard, screen-context, funnel-radial) keeps working untouched.
 *
 * What stays in this file is everything that needs the schema: the stage
 * table, the channel glyphs, and the two view models built on top of the
 * decay numbers.
 */
export {
  ATTENTION_CAP,
  DECAY_DAYS,
  DECAY_FADE_START,
  PUSH_LIKELIHOOD,
  STALL_DAYS,
  attentionQueue,
  decayFactor,
  decayView,
  journeyMeta,
  splitFunnelJourneys,
  DEFAULT_DECAY_CONFIG,
  LEGACY_DECAY_CONFIG,
  type DecayConfig,
  type JourneyState,
} from '@/lib/funnel-decay';

import { decayFactor, journeyMeta, type JourneyState } from '@/lib/funnel-decay';

/** One client in the open funnel space — everything the canvas needs to move it. */
export type FunnelSpaceNode = {
  id: string;
  name: string;
  venture: FunnelVenture;
  status: FunnelStage;
  relationship: FunnelJourney['relationship'];
  likelihood: number;
  state: JourneyState;
  daysSinceLastTouch: number;
  product: string | null;
  amountUsd: number | null;
  /** Distinct hubs in visit order — the path the node travels on entry. */
  hubs: number[];
  /** Where they live now: the last hub visited. */
  currentHub: number;
  /** Node size encodes likelihood-to-buy. */
  radius: number;
  /** 0 = vivid segment color · → 1 = faded red, about to archive. */
  decay: number;
  /** Deep link to the source record (Attio / GHL contact page). */
  url: string | null;
  email: string | null;
  phone: string | null;
  /** The human behind the deal — the dossier's identity block. */
  person: string | null;
  company: string | null;
  role: string | null;
  linkedin: string | null;
  touches: FunnelTouch[];
};

/**
 * Model for the "open space" view: each journey becomes one moving node.
 * Repeated touches inside a stage collapse into a single hub visit (the node
 * travels sections, not touches); color-state comes from journeyMeta and size
 * from likelihood.
 */
export function funnelSpaceModel(journeys: FunnelJourney[], now: Date): FunnelSpaceNode[] {
  return journeys.map((j) => {
    const hubs: number[] = [];
    for (const t of j.touches) {
      const col = STAGE_INDEX[t.stage];
      if (hubs[hubs.length - 1] !== col) hubs.push(col);
    }
    if (hubs.length === 0) hubs.push(0);
    const meta = journeyMeta(j, now);
    return {
      id: j.id,
      name: j.name,
      venture: j.venture,
      status: j.status,
      relationship: j.relationship,
      likelihood: j.likelihood,
      state: meta.state,
      daysSinceLastTouch: meta.daysSinceLastTouch,
      product: j.product,
      amountUsd: j.amountUsd,
      hubs,
      currentHub: hubs[hubs.length - 1],
      // Constellation-small: 2.5–5.5px by likelihood, knowledge-graph texture.
      radius: 2.5 + (j.likelihood / 100) * 3,
      decay: decayFactor(meta.daysSinceLastTouch, j.status),
      url: j.url,
      email: j.email,
      phone: j.phone,
      person: j.person,
      company: j.company,
      role: j.role,
      linkedin: j.linkedin,
      touches: j.touches,
    };
  });
}

/**
 * Per-stage reached counts + stage→stage conversion. "Reached" means the
 * journey's furthest stage is at or past the bar's stage — a journey that
 * skipped the optional `nurtured` touch still progressed past that point.
 * The organic/ads split keys off each journey's first touch.
 */
export function funnelSummary(journeys: FunnelJourney[]): FunnelSummary {
  const converted = journeys.filter((j) => j.status === 'converted');
  const stages = FUNNEL_STAGES.map(({ id }, i) => {
    const reached = journeys.filter((j) => STAGE_INDEX[j.status] >= i);
    const firstChannel = (j: FunnelJourney) => j.touches[0]?.channel;
    return {
      stage: id,
      total: reached.length,
      organic: reached.filter((j) => firstChannel(j) === 'organic').length,
      ads: reached.filter((j) => firstChannel(j) === 'ads').length,
      conversionFromPrev: null as number | null,
    };
  });
  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1].total;
    stages[i].conversionFromPrev = prev > 0 ? Math.round((stages[i].total / prev) * 1000) / 10 : null;
  }
  return FunnelSummarySchema.parse({
    clients: journeys.length,
    converted: converted.length,
    revenueUsd: converted.reduce((sum, j) => sum + (j.amountUsd ?? 0), 0),
    stages,
  });
}
