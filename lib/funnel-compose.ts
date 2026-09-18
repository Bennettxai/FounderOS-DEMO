/**
 * The single source of truth for what lands in the funnel space. The page and
 * the /api/funnel route BOTH call this, so they can never drift again — that
 * drift is exactly what hid every Stripe buyer from the rendered page (the API
 * folded payments in, the page did not).
 *
 * Order matches the route: Attio ∪ GHL live journeys, Trakyo touches folded on,
 * then Stripe settled payments folded on as converted wins, filtered to one
 * venture. Seeded funnel only when nothing live answered. Dependencies are
 * injectable so the wiring is testable without the network.
 */
import { getDb } from '@/lib/data';
import { attioFunnelJourneys } from '@/lib/funnel-live';
import { ghlFunnelJourneys } from '@/lib/funnel-ghl';
import { mergeStripeWins, stripeFunnelWins, type StripeWin } from '@/lib/funnel-stripe';
import { mergeTrakyoTouches, trakyoTouches, type TrakyoEvent } from '@/lib/funnel-trakyo';
import type { FunnelJourney, FunnelVenture } from '@/lib/schemas';

export type AttioFunnelResult = { journeys: FunnelJourney[]; closedLost: number; total: number } | null;
export type GhlFunnelResult = { journeys: FunnelJourney[]; excluded: number; total: number } | null;

export type FunnelComposition = {
  /** Live-merged + venture-filtered journeys, or the seeded funnel. */
  journeys: FunnelJourney[];
  isLive: boolean;
  attioLive: AttioFunnelResult;
  ghlLive: GhlFunnelResult;
  stripeWins: StripeWin[] | null;
};

export type FunnelComposeDeps = {
  attio: (now: Date) => Promise<AttioFunnelResult>;
  ghl: (now: Date) => Promise<GhlFunnelResult>;
  stripe: (now: Date) => Promise<StripeWin[] | null>;
  trakyo: () => Promise<TrakyoEvent[]>;
  seed: (venture?: FunnelVenture) => FunnelJourney[];
};

const DEFAULT_DEPS: FunnelComposeDeps = {
  attio: attioFunnelJourneys,
  ghl: ghlFunnelJourneys,
  stripe: stripeFunnelWins,
  trakyo: trakyoTouches,
  seed: (venture) => getDb().funnel.journeys(venture),
};

export async function composeFunnelJourneys(
  now: Date,
  venture?: FunnelVenture,
  deps: FunnelComposeDeps = DEFAULT_DEPS,
): Promise<FunnelComposition> {
  const [attioLive, ghlLive, stripeWins] = await Promise.all([deps.attio(now), deps.ghl(now), deps.stripe(now)]);
  const liveJourneys = [...(attioLive?.journeys ?? []), ...(ghlLive?.journeys ?? [])];
  // Stripe money alone makes the funnel live — buyers must never be gated
  // behind whether a CRM source happened to answer.
  const isLive = liveJourneys.length > 0 || (stripeWins?.length ?? 0) > 0;
  const journeys = isLive
    ? mergeStripeWins(mergeTrakyoTouches(liveJourneys, await deps.trakyo()), stripeWins ?? []).filter(
        (j) => !venture || j.venture === venture,
      )
    : deps.seed(venture);
  return { journeys, isLive, attioLive, ghlLive, stripeWins };
}

/** Source label ("attio+ghl+stripe" / "seed") from a composition — shared so
 *  the page's badge and the route's `source` field read identically. */
export function funnelSourceLabel(c: FunnelComposition): string {
  if (!c.isLive) return 'seed';
  return (
    [
      c.attioLive?.journeys.length ? 'attio' : null,
      c.ghlLive?.journeys.length ? 'ghl' : null,
      c.stripeWins?.length ? 'stripe' : null,
    ]
      .filter(Boolean)
      .join('+') || 'stripe'
  );
}
