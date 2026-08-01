/**
 * Trakyo seam — organic content attribution for the funnel (mainly Agency
 * Accelerant: which post/reel actually produced a lead). Trakyo has no public
 * API yet, so `trakyoTouches()` honestly returns nothing until TRAKYO_API_KEY
 * plus a published endpoint exist; the merge logic below is real and tested,
 * so wiring the live pull is a one-function change on the day Trakyo ships.
 */
import { resolveCred, CRED_FILES } from '@/lib/creds';
import type { FunnelJourney } from '@/lib/schemas';

/** One attributed content event as Trakyo will report it. */
export type TrakyoEvent = {
  lead: string; // lead name as Trakyo captured it
  label: string; // the content piece, e.g. 'IG reel: "3 AI offers…"'
  channel: 'organic' | 'ads';
  at: string; // YYYY-MM-DD
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Swap a journey's synthetic first touch for the real Trakyo-attributed
 * content touch (matched by normalized lead name). Everything else — stage
 * history, stall math, the node's transit — is untouched.
 */
export function mergeTrakyoTouches(journeys: FunnelJourney[], events: TrakyoEvent[]): FunnelJourney[] {
  if (events.length === 0) return journeys;
  const byLead = new Map(events.map((e) => [norm(e.lead), e]));
  return journeys.map((j) => {
    const event = byLead.get(norm(j.name));
    if (!event || j.touches.length === 0) return j;
    const [first, ...rest] = j.touches;
    return {
      ...j,
      touches: [
        { ...first, channel: event.channel, label: event.label, source: 'trakyo', at: event.at },
        ...rest,
      ],
    };
  });
}

/**
 * The live pull. Status-only today (same honesty as lib/connectors/trakyo.ts):
 * a key alone isn't an API, so this stays empty until Trakyo publishes one —
 * then the fetch lands here and every funnel first-touch lights up organic.
 */
export async function trakyoTouches(): Promise<TrakyoEvent[]> {
  const key = resolveCred('TRAKYO_API_KEY', [CRED_FILES.agentsEnv, CRED_FILES.socialMedia]);
  if (!key) return [];
  return []; // endpoint TBD — Trakyo has no public API yet
}
