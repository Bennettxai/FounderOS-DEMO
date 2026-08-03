/**
 * Lead decay + attention triage — the staleness math, on its own.
 *
 * Lifted out of lib/funnel.ts unchanged. That file keeps the funnel's view
 * models (`funnelSpaceModel`, `funnelSummary`, stage tables) and re-exports
 * everything here, so every existing `@/lib/funnel` import keeps working.
 *
 * The reason to separate it: this is the part with no Zod, no schema, no
 * database and no React in it — pure functions over plain objects. Pulling it
 * out makes it directly testable, reusable against a live CRM shape rather
 * than only the seeded one, and cheap to reason about.
 *
 * Three things loosened on the way out, each noted at its definition:
 * thresholds are configurable, stage names are open, and an unparseable date
 * throws instead of silently reading as healthy.
 */

/* ------------------------------------------------------------------ input -- */

/**
 * The only two stage names the math treats specially. Everything between them
 * is yours to name — `'engaged'`, `'demo_booked'`, `'contract_out'`, whatever
 * your pipeline calls it — and behaves identically.
 */
export type LeadStage = 'first_touch' | 'converted' | (string & {});

/** A dated interaction. Only `at` is read; carry whatever else you like. */
export type DecayTouch = {
  /** `YYYY-MM-DD` or a full ISO 8601 timestamp. */
  at: string;
};

/**
 * Minimum shape the functions read. Structural, so your own row type satisfies
 * it without conversion, and the generics below hand your type back out.
 */
export type DecayInput = {
  status: LeadStage;
  /** 0–100 confidence this closes. Only used for ordering the queues. */
  likelihood: number;
  /** Fallback when `touches` is empty — a lead nobody has touched yet is still
   *  aging from the moment it arrived. */
  createdAt: string;
  /** Chronological. The last entry is the one that resets the quiet clock. */
  touches: DecayTouch[];
};

/* ----------------------------------------------------------------- config -- */

export type DecayConfig = {
  /** Quiet longer than this, before converting, and the lead reads stalled. */
  stallDays: number;
  /** Quiet is neutral until here, then the fade toward dead begins. */
  fadeStartDays: number;
  /** Quiet past this and the lead leaves the live view for the archive. */
  decayDays: number;
  /** `likelihood` at or above this counts as hot enough to push. */
  pushLikelihood: number;
  /** Max entries per queue, so the rail stays glanceable. */
  attentionCap: number;
};

/**
 * The thresholds this module shipped with, unchanged.
 *
 * `fadeStartDays: 21` is tuned to a particular book — leads clustering at
 * 21–30 days quiet, so 21 puts the gradient where it is visible. That is the
 * number to re-derive when the sales cycle differs: histogram quiet-days
 * across closed-won deals and put the fade start at the left edge of the
 * cluster. Nothing errors if it is wrong; the colors just quietly stop
 * meaning anything, which is worse.
 */
export const DEFAULT_DECAY_CONFIG: DecayConfig = {
  stallDays: 7,
  fadeStartDays: 21,
  decayDays: 90,
  pushLikelihood: 70,
  attentionCap: 4,
};

/** Kept as named exports so call sites can read thresholds without the object. */
export const STALL_DAYS = DEFAULT_DECAY_CONFIG.stallDays;
export const DECAY_FADE_START = DEFAULT_DECAY_CONFIG.fadeStartDays;
export const DECAY_DAYS = DEFAULT_DECAY_CONFIG.decayDays;
export const PUSH_LIKELIHOOD = DEFAULT_DECAY_CONFIG.pushLikelihood;
export const ATTENTION_CAP = DEFAULT_DECAY_CONFIG.attentionCap;

/* ------------------------------------------------------------------- math -- */

const MS_PER_DAY = 86_400_000;

/**
 * Days between a date string and `now`, floored, never negative.
 *
 * A bare `YYYY-MM-DD` is anchored at UTC midnight so the count does not shift
 * with the reader's timezone; a full timestamp is used as given.
 *
 * The original assumed bare dates unconditionally, which was safe there because
 * a Zod regex enforced the format upstream. With the schema gone, an ISO
 * timestamp would have produced `Invalid Date` → `NaN` days → a lead that reads
 * perfectly healthy forever. That is the worst possible way for this function
 * to fail, so it throws instead.
 */
function daysSince(dateish: string, now: Date): number {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(dateish) ? `${dateish}T00:00:00Z` : dateish;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    throw new TypeError(
      `funnel-decay: unparseable date ${JSON.stringify(dateish)} (want YYYY-MM-DD or ISO 8601)`,
    );
  }
  return Math.max(0, Math.floor((now.getTime() - then) / MS_PER_DAY));
}

/**
 * How dead a lead looks, 0 → 1. Flat at 0 through `fadeStartDays`, then linear
 * to 1 at `decayDays`. Feed it straight to a color interpolation: the node
 * visibly dies before it archives, so the archive is never a surprise.
 *
 * A won deal never decays — the win stays green however long it sits.
 */
export function decayFactor(
  daysSinceLastTouch: number,
  status: LeadStage,
  config: DecayConfig = DEFAULT_DECAY_CONFIG,
): number {
  if (status === 'converted') return 0;
  const { fadeStartDays, decayDays } = config;
  const span = decayDays - fadeStartDays;
  // Degenerate config (fade starts at or after the archive point): no gradient
  // to draw, so the value is a step at the archive threshold rather than NaN.
  if (span <= 0) return daysSinceLastTouch >= decayDays ? 1 : 0;
  return Math.min(1, Math.max(0, (daysSinceLastTouch - fadeStartDays) / span));
}

export type JourneyState = 'converted' | 'stalled' | 'active' | 'decayed';

/**
 * The discrete read on one lead: how long it has been quiet, and which of four
 * states it renders as.
 *
 * `first_touch` is deliberately exempt from stalling. An inbound lead nobody
 * has worked yet is not a failure of follow-up, and flagging it red would
 * train the operator to ignore red. It still decays and still archives — it
 * just does not accuse anyone on the way there.
 *
 * Advancing a stage adds a touch, which resets the clock. Movement is what
 * keeps a lead vivid; that is the whole mechanic.
 */
export function journeyMeta(
  lead: DecayInput,
  now: Date,
  config: DecayConfig = DEFAULT_DECAY_CONFIG,
): { daysSinceLastTouch: number; state: JourneyState } {
  const lastAt = lead.touches[lead.touches.length - 1]?.at ?? lead.createdAt;
  const days = daysSince(lastAt, now);
  const canStall = lead.status !== 'converted' && lead.status !== 'first_touch';
  const state: JourneyState =
    lead.status === 'converted'
      ? 'converted'
      : days > config.decayDays
        ? 'decayed'
        : canStall && days > config.stallDays
          ? 'stalled'
          : 'active';
  return { daysSinceLastTouch: days, state };
}

/* ----------------------------------------------------------------- triage -- */

/**
 * The two questions worth answering, derived from the same decay number:
 *
 *   pushNow — hot and still in motion. Ordered freshest-movement first,
 *             because momentum is when a push closes, not likelihood.
 *   saveNow — visibly fading but not yet archived. Ordered by likelihood,
 *             because a rescue costs real effort and should buy the most.
 *
 * The two orderings differ on purpose, and the exclusive split is the
 * load-bearing part: a fading lead is a save, never a push, even when it is
 * the hottest thing on the board. Pushing someone who has gone quiet for a
 * month is the wrong move dressed up as an urgent one.
 *
 * Generic in `T`, so your own row type comes back out — not a stripped copy.
 */
export function attentionQueue<T extends DecayInput>(
  leads: T[],
  now: Date,
  config: DecayConfig = DEFAULT_DECAY_CONFIG,
): { pushNow: T[]; saveNow: T[] } {
  const metas = leads.map((lead) => ({ lead, meta: journeyMeta(lead, now, config) }));

  const pushNow = metas
    .filter(
      ({ lead, meta }) =>
        meta.state === 'active' &&
        lead.status !== 'converted' &&
        lead.likelihood >= config.pushLikelihood &&
        // fading disqualifies a push even where stalling cannot apply
        decayFactor(meta.daysSinceLastTouch, lead.status, config) === 0,
    )
    .sort(
      (a, b) =>
        a.meta.daysSinceLastTouch - b.meta.daysSinceLastTouch ||
        b.lead.likelihood - a.lead.likelihood,
    )
    .slice(0, config.attentionCap)
    .map(({ lead }) => lead);

  const saveNow = metas
    .filter(
      ({ lead, meta }) =>
        meta.state !== 'decayed' &&
        lead.status !== 'converted' &&
        decayFactor(meta.daysSinceLastTouch, lead.status, config) > 0,
    )
    .sort(
      (a, b) =>
        b.lead.likelihood - a.lead.likelihood ||
        b.meta.daysSinceLastTouch - a.meta.daysSinceLastTouch,
    )
    .slice(0, config.attentionCap)
    .map(({ lead }) => lead);

  return { pushNow, saveNow };
}

/** Live board vs. archive. Order within each side is preserved. */
export function splitFunnelJourneys<T extends DecayInput>(
  leads: T[],
  now: Date,
  config: DecayConfig = DEFAULT_DECAY_CONFIG,
): { active: T[]; archived: T[] } {
  const active: T[] = [];
  const archived: T[] = [];
  for (const lead of leads) {
    (journeyMeta(lead, now, config).state === 'decayed' ? archived : active).push(lead);
  }
  return { active, archived };
}

/* ------------------------------------------------------------------- view -- */

/**
 * Everything a renderer needs for one lead, in one pass — convenience so the
 * view layer never calls `journeyMeta` and `decayFactor` separately and lets
 * them drift apart.
 */
export function decayView<T extends DecayInput>(
  lead: T,
  now: Date,
  config: DecayConfig = DEFAULT_DECAY_CONFIG,
): { lead: T; state: JourneyState; daysSinceLastTouch: number; decay: number } {
  const meta = journeyMeta(lead, now, config);
  return {
    lead,
    state: meta.state,
    daysSinceLastTouch: meta.daysSinceLastTouch,
    decay: decayFactor(meta.daysSinceLastTouch, lead.status, config),
  };
}
