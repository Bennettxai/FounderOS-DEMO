import { describe, expect, test } from 'vitest';
import { FAILOVER_CHAIN, planFailover, type FailoverAgent } from '@/lib/agent-failover';

/**
 * Why this exists: on 2026-08-21, between 05:36 and 07:01, five seats on the
 * live board (Conductor, Forge, Finances, Communications, Summarizer) changed
 * model 19 times each, once every five minutes, alternating
 * sonnet-5 -> haiku-4-5 -> sonnet-5 forever. Read straight off the board's own
 * config revisions.
 *
 * The cause is a two-cycle in the ladder itself:
 *
 *   'claude-sonnet-5':  ['claude-haiku-4-5'],
 *   'claude-haiku-4-5': ['claude-sonnet-5'],
 *
 * planFailover only moves a seat to a candidate that is not currently
 * exhausted, so a single stable exhausted set is fine. But the set is derived
 * from recent run errors, and once the seats are split across both models the
 * two models take turns erroring. Each tick condemns whichever model just
 * failed and moves everything onto the other one, which then fails. The file's
 * own header warns that "guessing that wrong means flapping the CEO seat
 * between two models" — the ladder did exactly that on its own.
 *
 * The fix is that the bottom of the ladder is the bottom: haiku-4-5 has
 * nowhere to fall. A seat that runs dry there gets a note, not a promotion.
 */
const agent = (over: Partial<FailoverAgent> = {}): FailoverAgent => ({
  id: 'a-conductor',
  name: 'Conductor',
  model: 'claude-haiku-4-5',
  status: 'idle',
  ...over,
});

describe('the failover ladder terminates', () => {
  test('no model can reach itself by following the chain', () => {
    // A cycle anywhere means some exhaustion pattern flaps forever.
    const cycles: string[] = [];
    for (const start of Object.keys(FAILOVER_CHAIN)) {
      const seen = new Set<string>();
      const walk = (node: string, path: string[]) => {
        for (const next of FAILOVER_CHAIN[node] ?? []) {
          if (next === start) cycles.push([...path, next].join(' -> '));
          if (seen.has(next)) continue;
          seen.add(next);
          walk(next, [...path, next]);
        }
      };
      walk(start, [start]);
    }
    expect(cycles).toEqual([]);
  });

  test('haiku-4-5 is the floor and never falls upward', () => {
    expect(FAILOVER_CHAIN['claude-haiku-4-5']).toEqual([]);
  });

  test('every fallback is a model the ladder knows about', () => {
    for (const [from, tos] of Object.entries(FAILOVER_CHAIN)) {
      for (const to of tos) {
        expect(FAILOVER_CHAIN, `${from} -> ${to}`).toHaveProperty(to);
      }
    }
  });
});

describe('the 2026-08-21 flap cannot recur', () => {
  test('a seat on the floor that runs dry earns a note, never a promotion', () => {
    const plan = planFailover({
      agents: [agent()],
      runs: [
        {
          agentId: 'a-conductor',
          status: 'error',
          model: 'claude-haiku-4-5',
          error: "You're out of usage credits. Switch to another model.",
          finishedAt: '2026-08-21T06:00:00.000Z',
        },
      ],
    });
    expect(plan.actions).toEqual([]);
    expect(plan.notes.join(' ')).toContain('no healthy fallback');
  });

  test('two ticks with the blame alternating produce no ping-pong', () => {
    // Tick A blames sonnet, tick B blames haiku. Under the old ladder this
    // moved the same seat back and forth; now neither tick can move it up.
    const runAt = (model: string, finishedAt: string) => ({
      agentId: 'a-conductor',
      status: 'error',
      model,
      error: "You're out of usage credits. Switch to another model.",
      finishedAt,
    });
    const a = planFailover({
      agents: [agent()],
      runs: [runAt('claude-sonnet-5', '2026-08-21T06:00:00.000Z')],
    });
    const b = planFailover({
      agents: [agent()],
      runs: [runAt('claude-haiku-4-5', '2026-08-21T06:05:00.000Z')],
    });
    expect(a.actions.map((x) => x.to)).toEqual([]);
    expect(b.actions.map((x) => x.to)).toEqual([]);
  });

  test('a real downgrade still works: opus 5 dry drops to sonnet 5', () => {
    const plan = planFailover({
      agents: [agent({ model: 'claude-opus-5' })],
      runs: [
        {
          agentId: 'a-conductor',
          status: 'error',
          model: 'claude-opus-5',
          error: "You're out of usage credits. Switch to another model.",
          finishedAt: '2026-08-21T06:00:00.000Z',
        },
      ],
    });
    expect(plan.actions.map((x) => x.to)).toEqual(['claude-sonnet-5']);
  });
});
