/**
 * Radial funnel math — the outside → in view. The journey is a circle: leads
 * enter at the rim in one of seven acquisition segments (where they actually
 * came from) and travel inward ring by ring until the center — the purchase.
 *
 * Attribution is honest: keyword classification over the entry touch, with
 * `word_of_mouth` as the explicit catch-all for what nothing tracked. Trakyo
 * UTM links (ManyChat sends, YouTube titles) and the GHL `source` field feed
 * the same labels, so live attribution sharpens as those land — no schema
 * change needed.
 */
import { funnelSpaceModel, type FunnelSpaceNode } from '@/lib/funnel';
import type { FunnelJourney, FunnelTouch } from '@/lib/schemas';

/** Journeys and space nodes both qualify — classification reads touches only. */
type HasTouches = { touches: FunnelTouch[] };

export type FunnelAcquisition =
  | 'instagram'
  | 'youtube'
  | 'newsletter'
  | 'x_linkedin'
  | 'form'
  | 'word_of_mouth';

/** The rim segments, in render order around the circle. X and LinkedIn share
 * one wedge (Alex condensed them — both are his text-platform funnels). */
export const ACQUISITIONS: { id: FunnelAcquisition; label: string }[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'x_linkedin', label: 'X / LinkedIn' },
  { id: 'form', label: 'Forms' },
  { id: 'word_of_mouth', label: 'Word of mouth' },
];

const SEGMENT_INDEX: Record<FunnelAcquisition, number> = Object.fromEntries(
  ACQUISITIONS.map((a, i) => [a.id, i]),
) as Record<FunnelAcquisition, number>;

/**
 * Keyword families, first match wins. Order matters: youtube before form so
 * "long-form" stays YouTube; explicit word-of-mouth before the form fallback.
 * Instagram owns Meta paid + ManyChat + TikTok short-form (Alex runs ads
 * and DM automations through the IG/FB machine).
 */
const MATCHERS: { id: FunnelAcquisition; re: RegExp }[] = [
  { id: 'youtube', re: /youtube|\byt\b|long-form/i },
  { id: 'instagram', re: /instagram|\big\b|insta\b|reel|tiktok|meta ad|manychat|facebook|\bfb\b/i },
  { id: 'newsletter', re: /newsletter|beehiiv/i },
  { id: 'x_linkedin', re: /twitter|\bx thread|\bx post|\bx dm|\bon x\b|linkedin/i },
  { id: 'word_of_mouth', re: /referr|word of mouth|recommend/i },
  { id: 'form', re: /\bform\b|application|typeform|survey|landing page|opt.?in/i },
];

/**
 * Which rim segment a journey enters through — classified from its entry
 * touch (label + channel). Unattributed stays word_of_mouth: the honest
 * bucket for "we didn't track this", exactly Alex's framing of referrals.
 */
export function acquisitionFor(j: HasTouches): FunnelAcquisition {
  const entry = j.touches[0];
  if (!entry) return 'word_of_mouth';
  for (const m of MATCHERS) if (m.re.test(entry.label)) return m.id;
  if (entry.channel === 'ads') return 'instagram'; // paid traffic = the IG/FB machine
  return 'word_of_mouth';
}

/** "Where they came from" as words for the dossier card — the acquisition
 * segment plus the actual entry touch that put them in the funnel. */
export type FunnelOrigin = {
  segment: string;
  entry: string | null;
  channel: string | null;
  source: string | null;
  at: string | null;
};

export function originOf(j: HasTouches): FunnelOrigin {
  const seg = ACQUISITIONS[SEGMENT_INDEX[acquisitionFor(j)]];
  const entry = j.touches[0] ?? null;
  return {
    segment: seg.label,
    entry: entry?.label ?? null,
    channel: entry?.channel ?? null,
    source: entry?.source ?? null,
    at: entry?.at ?? null,
  };
}

/** A space node placed on the circle: rim segment + ring depth. */
export type FunnelRadialNode = FunnelSpaceNode & {
  /** 0–6 index into ACQUISITIONS — the wedge this lead entered through. */
  segment: number;
  /** Stage rings visited in order (aliases the space model's hub path). */
  rings: number[];
  /** Where they are now: 0 = outermost ring, 4 = the converted core. */
  currentRing: number;
};

export type FunnelRadialSegment = {
  id: FunnelAcquisition;
  label: string;
  count: number;
  converted: number;
};

export type FunnelRadialModel = {
  nodes: FunnelRadialNode[];
  segments: FunnelRadialSegment[];
};

/**
 * Model for the radial view: the same living nodes as the space (decay,
 * likelihood, contact channels all preserved), placed by acquisition wedge
 * and stage ring. All seven segments are always present so the rim reads as
 * a fixed compass even when a wedge is empty.
 */
export function funnelRadialModel(journeys: FunnelJourney[], now: Date): FunnelRadialModel {
  const segments: FunnelRadialSegment[] = ACQUISITIONS.map((a) => ({ ...a, count: 0, converted: 0 }));
  const acquisitionById = new Map(journeys.map((j) => [j.id, acquisitionFor(j)]));

  const nodes: FunnelRadialNode[] = funnelSpaceModel(journeys, now).map((n) => {
    const seg = SEGMENT_INDEX[acquisitionById.get(n.id) ?? 'word_of_mouth'];
    segments[seg].count++;
    if (n.state === 'converted') segments[seg].converted++;
    return { ...n, segment: seg, rings: n.hubs, currentRing: n.currentHub };
  });

  return { nodes, segments };
}
