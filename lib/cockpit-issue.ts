/**
 * The shape of the "Founder OS Cockpit" issue on the Paperclip board.
 *
 * The cockpit is a standing chat thread between the operator and the Conductor,
 * not a task with a disposition. Paperclip has two automations that treat it
 * as a task: the successful-run handoff (a run that ends without moving the
 * issue is treated as missing a disposition) and the stranded-issue recovery
 * sweep. Both only fire on issues that are `in_progress` / `todo` / `in_review`
 * with an agent assignee, and the handoff attempt budget is effectively zero,
 * so with the wrong status they can ping-pong the Conductor through repeated
 * runs and burn its usage window.
 *
 * `backlog` is the one status both automations skip while a new comment on
 * the issue still wakes the agent assignee. A human co-owner would also
 * shield it, but the board allows exactly one assignee, and the Conductor has
 * to be that one or comments stop waking it. This module owns the shape; the
 * connector applies it on create and on repair.
 */

export const COCKPIT_TITLE = 'Founder OS Cockpit';

export const COCKPIT_DESCRIPTION =
  'Standing thread: the operator talks to the Conductor from the Founder OS panel. ' +
  'Conductor: treat new comments here as direct messages from the operator. Reply in this thread, concisely. ' +
  'Delegate real work to the departments/Hermes Workers as separate tasks rather than doing it inline. ' +
  'This issue is a chat lane, not a task: leave it in backlog and never move it to in_progress or blocked, ' +
  'so the handoff and recovery automations skip it while a new comment still wakes you.';

/** The one status neither automation touches and that keeps comment wakes. */
export const COCKPIT_SAFE_STATUS = 'backlog';

const CLOSED = new Set(['done', 'cancelled']);

export type CockpitIssueCreateBody = {
  title: string;
  description: string;
  status: string;
  assigneeAgentId?: string;
};

export function cockpitIssueCreateBody(input: { conductorId: string | null | undefined }): CockpitIssueCreateBody {
  return {
    title: COCKPIT_TITLE,
    description: COCKPIT_DESCRIPTION,
    status: COCKPIT_SAFE_STATUS,
    ...(input.conductorId ? { assigneeAgentId: input.conductorId } : {}),
  };
}

export type CockpitIssueShape = {
  status?: string | null;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
};

export type CockpitRepairPatch = { status?: string; assigneeAgentId?: string; assigneeUserId?: null };

/**
 * The PATCH that returns an open cockpit issue to the safe shape, or null
 * when nothing needs writing. A closed issue is left alone: ensureCockpitIssue
 * creates a fresh one instead. When the Conductor's id is known and it is not
 * the assignee, the patch hands the issue back to it (clearing any human
 * assignee, since the board allows only one) so comments wake it again.
 */
export function cockpitRepairPatch(issue: CockpitIssueShape, conductorId: string | null | undefined): CockpitRepairPatch | null {
  const status = issue.status ?? '';
  if (CLOSED.has(status)) return null;
  const patch: CockpitRepairPatch = {};
  if (status !== COCKPIT_SAFE_STATUS) patch.status = COCKPIT_SAFE_STATUS;
  if (conductorId && issue.assigneeAgentId !== conductorId) {
    patch.assigneeAgentId = conductorId;
    if (issue.assigneeUserId) patch.assigneeUserId = null;
  }
  return Object.keys(patch).length ? patch : null;
}
