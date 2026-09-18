import { describe, expect, it } from 'vitest';
import { CARD_LANES, DEFAULT_CARD, cardLabel, detectCard, isCardId, normalizeCardId } from '@/lib/cards';

describe('card lanes', () => {
  it('has exactly the three cards the operator spends on', () => {
    expect(CARD_LANES.map((c) => c.id)).toEqual(['gold', 'platinum', 'blue']);
  });

  it('isCardId only accepts the three ids', () => {
    expect(isCardId('gold')).toBe(true);
    expect(isCardId('blue')).toBe(true);
    expect(isCardId('amex')).toBe(false);
    expect(isCardId(undefined)).toBe(false);
  });

  it('normalizeCardId falls back to the default rather than throwing', () => {
    expect(normalizeCardId('blue')).toBe('blue');
    expect(normalizeCardId('  GOLD ')).toBe('gold');
    expect(normalizeCardId('nonsense')).toBe(DEFAULT_CARD);
    expect(normalizeCardId(null)).toBe(DEFAULT_CARD);
  });

  it('carries the first pass’s lane names forward instead of dropping the rows', () => {
    // The 2026-08-26 morning pass guessed the cards wrong: Platinum was filed
    // as personal and there was a nameless "business" lane. Rows already in the
    // ledger under those ids land where the real card belongs.
    expect(normalizeCardId('business')).toBe('platinum');
    expect(normalizeCardId('vantage')).toBe('blue');
  });

  it('cardLabel gives a display name for every lane', () => {
    for (const lane of CARD_LANES) expect(cardLabel(lane.id)).toBe(lane.label);
  });

  it('detectCard reads the card out of statement text or a filename, else null', () => {
    expect(detectCard('Business Blue Business Card  Prepared for CASEY EXAMPLE')).toBe('blue');
    expect(detectCard('VANTAGE LLC  Prepared for CASEY EXAMPLE')).toBe('blue');
    expect(detectCard('American Express® Gold Card')).toBe('gold');
    expect(detectCard('The Platinum Card® Prepared for CASEY EXAMPLE')).toBe('platinum');
    expect(detectCard('cohort-program-july-2026.pdf')).toBe('platinum');
    expect(detectCard('Statement of account')).toBeNull();
  });
});
