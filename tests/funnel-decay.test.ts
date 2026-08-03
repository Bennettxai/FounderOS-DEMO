import { describe, expect, test } from 'vitest';
import {
  DEFAULT_DECAY_CONFIG,
  LEGACY_DECAY_CONFIG,
  attentionQueue,
  decayFactor,
  journeyMeta,
  type DecayConfig,
  type DecayInput,
} from '@/lib/funnel-decay';

/**
 * The band between the queues.
 *
 * tests/funnel.test.ts already covers the decay math itself. What it never
 * exercised is the stretch where a lead is late but not yet fading — its
 * attentionQueue fixtures use quiet-days of 3, 22, 25, 30, 35, 40 and 120,
 * so nothing lands between STALL_DAYS and DECAY_FADE_START. That is exactly
 * where leads used to fall out of both rails.
 */

const NOW = new Date('2026-07-11T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10);

const lead = (status: string, quietDays: number, likelihood = 90): DecayInput & { id: string } => ({
  id: `${status}-${quietDays}d`,
  status,
  likelihood,
  createdAt: daysAgo(quietDays + 10),
  touches: [{ at: daysAgo(quietDays) }],
});

/**
 * Pinned to LEGACY_DECAY_CONFIG on purpose: that is the shape where
 * fadeStartDays runs ahead of stallDays, so it is the shape that has a band
 * at all. The current defaults align the two and leave none — but any
 * pipeline is free to split them again, and the filter has to hold when it
 * does.
 */
describe('leads that are late but not yet fading', () => {
  const CFG = LEGACY_DECAY_CONFIG;

  test('a lead quiet 15 days is stalled, not fading, and still surfaces as a save', () => {
    const l = lead('engaged', 15);
    // stalled on the board (quiet > stallDays) …
    expect(journeyMeta(l, NOW, CFG).state).toBe('stalled');
    // … but the gradient has not started (quiet < fadeStartDays)
    expect(decayFactor(15, 'engaged', CFG)).toBe(0);
    // it belongs to a rail regardless
    expect(attentionQueue([l], NOW, CFG).saveNow.map((x) => x.id)).toEqual(['engaged-15d']);
  });

  test('the whole 8-21 day band is rescuable, not silent', () => {
    for (let days = 8; days <= 21; days++) {
      const q = attentionQueue([lead('engaged', days)], NOW, CFG);
      expect(q.saveNow.length, `${days}d quiet should be a save`).toBe(1);
      expect(q.pushNow.length, `${days}d quiet is not a push`).toBe(0);
    }
  });

  test('a hot lead does not get pushed just because it is not fading yet', () => {
    // 10 days quiet at 95% — momentum is gone even though the colour has not moved
    expect(attentionQueue([lead('engaged', 10, 95)], NOW, CFG).pushNow).toEqual([]);
  });
});

describe('defaults — the fade starts when lateness starts', () => {
  test('fadeStartDays is aligned with stallDays', () => {
    expect(DEFAULT_DECAY_CONFIG.fadeStartDays).toBe(DEFAULT_DECAY_CONFIG.stallDays);
  });

  test('day 7 is the last pushable day, day 8 the first rescuable one', () => {
    expect(attentionQueue([lead('engaged', 7)], NOW).pushNow.map((l) => l.id)).toEqual(['engaged-7d']);
    expect(attentionQueue([lead('engaged', 7)], NOW).saveNow).toEqual([]);
    expect(attentionQueue([lead('engaged', 8)], NOW).pushNow).toEqual([]);
    expect(attentionQueue([lead('engaged', 8)], NOW).saveNow.map((l) => l.id)).toEqual(['engaged-8d']);
  });

  test('the gradient covers the whole late period instead of the last ten weeks of it', () => {
    // previously flat at zero right through here
    expect(decayFactor(15, 'engaged', LEGACY_DECAY_CONFIG)).toBe(0);
    expect(decayFactor(15, 'engaged')).toBeGreaterThan(0);
    expect(decayFactor(48.5, 'engaged')).toBeCloseTo(0.5, 5);
    expect(decayFactor(90, 'engaged')).toBe(1);
  });

  test('archival policy is unchanged', () => {
    expect(DEFAULT_DECAY_CONFIG.decayDays).toBe(LEGACY_DECAY_CONFIG.decayDays);
    expect(DEFAULT_DECAY_CONFIG.stallDays).toBe(LEGACY_DECAY_CONFIG.stallDays);
  });
});

describe('the queues partition the live pipeline', () => {
  const configs: [string, DecayConfig][] = [
    ['default', DEFAULT_DECAY_CONFIG],
    ['legacy', LEGACY_DECAY_CONFIG],
    ['tight', { stallDays: 2, fadeStartDays: 3, decayDays: 14, pushLikelihood: 70, attentionCap: 4 }],
    ['wide', { stallDays: 30, fadeStartDays: 45, decayDays: 180, pushLikelihood: 70, attentionCap: 4 }],
  ];

  test('no lead lands in both rails, and every stalled lead lands in one', () => {
    for (const [name, config] of configs) {
      for (const status of ['engaged', 'first_touch']) {
        for (let days = 0; days <= 200; days++) {
          const l = lead(status, days);
          const { state } = journeyMeta(l, NOW, config);
          // one lead in, so attentionCap can never truncate the answer
          const { pushNow, saveNow } = attentionQueue([l], NOW, config);
          const where = `${name}/${status}/${days}d`;

          expect(pushNow.length + saveNow.length, `both rails: ${where}`).toBeLessThanOrEqual(1);

          if (state === 'decayed') {
            expect(pushNow.length + saveNow.length, `archived should be silent: ${where}`).toBe(0);
          } else if (state === 'stalled') {
            expect(saveNow.length, `stalled must be rescuable: ${where}`).toBe(1);
          }
        }
      }
    }
  });

  test('converted leads stay out of both rails however long they sit', () => {
    for (const days of [0, 30, 200]) {
      const q = attentionQueue([lead('converted', days)], NOW);
      expect(q.pushNow).toEqual([]);
      expect(q.saveNow).toEqual([]);
    }
  });

  test('archived leads stay out of both rails', () => {
    const q = attentionQueue([lead('engaged', 120)], NOW);
    expect(journeyMeta(lead('engaged', 120), NOW).state).toBe('decayed');
    expect(q.pushNow).toEqual([]);
    expect(q.saveNow).toEqual([]);
  });
});
