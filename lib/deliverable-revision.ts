import type { DeliverableItem } from '@/lib/board-deliverables';

/**
 * A short fingerprint of the mutable state of a deliverable.
 *
 * The red ping should fire when a proposal or an agent file changes from
 * its initial state, so it can be checked again.
 *
 * The existing unread badge is presence-based: it compares id sets, so it can
 * only ever notice that something NEW arrived. A proposal that moves sent → won
 * keeps its id and stays silent. This gives every row a value that changes when
 * the thing itself changes, which is what both the red badge and the approval
 * queue need.
 *
 * Proposals deliberately ignore `modifiedAt`. For a proposal that field maps to
 * `createdAt`, which never moves, so including it would look like change
 * detection while detecting nothing. Status, amount, url and gate code are the
 * fields that actually change, and `meta` already carries status and amount.
 *
 * Fingerprinting rather than adding an `updated_at` column is deliberate:
 * proposals re-sync from seed on every boot, so a column would churn on restart
 * even when nothing changed, and a schema change would have to ride a
 * SEED_VERSION bump to reach the host at all.
 */
export function revisionOf(item: DeliverableItem): string {
  if (item.kind === 'link') {
    return ['link', item.meta, item.url ?? '', item.accessCode].join('|');
  }
  // Agent files are rewritten in place, so mtime and size are the honest signal.
  return ['file', item.modifiedAt, String(item.sizeBytes ?? '')].join('|');
}
