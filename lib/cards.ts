/**
 * The three card lanes a statement upload can be filed under:
 *
 *   gold      — personal life
 *   platinum  — general business spend, cohort programmes included
 *   blue      — the second business entity
 *
 * Which physical cards those map to is a deployment detail and deliberately not
 * recorded here. Pure: no DB, no network. The lane is chosen at upload time and
 * stored on the ledger row, never guessed after the fact.
 */

export type CardId = 'gold' | 'platinum' | 'blue';

export type CardLane = {
  id: CardId;
  label: string;
  /** what belongs on it, shown under the lane picker */
  blurb: string;
};

export const CARD_LANES: CardLane[] = [
  { id: 'gold', label: 'Gold · Personal', blurb: 'Personal-life spend' },
  { id: 'platinum', label: 'Platinum · Business', blurb: 'Business general + cohort programmes' },
  { id: 'blue', label: 'Business Blue · Vantage', blurb: 'Second-entity (Vantage) spend' },
];

export const DEFAULT_CARD: CardId = 'platinum';

const IDS = new Set<string>(CARD_LANES.map((c) => c.id));

/** Lane ids the first pass wrote before the cards were named correctly. Rows
    already in the ledger under these keep their money instead of falling back
    to the default. */
const LEGACY_IDS: Record<string, CardId> = {
  business: 'platinum', // the nameless "his own business" lane is the Platinum
  vantage: 'blue', // Vantage rides the Business Blue
};

export function isCardId(value: unknown): value is CardId {
  return typeof value === 'string' && IDS.has(value);
}

/** Coerce anything (form field, query param, legacy row) into a lane. */
export function normalizeCardId(raw: unknown): CardId {
  if (typeof raw !== 'string') return DEFAULT_CARD;
  const t = raw.trim().toLowerCase();
  if (isCardId(t)) return t;
  return LEGACY_IDS[t] ?? DEFAULT_CARD;
}

export function cardLabel(id: CardId): string {
  return CARD_LANES.find((c) => c.id === id)?.label ?? id;
}

/** Best-effort lane from statement text or a filename — null when unsure, so
    the uploader's explicit pick always wins over a guess. */
export function detectCard(text: string): CardId | null {
  if (/vantage|business\s*blue|blue\s*business/i.test(text)) return 'blue';
  if (/platinum|cohort[\s_-]*programs?/i.test(text)) return 'platinum';
  if (/\bgold\b/i.test(text)) return 'gold';
  return null;
}
