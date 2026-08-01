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

/** Quiet for more than this many days before converting → the node runs red. */
export const STALL_DAYS = 7;
/** Quiet past this → the lead decays out of the space into the archive tab. */
export const DECAY_DAYS = 90;
/** Nodes stay their neutral segment color until here, then fade toward red.
 * Three quiet weeks = a lead visibly starting to die (Alex's live pipeline
 * clusters at 21–30d quiet, so the gradient actually shows). */
export const DECAY_FADE_START = 21;

/**
 * Continuous decay for the space's fade-to-red: 0 (neutral) through
 * DECAY_FADE_START, ramping linearly to 1 at DECAY_DAYS — the node visibly
 * dies before it archives. Converted never decays; advancing a stage resets
 * the quiet clock, so movement is what keeps a lead vivid.
 */
export function decayFactor(daysSinceLastTouch: number, status: FunnelStage): number {
  if (status === 'converted') return 0;
  return Math.min(1, Math.max(0, (daysSinceLastTouch - DECAY_FADE_START) / (DECAY_DAYS - DECAY_FADE_START)));
}

export type JourneyState = 'converted' | 'stalled' | 'active' | 'decayed';

/**
 * Liveness of one journey at `now`: how long since Alex last touched them,
 * and the color-state the space renders — green once converted, red when a
 * pre-conversion lead has sat quiet past STALL_DAYS, blue otherwise, and
 * `decayed` (out of the space, into the archive) past DECAY_DAYS.
 * Incoming leads (still at first_touch) never stall: they render blue-ish
 * until they're engaged — but even they decay after 90 quiet days.
 */
export function journeyMeta(j: FunnelJourney, now: Date): { daysSinceLastTouch: number; state: JourneyState } {
  const lastAt = j.touches[j.touches.length - 1]?.at ?? j.createdAt;
  const days = Math.max(0, Math.floor((now.getTime() - new Date(`${lastAt}T00:00:00Z`).getTime()) / 86_400_000));
  const canStall = j.status !== 'converted' && j.status !== 'first_touch';
  const state: JourneyState =
    j.status === 'converted'
      ? 'converted'
      : days > DECAY_DAYS
        ? 'decayed'
        : canStall && days > STALL_DAYS
          ? 'stalled'
          : 'active';
  return { daysSinceLastTouch: days, state };
}

/**
 * What Alex should act on today — the funnel answering a question instead
 * of glowing. Two queues, both capped so the rail reads at a glance:
 *   pushNow — hot leads (likelihood ≥ 70) still in active motion; freshest
 *             movement first, because momentum is when a push closes.
 *   saveNow — leads visibly fading toward the archive (past DECAY_FADE_START);
 *             highest likelihood first, because those are worth saving.
 */
export const ATTENTION_CAP = 4;
export const PUSH_LIKELIHOOD = 70;

export function attentionQueue(
  journeys: FunnelJourney[],
  now: Date,
): { pushNow: FunnelJourney[]; saveNow: FunnelJourney[] } {
  const metas = journeys.map((j) => ({ j, meta: journeyMeta(j, now) }));
  const pushNow = metas
    .filter(
      ({ j, meta }) =>
        meta.state === 'active' &&
        j.status !== 'converted' &&
        j.likelihood >= PUSH_LIKELIHOOD &&
        // a fading lead is a save, not a push — even where stalling can't apply
        decayFactor(meta.daysSinceLastTouch, j.status) === 0,
    )
    .sort((a, b) => a.meta.daysSinceLastTouch - b.meta.daysSinceLastTouch || b.j.likelihood - a.j.likelihood)
    .slice(0, ATTENTION_CAP)
    .map(({ j }) => j);
  const saveNow = metas
    .filter(
      ({ j, meta }) =>
        meta.state !== 'decayed' &&
        j.status !== 'converted' &&
        decayFactor(meta.daysSinceLastTouch, j.status) > 0,
    )
    .sort((a, b) => b.j.likelihood - a.j.likelihood || b.meta.daysSinceLastTouch - a.meta.daysSinceLastTouch)
    .slice(0, ATTENTION_CAP)
    .map(({ j }) => j);
  return { pushNow, saveNow };
}

/** The space renders actives; the archive tab lists what has decayed. */
export function splitFunnelJourneys(
  journeys: FunnelJourney[],
  now: Date,
): { active: FunnelJourney[]; archived: FunnelJourney[] } {
  const active: FunnelJourney[] = [];
  const archived: FunnelJourney[] = [];
  for (const j of journeys) (journeyMeta(j, now).state === 'decayed' ? archived : active).push(j);
  return { active, archived };
}

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
