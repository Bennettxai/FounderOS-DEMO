/**
 * Model failover for the Paperclip board.
 *
 * The triggering failure: the Conductor (CEO seat) sat in `error` because Fable 5 ran out
 * of usage credits, and it stayed there. Paperclip has a quota classifier but
 * it does not help here for two reasons:
 *
 * 1. Its regex (CLAUDE_PROVIDER_QUOTA_RE, claude-local adapter) knows
 * "usage limit reached" and "extra usage" but not the credit-exhaustion
 * wording the CLI and the ACP lane actually emit, so the run was filed as
 * a generic hard failure. Nothing retried it.
 * 2. Even on a recognised quota error Paperclip WAITS for the window to
 * reset. It never changes model.
 *
 * The operator's requirement is that the company keeps running: when Fable is out,
 * drop to Opus 5. That policy lives here, outside Paperclip, so it survives
 * upstream upgrades and works for both the CLI and ACP lanes.
 *
 * Everything in this file is pure. The board calls live in
 * lib/connectors/paperclip.ts and the loop that applies a plan is
 * app/api/agents/failover/route.ts.
 */

/**
 * Where each model falls when it runs dry, in order of preference.
 *
 * Opus 5 is the first stop for everything above it because it is the strongest
 * seat that is not on the operator's Fable budget.
 *
 * The ladder must be ACYCLIC, not merely free of self-references. It used to
 * carry sonnet-5 -> haiku-4-5 and haiku-4-5 -> sonnet-5, and that two-cycle
 * flapped five live seats back and forth every five minutes for
 * an hour and a half: each tick condemned whichever of the two models had just
 * errored and moved every seat onto the other one, which then errored. So
 * haiku-4-5 is the floor and falls nowhere. A seat that runs dry there earns a
 * note for a human, never a promotion. tests/failover-no-flap.test.ts pins it.
 */
export const FAILOVER_CHAIN: Record<string, string[]> = {
  'claude-fable-5': ['claude-opus-5', 'claude-sonnet-5'],
  'claude-mythos-5': ['claude-opus-5', 'claude-sonnet-5'],
  'claude-opus-5': ['claude-sonnet-5', 'claude-haiku-4-5'],
  'claude-opus-4-8': ['claude-opus-5', 'claude-sonnet-5'],
  'claude-opus-4-7': ['claude-opus-5', 'claude-sonnet-5'],
  'claude-opus-4-6': ['claude-opus-5', 'claude-sonnet-5'],
  'claude-sonnet-5': ['claude-haiku-4-5'],
  'claude-sonnet-4-6': ['claude-sonnet-5', 'claude-haiku-4-5'],
  'claude-sonnet-4-5': ['claude-sonnet-5', 'claude-haiku-4-5'],
  'claude-haiku-4-6': ['claude-haiku-4-5'],
  'claude-haiku-4-5': [],
};

/**
 * The wordings that mean "this model has no budget left", from both lanes:
 *
 *   ACP:  Internal error: You're out of usage credits. Run /usage-credits to
 *         keep using Fable 5 or /model to switch models.
 *   CLI:  You're out of usage credits. Switch to another model, or manage usage
 *         credits at claude.ai/settings/usage..., to continue.
 *
 * plus the subscription-window phrasings Paperclip already knows about, so this
 * is a superset of its classifier rather than a competing one.
 *
 * Every branch requires an exhaustion verb. "Manage usage credits at ..." is
 * ordinary billing copy and must not trigger a config change on a live board.
 */
const EXHAUSTED_RE = new RegExp(
  [
    String.raw`out\s+of\s+(?:extra\s+)?usage(?:\s+credits?)?`,
    String.raw`claude\s+usage\s+limit\s+reached`,
    String.raw`usage\s+limit\s+reached`,
    String.raw`usage\s+cap\s+reached`,
    String.raw`5[-\s]?hour\s+limit\s+reached`,
    String.raw`weekly\s+limit\s+reached`,
    String.raw`you(?:'|’)ve\s+hit\s+your\s+session\s+limit`,
    String.raw`session\s+limit\s+(?:reached|exceeded)`,
  ].join('|'),
  'i',
);

/** True when this failure text means the model is out of budget. */
export function isCreditExhaustion(text: string | null | undefined): boolean {
  if (!text) return false;
  return EXHAUSTED_RE.test(text);
}

/**
 * Two more failure shapes have shown up on the live board, and neither
 * is a credit exhaustion, so the ladder must not touch them.
 *
 * quota_window Codex CLI, subscription 5-hour window:
 * "You've hit your usage limit. Upgrade to Pro (...) or try
 * again at 4:36 AM."
 * The seat comes back on its own once the window rolls. A
 * model change here would burn a second budget for nothing.
 * auth Claude CLI, login on the board host has lapsed:
 * "Failed to authenticate: OAuth session expired and could not
 * be refreshed" / "Please log in. Run `claude login` first."
 * No model on the ladder helps; a person has to log in.
 *
 * Order matters: the Codex wording contains "usage limit", which the credit
 * regex would otherwise read as a subscription window, so it is tested first.
 */
export type FailureKind = 'credits' | 'quota_window' | 'auth';

const QUOTA_WINDOW_RE = /(?:you(?:'|’)?ve\s+)?hit\s+your\s+usage\s+limit/i;
const AUTH_RE = new RegExp(
  [
    String.raw`oauth\s+session\s+expired`,
    String.raw`failed\s+to\s+authenticate`,
    String.raw`could\s+not\s+be\s+refreshed`,
    String.raw`not\s+logged\s+in`,
    String.raw`please\s+log\s*in`,
    String.raw`run\s+/login`,
    String.raw`claude\s+login`,
  ].join('|'),
  'i',
);

export function classifyFailure(text: string | null | undefined): FailureKind | null {
  if (!text) return null;
  if (AUTH_RE.test(text)) return 'auth';
  if (QUOTA_WINDOW_RE.test(text)) return 'quota_window';
  if (EXHAUSTED_RE.test(text)) return 'credits';
  return null;
}

/** How long a Codex subscription window lasts before the seat may be woken again. */
export const QUOTA_WINDOW_MS = 5 * 60 * 60 * 1000;

export type FailoverAgent = {
  id: string;
  name: string;
  model: string | null;
  status: string;
};

export type FailoverRun = {
  agentId: string;
  status: string;
  error: string | null;
  /** the model the run actually billed, when the board recorded it */
  model: string | null;
  finishedAt: string | null;
  /**
   * resultJson.summary. Paperclip files a Codex CLI failure as error
   * "Internal error" and keeps the CLI's own words here, so the classifier
   * reads both.
   */
  summary?: string | null;
};

export type FailoverAction = {
  agentId: string;
  agentName: string;
  from: string;
  to: string;
  reason: string;
};

/** A seat parked in `error` by a window quota that has since rolled over. */
export type FailoverResume = {
  agentId: string;
  agentName: string;
  reason: string;
};

/** Something the board should show a person, keyed by the run it is about. */
export type FailoverAlert = {
  agentId: string;
  agentName: string;
  kind: Exclude<FailureKind, 'credits'>;
  /** the failing run's finishedAt; the poster uses it to dedupe */
  runFinishedAt: string;
  message: string;
};

export type FailoverPlan = {
  actions: FailoverAction[];
  /** seats to clear-error + re-invoke, no config change */
  resumes: FailoverResume[];
  /** notes to post on the board for a human */
  alerts: FailoverAlert[];
  /** models believed to be out of budget right now */
  exhausted: string[];
  /** anything a person needs to know that is not an action */
  notes: string[];
};

/** The text the classifier sees for a run: the board's error plus the CLI's own summary. */
const failureText = (r: FailoverRun) => [r.error, r.summary].filter(Boolean).join('\n');

/** In-flight runs sort newest: they carry no error, so they cannot condemn a model. */
const recency = (r: FailoverRun) => r.finishedAt ?? '9999-12-31';

function latestRunPerAgent(runs: FailoverRun[]): FailoverRun[] {
  const best = new Map<string, FailoverRun>();
  for (const r of runs) {
    const prev = best.get(r.agentId);
    if (!prev || recency(r) > recency(prev)) best.set(r.agentId, r);
  }
  return [...best.values()];
}

/**
 * Decide which seats should move, from the board's agents and recent runs.
 *
 * Only each agent's LATEST run is evidence. That makes the policy self-healing:
 * the moment a model answers again, the old failure stops counting and nothing
 * is demoted on stale grounds.
 *
 * Credits are account-wide, not per seat, so one seat's exhaustion condemns the
 * model for every seat using it. Forge (deploys) and Finances were both on Fable
 * behind the Conductor; waiting for each to fail in turn is three more outages.
 */
export function planFailover(input: { agents: FailoverAgent[]; runs: FailoverRun[]; now?: string }): FailoverPlan {
  const byId = new Map(input.agents.map((a) => [a.id, a]));
  const nowMs = Date.parse(input.now ?? new Date().toISOString());
  const exhausted = new Set<string>();
  const resumes: FailoverResume[] = [];
  const alerts: FailoverAlert[] = [];

  for (const r of latestRunPerAgent(input.runs)) {
    const kind = classifyFailure(failureText(r));
    if (!kind) continue;
    const agent = byId.get(r.agentId);
    if (kind === 'credits') {
      const model = r.model ?? agent?.model ?? null;
      if (model) exhausted.add(model);
      continue;
    }
    if (!agent) continue;
    const at = r.finishedAt ?? new Date(nowMs).toISOString();
    if (kind === 'quota_window') {
      const resetMs = Date.parse(at) + QUOTA_WINDOW_MS;
      if (nowMs >= resetMs) {
        // Only a seat the quota parked. Paused is a person's decision.
        if (agent.status === 'error') {
          resumes.push({ agentId: agent.id, agentName: agent.name, reason: `usage window that closed at ${at} has rolled over` });
        }
        continue;
      }
      alerts.push({
        agentId: agent.id,
        agentName: agent.name,
        kind,
        runFinishedAt: at,
        message: `${agent.name} hit the ${r.model ?? agent.model ?? 'model'} usage window at ${at}. Not a credit problem: the seat is parked and will be resumed automatically after ${new Date(resetMs).toISOString()}.`,
      });
      continue;
    }
    alerts.push({
      agentId: agent.id,
      agentName: agent.name,
      kind,
      runFinishedAt: at,
      message: `${agent.name} cannot authenticate (run finished ${at}). The Claude login on the board host has expired; run \`claude\` and log in as the board user. Not a model problem, so the seat stays parked until then.`,
    });
  }

  const actions: FailoverAction[] = [];
  const notes: string[] = [];

  for (const a of input.agents) {
    if (!a.model || !exhausted.has(a.model)) continue;
    const to = (FAILOVER_CHAIN[a.model] ?? []).find((candidate) => !exhausted.has(candidate));
    if (!to) {
      notes.push(`${a.name}: no healthy fallback left on the ${a.model} ladder`);
      continue;
    }
    actions.push({
      agentId: a.id,
      agentName: a.name,
      from: a.model,
      to,
      reason: `${a.model} is out of usage credits`,
    });
  }

  return { actions, resumes, alerts, exhausted: [...exhausted], notes };
}

/**
 * The board-side shape of an alert: one comment on the cockpit thread.
 *
 * The first line carries agent + kind + the failing run's finishedAt, which is
 * the whole dedupe key. The tick fires every five minutes; without this the
 * same parked seat would earn a note per tick. The trailer tells the Conductor
 * (which reads the same thread) that this is automation, not the operator talking.
 */
export const FAILOVER_NOTE_PREFIX = '[Founder OS failover]';

export function failoverAlertMarker(alert: FailoverAlert): string {
  return `${FAILOVER_NOTE_PREFIX} ${alert.agentName} ${alert.kind} ${alert.runFinishedAt}`;
}

export function renderFailoverAlert(alert: FailoverAlert): string {
  return `${failoverAlertMarker(alert)}\n${alert.message}\nAutomated note from the OS failover tick, no reply needed.`;
}

export function isAlertPosted(alert: FailoverAlert, thread: { body: string }[]): boolean {
  const marker = failoverAlertMarker(alert);
  return thread.some((c) => c.body.includes(marker));
}
