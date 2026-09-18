import type { DeliverableItem } from '@/lib/board-deliverables';
import type { DeliverableDecision } from '@/lib/schemas';
import { revisionOf } from '@/lib/deliverable-revision';

/**
 * Decisions on agent work: click a task and be able to dismiss it,
 * continue it, or give it approval.
 *
 * The load-bearing rule is that a decision is bound to the REVISION it was made
 * against, not to the file id. If an agent rewrites a file after it was
 * approved, the thing that was approved no longer exists, so the task
 * returns to the queue. A decision that stuck to the id alone would silently
 * bless every future edit, which would make the queue worth less than no
 * queue at all.
 *
 * Pure and unit-tested; the repo, the route and the tab stay thin.
 */
/** Shape and validation live in lib/schemas.ts with every other row that
 *  crosses the DB boundary; re-exported here so callers have one import. */
export { DECISION_KINDS } from '@/lib/schemas';
export type { DecisionKind, DeliverableDecision } from '@/lib/schemas';

/** Newest call per id wins, so a re-decision supersedes rather than duplicates. */
export function decisionMap(list: DeliverableDecision[]): Record<string, DeliverableDecision> {
  const out: Record<string, DeliverableDecision> = {};
  for (const d of list) {
    const prev = out[d.id];
    if (!prev || d.decidedAt >= prev.decidedAt) out[d.id] = d;
  }
  return out;
}

/**
 * Has this item changed since he decided on it? A blank recorded revision reads
 * as "still holds": rows written before the field existed must not all reopen
 * at once and flood the queue the first time he loads the tab.
 */
export function isReopened(item: DeliverableItem, decision: DeliverableDecision): boolean {
  if (!decision.decidedRevision) return false;
  return revisionOf(item) !== decision.decidedRevision;
}

export type Decided<T> = { item: T; decision: DeliverableDecision };

/**
 * Split what is still his call from what he has already handled. Decisions for
 * ids that are no longer on the board are dropped rather than rendered, so a
 * deleted file cannot haunt the list.
 */
export function partitionByDecision<T extends DeliverableItem>(
  items: T[],
  map: Record<string, DeliverableDecision>,
): { open: T[]; decided: Decided<T>[] } {
  const open: T[] = [];
  const decided: Decided<T>[] = [];
  for (const item of items) {
    const d = map[item.id];
    if (!d || isReopened(item, d)) open.push(item);
    else decided.push({ item, decision: d });
  }
  return { open, decided };
}
