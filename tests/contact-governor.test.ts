import { describe, expect, test } from 'vitest';
import {
  businessDaysBetween,
  contactDecision,
  MAX_BUMPS,
  REVIVAL_MIN_DAYS,
  REVIVAL_COOLDOWN_DAYS,
  type ThreadState,
} from '@/lib/agents/contact-governor';

/**
 * The contact governor, ported from the deal-state model in the partner agency's brand deal
 * autopilot (skill Section 9b) that the operator handed over on 2026-08-19.
 *
 * It lives in code rather than in the prompt on purpose. "Never bump a ghosted
 * thread a sixth time" is a hard limit protecting the operator's sender reputation
 * and his relationships, and a prompt is a suggestion a model can talk itself
 * out of at 2am. The skill file governs what a bump SAYS. This governs whether
 * one is allowed to exist at all.
 */
const thread = (over: Partial<ThreadState> = {}): ThreadState => ({
  state: 'stalled',
  daysSinceLastMessage: 5,
  bumpsUsed: 0,
  daysSinceLastRevival: null,
  humanHandled: false,
  ...over,
});

const TODAY = '2026-08-19'; // a Wednesday

describe('businessDaysBetween', () => {
  test('counts weekdays only', () => {
    // Fri 2026-08-14 to Mon 2026-08-17 is one business day, not three
    expect(businessDaysBetween('2026-08-14', '2026-08-17')).toBe(1);
  });

  test('a full week is five', () => {
    expect(businessDaysBetween('2026-08-12', '2026-08-19')).toBe(5);
  });

  test('same day is zero, and it never goes negative', () => {
    expect(businessDaysBetween(TODAY, TODAY)).toBe(0);
    expect(businessDaysBetween('2026-08-25', TODAY)).toBe(0);
  });
});

describe('contactDecision', () => {
  test('their reply is the latest, so we answer today', () => {
    const d = contactDecision(thread({ state: 'live-ball-ours' }), TODAY);
    expect(d.allowed).toBe(true);
    expect(d.action).toBe('reply-now');
  });

  test('our message is the latest and still fresh, so we wait', () => {
    const d = contactDecision(thread({ state: 'live-ball-theirs' }), TODAY);
    expect(d.allowed).toBe(false);
    expect(d.action).toBe('wait');
  });

  test('a stalled thread earns a bump', () => {
    const d = contactDecision(thread({ state: 'stalled', bumpsUsed: 2 }), TODAY);
    expect(d.allowed).toBe(true);
    expect(d.action).toBe('bump');
  });

  test('bumping stops dead at the limit', () => {
    const d = contactDecision(thread({ state: 'stalled', bumpsUsed: MAX_BUMPS }), TODAY);
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/bump/i);
  });

  test('a bump sent two days ago is too soon for another', () => {
    const d = contactDecision(thread({ state: 'stalled', daysSinceLastMessage: 2 }), TODAY);
    expect(d.allowed).toBe(false);
    expect(d.action).toBe('wait');
  });

  test('a ghosted thread is silent until it has aged into a revival', () => {
    const young = contactDecision(thread({ state: 'ghosted', daysSinceLastMessage: 10 }), TODAY);
    expect(young.allowed).toBe(false);

    const aged = contactDecision(
      thread({ state: 'ghosted', daysSinceLastMessage: REVIVAL_MIN_DAYS, bumpsUsed: MAX_BUMPS }),
      TODAY,
    );
    expect(aged.allowed).toBe(true);
    expect(aged.action).toBe('revival');
    expect(aged.reason).toMatch(/fresh angle/i);
  });

  test('one revival per brand per six months, and no second', () => {
    const d = contactDecision(
      thread({ state: 'ghosted', daysSinceLastMessage: 60, daysSinceLastRevival: 30 }),
      TODAY,
    );
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/revived/i);

    const afterCooldown = contactDecision(
      thread({ state: 'ghosted', daysSinceLastMessage: 60, daysSinceLastRevival: REVIVAL_COOLDOWN_DAYS }),
      TODAY,
    );
    expect(afterCooldown.allowed).toBe(true);
  });

  test('lost and dead are never contacted, no matter how old', () => {
    for (const state of ['lost', 'dead'] as const) {
      const d = contactDecision(thread({ state, daysSinceLastMessage: 999 }), TODAY);
      expect(d.allowed, state).toBe(false);
      expect(d.action).toBe('none');
    }
  });

  test('a won deal leaves the negotiation pipeline', () => {
    const d = contactDecision(thread({ state: 'closed-won' }), TODAY);
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/execution|renewal/i);
  });

  test('an unclassified thread gets no automated contact at all', () => {
    const d = contactDecision(thread({ state: 'needs-classification' }), TODAY);
    expect(d.allowed).toBe(false);
  });

  test('receipts and newsletters never enter the pipeline', () => {
    expect(contactDecision(thread({ state: 'not-a-deal' }), TODAY).allowed).toBe(false);
  });

  /**
   * the partner agency's hands-off rule: if the operator answered a thread himself, the agent
   * stays out of it entirely. This overrides every other state, including the
   * one that would otherwise demand a same-day reply.
   */
  test('a thread the operator is handling himself is untouchable, even when it is our ball', () => {
    const d = contactDecision(thread({ state: 'live-ball-ours', humanHandled: true }), TODAY);
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/handling this thread|human/i);
  });

  test('every decision explains itself, so a refusal is never silent', () => {
    for (const state of ['live-ball-ours', 'stalled', 'ghosted', 'lost', 'dead', 'closed-won'] as const) {
      expect(contactDecision(thread({ state }), TODAY).reason.length).toBeGreaterThan(10);
    }
  });
});
