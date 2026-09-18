import type { PaperclipAgent, PaperclipIssue, PaperclipRun } from '@/lib/connectors/paperclip';
import type { DeliverableDecision } from '@/lib/deliverable-decisions';

/**
 * The live Paperclip board, aggregated for the OS: seats + models, the task
 * queue, and the heartbeat run feed in one payload. Pure shaping lives here
 * (unit-tested); `/api/board/live` fetches, `BoardLive` polls and renders.
 */
export type BoardLivePayload = {
  connected: boolean;
  agents: PaperclipAgent[];
  issues: PaperclipIssue[];
  runs: PaperclipRun[];
  checkedAt: string;
  /** Approve / dismiss calls he has already made on board tasks. They ride the
   *  payload rather than being fetched separately so a card paints decided on
   *  first render instead of flickering undecided for a frame. */
  decisions: DeliverableDecision[];
};

/**
 * A board task's key in the shared decision store. The store is keyed by a
 * free-form id already namespaced by convention (`<workspaceId>/<filename>`
 * for an agent file, `proposal:<id>` for a proposal); board tasks take the
 * `board:` prefix so they cannot collide with either.
 */
export const boardTaskDecisionId = (issueId: string) => `board:${issueId}`;

/**
 * The decision standing against one board task, or undefined. A board issue
 * has no content hash, so `updatedAt` is what the call is bound to: an agent
 * touching the task moves it, which reopens the decision exactly the way a
 * rewritten file reopens one.
 */
export function boardDecisionFor(
  issue: Pick<PaperclipIssue, 'id' | 'updatedAt'>,
  decisions: DeliverableDecision[],
): DeliverableDecision | undefined {
  const id = boardTaskDecisionId(issue.id);
  const hit = decisions.find((d) => d.id === id);
  if (!hit) return undefined;
  // decided against an older revision of the task = he is being asked again
  if (hit.decidedRevision && hit.decidedRevision !== (issue.updatedAt ?? '')) return undefined;
  return hit;
}

/**
 * 'glm-5.2 x6 · claude-local x1' — which models hold seats right now, most
 * common first. Seats without a model fall back to their adapter type so a
 * misconfigured seat is visible instead of hidden.
 */
export function modelSummary(agents: PaperclipAgent[]): string {
  const counts = new Map<string, number>();
  for (const a of agents) {
    const key = a.model ?? a.adapterType ?? 'unconfigured';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([model, n]) => `${model} x${n}`)
    .join(' · ');
}

/**
 * The centre column of the seat-chip grid.
 *
 * The grid is `grid-cols-2 sm:grid-cols-3 xl:grid-cols-5`, and /agents is a
 * full-viewport cockpit the operator runs at xl, so five wide is the layout that
 * matters and slot 2 is its middle column. Confirmed against a screenshot of
 * the live board: Hermes Workers sat in slot 2, dead centre of the top row.
 */
export const SEAT_CENTRE_SLOT = 2;

/**
 * Seat chips with the Conductor swapped into the middle, so the centralized
 * agent reads as centralized at a glance.
 *
 * Deliberately a two-chip swap and nothing else. The first attempt also sorted
 * the whole row by name to settle it, because the board does not promise an
 * order and successive calls do come back reshuffled, but that moved all ten
 * chips to solve a problem nobody had asked about, and the pin alone already
 * keeps the Conductor centred no matter how the rest arrives. Every other seat
 * keeps the position the board gave it.
 */
export function orderSeats(agents: PaperclipAgent[]): PaperclipAgent[] {
  const seats = [...agents];
  if (seats.length <= SEAT_CENTRE_SLOT) return seats;
  const at = seats.findIndex((a) => /^conductor$/i.test(a.name));
  if (at < 0 || at === SEAT_CENTRE_SLOT) return seats;
  [seats[at], seats[SEAT_CENTRE_SLOT]] = [seats[SEAT_CENTRE_SLOT], seats[at]];
  return seats;
}

/**
 * Board lane order — live work leads (this strip exists to WATCH agents run),
 * then the queue, done last. Unknown statuses append, cancelled is hidden.
 * The live board spells review `in_review`; `review` stays for other boards.
 */
export const ISSUE_LANES = ['in_progress', 'in_review', 'review', 'todo', 'blocked', 'backlog', 'done'] as const;

/**
 * The stages that render whether or not they hold anything.
 *
 * A lane that only appears when it holds work will vanish the moment the
 * board finishes everything queued in it: every lane except `done` stops
 * existing and the pipeline looks deleted even though nothing changed. An
 * empty lane is a readout; a missing lane reads as a broken feature.
 */
export const CORE_ISSUE_LANES = ['in_progress', 'todo', 'done'] as const;

/** Statuses that mean a run ended well (boards vary: succeeded vs completed). */
export const RUN_OK = new Set(['succeeded', 'completed', 'success', 'done']);

export function groupIssues(issues: PaperclipIssue[]): { status: string; issues: PaperclipIssue[] }[] {
  const byStatus = new Map<string, PaperclipIssue[]>();
  for (const i of issues) {
    if (i.status === 'cancelled') continue;
    (byStatus.get(i.status) ?? byStatus.set(i.status, []).get(i.status)!).push(i);
  }
  // core stages always ride; the optional ones (review, blocked, backlog)
  // only appear once they hold work, so the row stays wide and readable
  const core = new Set<string>(CORE_ISSUE_LANES);
  const known = ISSUE_LANES.filter((s) => byStatus.has(s) || core.has(s));
  const unknown = [...byStatus.keys()].filter((s) => !(ISSUE_LANES as readonly string[]).includes(s));
  return [...known, ...unknown].map((status) => ({ status, issues: byStatus.get(status) ?? [] }));
}

/** Newest runs first; runs the board never stamped sort last, order stable. */
export function orderRuns(runs: PaperclipRun[]): PaperclipRun[] {
  return [...runs].sort((a, b) => {
    if (!a.startedAt && !b.startedAt) return 0;
    if (!a.startedAt) return 1;
    if (!b.startedAt) return -1;
    return b.startedAt.localeCompare(a.startedAt);
  });
}

/**
 * The real numbers, at a glance: every figure derives from
 * live board data, nothing seeded. `now` is injectable so the shaping stays
 * unit-testable.
 */
export function boardStats(p: Pick<BoardLivePayload, 'agents' | 'issues' | 'runs'>, now = Date.now()) {
  const dayAgo = now - 86_400_000;
  const within24h = (iso: string | null) => !!iso && new Date(iso).getTime() > dayAgo;
  return {
    seats: p.agents.length,
    running: p.agents.filter((a) => a.status === 'running').length,
    openTasks: p.issues.filter((i) => i.status !== 'done' && i.status !== 'cancelled').length,
    runs24h: p.runs.filter((r) => within24h(r.startedAt)).length,
    heartbeats24h: p.agents.filter((a) => within24h(a.lastHeartbeatAt)).length,
  };
}

/**
 * When this seat's in-flight run started, so the chip can show a live elapsed
 * clock next to the spinner. Null when nothing is open for that agent, which
 * is what keeps the symbol honest: it only spins while the board says the
 * agent is genuinely mid-run. Newest wins if a seat somehow has two open.
 */
export function runningSince(runs: PaperclipRun[], agentId: string): string | null {
  const open = runs.filter((r) => r.agentId === agentId && r.status === 'running' && r.startedAt);
  return open.length === 0 ? null : orderRuns(open)[0].startedAt;
}

/** '14s' / '3m 12s' for a finished run, null while it is still going. */
export function runDuration(run: PaperclipRun): string | null {
  if (!run.startedAt || !run.finishedAt) return null;
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}
