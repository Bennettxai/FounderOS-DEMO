import { describe, expect, test } from 'vitest';
import {
  FAILOVER_CHAIN,
  QUOTA_WINDOW_MS,
  classifyFailure,
  isAlertPosted,
  isCreditExhaustion,
  planFailover,
  renderFailoverAlert,
  type FailoverAgent,
  type FailoverRun,
} from '@/lib/agent-failover';

/**
 * Why this exists: on 2026-08-18 the Conductor (CEO of the Paperclip board)
 * sat in `error` for hours because Fable 5 ran out of usage credits. Two
 * separate things were wrong.
 *
 * 1. Paperclip's own quota classifier (CLAUDE_PROVIDER_QUOTA_RE in the
 *    claude-local adapter) matches "usage limit reached" / "extra usage" but
 *    NOT the wording the CLI actually emits for credit exhaustion, so the run
 *    was filed as a generic hard failure: no retry, no quota wait.
 * 2. Even when Paperclip DOES recognise a quota error it waits for the window
 *    to reset. It never switches model. So a single exhausted model takes the
 *    whole company down until the reset.
 *
 * the operator's requirement is the opposite: when Fable is out, drop to Opus 5 and
 * keep running. This module owns that policy. It is pure so the ladder can be
 * reasoned about without touching the live board.
 */

const agent = (over: Partial<FailoverAgent> = {}): FailoverAgent => ({
  id: 'a-conductor',
  name: 'Conductor',
  model: 'claude-fable-5',
  status: 'error',
  ...over,
});

const run = (over: Partial<FailoverRun> = {}): FailoverRun => ({
  agentId: 'a-conductor',
  status: 'failed',
  // the exact string the board recorded for the 17:58 run
  error: "Internal error: You're out of usage credits. Run /usage-credits to keep using Fable 5 or /model to switch models.",
  model: 'claude-fable-5',
  finishedAt: '2026-08-18T17:58:31.645Z',
  ...over,
});

describe('isCreditExhaustion', () => {
  test('matches the ACP wording the live board recorded', () => {
    expect(
      isCreditExhaustion(
        "Internal error: You're out of usage credits. Run /usage-credits to keep using Fable 5 or /model to switch models.",
      ),
    ).toBe(true);
  });

  test('matches the CLI wording, which is different', () => {
    expect(
      isCreditExhaustion(
        "You're out of usage credits. Switch to another model, or manage usage credits at claude.ai/settings/usage?from=cc_cli_limit_message, to continue.",
      ),
    ).toBe(true);
  });

  test('matches the subscription window limits too', () => {
    expect(isCreditExhaustion('Claude usage limit reached — weekly limit reached. Try again in 2 days.')).toBe(true);
    expect(isCreditExhaustion('5-hour limit reached.')).toBe(true);
    expect(isCreditExhaustion("You've hit your session limit")).toBe(true);
    expect(isCreditExhaustion('out of extra usage')).toBe(true);
  });

  /** A demotion is a real config change on a production board. It must not
   *  fire on failures that switching model would not fix. */
  test('does not match unrelated failures', () => {
    expect(isCreditExhaustion('Please log in. Run `claude login` first.')).toBe(false);
    expect(isCreditExhaustion('Maximum turns reached.')).toBe(false);
    expect(isCreditExhaustion('No conversation found with session id abc-123')).toBe(false);
    expect(isCreditExhaustion('HTTP 429: Too Many Requests')).toBe(false);
    expect(isCreditExhaustion('spawn claude ENOENT')).toBe(false);
    expect(isCreditExhaustion(null)).toBe(false);
    expect(isCreditExhaustion('')).toBe(false);
  });

  /** The word "credits" appears in healthy copy too (billing links, docs). */
  test('does not match a mere mention of usage credits', () => {
    expect(isCreditExhaustion('Manage usage credits at claude.ai/settings/usage')).toBe(false);
  });
});

describe('FAILOVER_CHAIN', () => {
  test('every model the operator runs on the board has somewhere to fall', () => {
    for (const m of ['claude-fable-5', 'claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-6']) {
      expect(FAILOVER_CHAIN[m]?.length, `${m} needs a fallback`).toBeGreaterThan(0);
    }
  });

  test('Fable drops to Opus 5 first, exactly as the operator asked', () => {
    expect(FAILOVER_CHAIN['claude-fable-5'][0]).toBe('claude-opus-5');
  });

  test('no chain loops back onto itself', () => {
    for (const [from, to] of Object.entries(FAILOVER_CHAIN)) expect(to).not.toContain(from);
  });
});

describe('planFailover', () => {
  test('demotes the agent whose latest run died on credit exhaustion', () => {
    const plan = planFailover({ agents: [agent()], runs: [run()] });
    expect(plan.exhausted).toEqual(['claude-fable-5']);
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({
      agentId: 'a-conductor',
      from: 'claude-fable-5',
      to: 'claude-opus-5',
    });
  });

  /**
   * The credits are account-wide, not per seat. When Fable is out for the
   * Conductor it is out for Forge and Finances too, and they are the seats that
   * deploy and reconcile money. Waiting for each of them to fail in turn is
   * three more outages, so they move on the first piece of evidence.
   */
  test('moves every agent on the exhausted model, not just the one that failed', () => {
    const plan = planFailover({
      agents: [
        agent(),
        agent({ id: 'a-forge', name: 'Forge', status: 'idle' }),
        agent({ id: 'a-fin', name: 'Finances', status: 'idle' }),
      ],
      runs: [run()],
    });
    expect(plan.actions.map((a) => a.agentName).sort()).toEqual(['Conductor', 'Finances', 'Forge']);
    expect(plan.actions.every((a) => a.to === 'claude-opus-5')).toBe(true);
  });

  test('leaves agents on healthy models alone', () => {
    const plan = planFailover({
      agents: [agent(), agent({ id: 'a-sales', name: 'Sales', model: 'claude-sonnet-4-6', status: 'idle' })],
      runs: [run()],
    });
    expect(plan.actions.map((a) => a.agentName)).toEqual(['Conductor']);
  });

  /** Self-healing: once a run succeeds the model is evidently fine again. */
  test('only the latest run per agent counts, so a recovered agent is not demoted', () => {
    const plan = planFailover({
      agents: [agent({ status: 'idle' })],
      runs: [
        run({ status: 'succeeded', error: null, finishedAt: '2026-08-18T18:30:00.000Z' }),
        run({ finishedAt: '2026-08-18T17:58:31.645Z' }),
      ],
    });
    expect(plan.exhausted).toEqual([]);
    expect(plan.actions).toEqual([]);
  });

  test('a failure that is not about credits triggers nothing', () => {
    const plan = planFailover({ agents: [agent()], runs: [run({ error: 'Maximum turns reached.' })] });
    expect(plan.actions).toEqual([]);
  });

  /** If the run does not say which model it used, fall back to the seat's. */
  test('attributes exhaustion to the agent model when the run omits it', () => {
    const plan = planFailover({ agents: [agent()], runs: [run({ model: null })] });
    expect(plan.actions[0]?.to).toBe('claude-opus-5');
  });

  /** Second outage in a row: Opus is out too, so skip it and keep going. */
  test('skips a fallback that is itself exhausted', () => {
    const plan = planFailover({
      agents: [agent(), agent({ id: 'a-mkt', name: 'Marketing', model: 'claude-opus-5', status: 'error' })],
      runs: [run(), run({ agentId: 'a-mkt', model: 'claude-opus-5' })],
    });
    const conductor = plan.actions.find((a) => a.agentId === 'a-conductor');
    expect(conductor?.to).toBe('claude-sonnet-5');
  });

  test('reports rather than acts when the whole ladder is exhausted', () => {
    const agents = [agent(), agent({ id: 'a-o', name: 'O', model: 'claude-opus-5' }), agent({ id: 'a-s', name: 'S', model: 'claude-sonnet-5' })];
    const runs = [run(), run({ agentId: 'a-o', model: 'claude-opus-5' }), run({ agentId: 'a-s', model: 'claude-sonnet-5' })];
    const plan = planFailover({ agents, runs });
    expect(plan.actions.find((a) => a.agentId === 'a-conductor')).toBeUndefined();
    expect(plan.notes.join(' ')).toMatch(/no healthy fallback|ladder/i);
  });

  test('an agent with no model recorded is skipped, not guessed at', () => {
    const plan = planFailover({ agents: [agent({ model: null })], runs: [run()] });
    expect(plan.actions).toEqual([]);
  });

  test('every action explains itself, so the board log is readable', () => {
    const plan = planFailover({ agents: [agent()], runs: [run()] });
    expect(plan.actions[0].reason).toMatch(/credit/i);
  });

  test('an empty board is a no-op, not a crash', () => {
    expect(planFailover({ agents: [], runs: [] })).toEqual({
      actions: [],
      resumes: [],
      alerts: [],
      exhausted: [],
      notes: [],
    });
  });
});

/**
 * 2026-09-05: the Conductor sat in `error` for a day and the failover loop
 * never noticed. Two blind spots, both seen on the live board:
 *
 * 1. Paperclip files the Codex CLI's failure as error "Internal error" and
 *    puts the real text in resultJson.summary. The loop only read `error`.
 * 2. Neither the Codex 5-hour window wording nor an expired Claude login on
 *    the host is a credit exhaustion, so even with the text in hand the loop
 *    would have classified them as "nothing to do" and stayed silent.
 *
 * A window quota is a wait, not a model change; an expired login is a human
 * job. Both must become visible on the board rather than pass quietly.
 */
const CODEX_QUOTA =
  "You've hit your usage limit. Upgrade to Pro (https://openai.com/chatgpt/pricing) or try again at 4:36 AM.";
const OAUTH_EXPIRED = 'Failed to authenticate: OAuth session expired and could not be refreshed';

describe('classifyFailure', () => {
  test('Codex window quota is a quota_window, not a credit exhaustion', () => {
    expect(classifyFailure(CODEX_QUOTA)).toBe('quota_window');
    expect(isCreditExhaustion(CODEX_QUOTA)).toBe(false);
  });

  test('an expired Claude login is auth, not a credit exhaustion', () => {
    expect(classifyFailure(OAUTH_EXPIRED)).toBe('auth');
    expect(classifyFailure('Please log in. Run `claude login` first.')).toBe('auth');
    expect(classifyFailure('Not logged in · Please run /login')).toBe('auth');
    expect(isCreditExhaustion(OAUTH_EXPIRED)).toBe(false);
  });

  test('credit exhaustion still classifies as credits', () => {
    expect(classifyFailure(run().error)).toBe('credits');
  });

  test('anything else is null', () => {
    expect(classifyFailure('Maximum turns reached.')).toBeNull();
    expect(classifyFailure('Internal error')).toBeNull();
    expect(classifyFailure(null)).toBeNull();
  });
});

describe('planFailover reads resultJson.summary', () => {
  const codexRun = (over: Partial<FailoverRun> = {}): FailoverRun =>
    run({ error: 'Internal error', summary: CODEX_QUOTA, model: 'gpt-5.5', finishedAt: '2026-09-05T05:09:00.000Z', ...over });
  const codex = (over: Partial<FailoverAgent> = {}) => agent({ model: 'gpt-5.5', ...over });

  test('credit exhaustion recorded only in the summary still demotes', () => {
    const plan = planFailover({ agents: [agent()], runs: [run({ error: 'Internal error', summary: run().error })] });
    expect(plan.actions[0]?.to).toBe('claude-opus-5');
  });

  test('a fresh Codex window quota alerts and waits; it does not move the model', () => {
    const plan = planFailover({ agents: [codex()], runs: [codexRun()], now: '2026-09-05T06:00:00.000Z' });
    expect(plan.actions).toEqual([]);
    expect(plan.resumes).toEqual([]);
    expect(plan.exhausted).toEqual([]);
    expect(plan.alerts).toHaveLength(1);
    expect(plan.alerts[0]).toMatchObject({ agentId: 'a-conductor', kind: 'quota_window', runFinishedAt: '2026-09-05T05:09:00.000Z' });
    expect(plan.alerts[0].message).toMatch(/window|usage limit/i);
    expect(plan.alerts[0].message).toMatch(/2026-09-05T10:09/);
  });

  test('once the window has passed, a seat parked in error is resumed', () => {
    const now = new Date(Date.parse('2026-09-05T05:09:00.000Z') + QUOTA_WINDOW_MS + 60_000).toISOString();
    const plan = planFailover({ agents: [codex()], runs: [codexRun()], now });
    expect(plan.resumes).toHaveLength(1);
    expect(plan.resumes[0]).toMatchObject({ agentId: 'a-conductor', agentName: 'Conductor' });
    expect(plan.resumes[0].reason).toMatch(/window/i);
    expect(plan.actions).toEqual([]);
  });

  test('a seat that is not in error is never "resumed" (it is already running)', () => {
    const now = new Date(Date.parse('2026-09-05T05:09:00.000Z') + QUOTA_WINDOW_MS + 60_000).toISOString();
    const plan = planFailover({ agents: [codex({ status: 'idle' })], runs: [codexRun()], now });
    expect(plan.resumes).toEqual([]);
  });

  test('a paused seat is left paused: pausing was a decision, the quota is not', () => {
    const now = new Date(Date.parse('2026-09-05T05:09:00.000Z') + QUOTA_WINDOW_MS + 60_000).toISOString();
    const plan = planFailover({ agents: [codex({ status: 'paused' })], runs: [codexRun()], now });
    expect(plan.resumes).toEqual([]);
  });

  test('an expired login alerts for a human and touches nothing', () => {
    const plan = planFailover({
      agents: [agent({ model: 'claude-sonnet-5' })],
      runs: [run({ error: OAUTH_EXPIRED, model: 'claude-sonnet-5', finishedAt: '2026-09-05T04:40:00.000Z' })],
      now: '2026-09-06T04:40:00.000Z',
    });
    expect(plan.actions).toEqual([]);
    expect(plan.resumes).toEqual([]);
    expect(plan.exhausted).toEqual([]);
    expect(plan.alerts).toHaveLength(1);
    expect(plan.alerts[0].kind).toBe('auth');
    expect(plan.alerts[0].message).toMatch(/log ?in/i);
  });

  test('a succeeded latest run clears every alert, so the thread is not nagged', () => {
    const plan = planFailover({
      agents: [codex({ status: 'idle' })],
      runs: [codexRun(), codexRun({ status: 'succeeded', error: null, summary: 'did the thing', finishedAt: '2026-09-05T12:00:00.000Z' })],
    });
    expect(plan.alerts).toEqual([]);
    expect(plan.resumes).toEqual([]);
  });

  test('every alert names the run it is about, so the board can dedupe it', () => {
    const plan = planFailover({ agents: [codex()], runs: [codexRun()], now: '2026-09-05T06:00:00.000Z' });
    expect(plan.alerts[0].message).toContain('2026-09-05T05:09:00.000Z');
  });
});

describe('alerts on the cockpit thread', () => {
  const alert = {
    agentId: 'a-conductor',
    agentName: 'Conductor',
    kind: 'quota_window' as const,
    runFinishedAt: '2026-09-05T05:09:00.000Z',
    message: 'Conductor hit the gpt-5.5 usage window at 2026-09-05T05:09:00.000Z.',
  };

  test('the rendered note is marked as automation so the Conductor does not answer it', () => {
    const body = renderFailoverAlert(alert);
    expect(body).toMatch(/^\[Founder OS failover\]/);
    expect(body).toContain(alert.message);
    expect(body).toMatch(/no reply needed/i);
  });

  test('a note is posted once per failing run, however many ticks see it', () => {
    const body = renderFailoverAlert(alert);
    expect(isAlertPosted(alert, [])).toBe(false);
    expect(isAlertPosted(alert, [{ body: 'unrelated chatter' }])).toBe(false);
    expect(isAlertPosted(alert, [{ body }])).toBe(true);
    // a later failure of the same kind is a new run and gets its own note
    expect(isAlertPosted({ ...alert, runFinishedAt: '2026-09-05T11:00:00.000Z' }, [{ body }])).toBe(false);
  });
});
