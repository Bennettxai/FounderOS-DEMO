import type { DeliverableGroup } from '@/lib/board-deliverables';
import { revisionOf } from '@/lib/deliverable-revision';

/**
 * Unread state for the Deliverables tab: a notification stays on
 * the tab for anything new until it is opened.
 *
 * The OS has no per-user server state, so what counts as "seen" lives in the
 * browser. The rules that keep the badge honest are pure functions here, unit
 * tested, rather than tangled into the component: a badge that lies (fires for
 * things the operator already opened, or stays silent when a proposal lands) is
 * worse than no badge at all.
 */
export const DELIVERABLES_SEEN_KEY = 'founder-os:deliverables-seen';
export const DELIVERABLES_COLLAPSED_KEY = 'founder-os:deliverables-collapsed';

/** Every row id currently on the board, in display order. */
export function deliverableIds(groups: DeliverableGroup[]): string[] {
  return groups.flatMap((g) => g.items.map((i) => i.id));
}

/**
 * Ids present now that have never been seen. A null store means this browser
 * has never looked, so everything already there is old news and nothing
 * badges. Only what arrives after that first look counts as new.
 */
export function unseenDeliverableIds(currentIds: string[], seen: string[] | null): string[] {
  if (seen === null) return [];
  const already = new Set(seen);
  return currentIds.filter((id) => !already.has(id));
}

/**
 * The store after a look at the tab. Ids that are gone get pruned so it cannot
 * grow forever, except when the list came back empty: a failed fetch is
 * indistinguishable from an empty board, and wiping the store there would
 * re-badge everything on the next successful load.
 */
export function markSeen(seen: string[] | null, currentIds: string[]): string[] {
  const merged = new Set([...(seen ?? []), ...currentIds]);
  if (currentIds.length === 0) return [...merged];
  const present = new Set(currentIds);
  return [...merged].filter((id) => present.has(id));
}

/** Read the store. Anything unparseable reads as never-looked, which can only
 *  ever suppress a badge, never invent one. */
export function parseSeen(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    return value.filter((v): v is string => typeof v === 'string');
  } catch {
    return null;
  }
}

/** Folder collapse state, same storage discipline: unreadable means "all open". */
export function parseCollapsed(raw: string | null): string[] {
  return parseSeen(raw) ?? [];
}

/* ───────────────────────────────────────────────────────────────────────────
 * Revision-aware unread — the red ping.
 *
 * The red ping fires when a proposal or an agent file changes from
 * its initial state.
 *
 * The functions above compare id SETS, so they can only ever notice that
 * something NEW arrived. A proposal moving sent → won keeps its id and stays
 * silent, which is precisely the case that needed covering. These track a
 * revision per id instead, so "changed" becomes a signal of its own next to
 * "new".
 *
 * The old store was `string[]`. It migrates to blank revisions, which read as
 * "seen, revision unknown" and can only ever suppress a ping, never invent one:
 * the first load after this ships must be silent, not a wall of red.
 * ─────────────────────────────────────────────────────────────────────────── */

/** id → revision */
export type SeenMap = Record<string, string>;

export function revisionMap(groups: DeliverableGroup[]): SeenMap {
  const out: SeenMap = {};
  for (const g of groups) for (const i of g.items) out[i.id] = revisionOf(i);
  return out;
}

/** Ids that are new, and ids that were already here but have since changed. */
export function changedIds(
  current: SeenMap,
  seen: SeenMap | null,
): { added: string[]; updated: string[] } {
  if (seen === null) return { added: [], updated: [] };
  const added: string[] = [];
  const updated: string[] = [];
  for (const [id, rev] of Object.entries(current)) {
    if (!(id in seen)) added.push(id);
    else if (seen[id] && seen[id] !== rev) updated.push(id);
  }
  return { added, updated };
}

/** Accepts both the current id→revision object and the legacy `string[]`. */
export function parseSeenMap(raw: string | null): SeenMap | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (Array.isArray(value)) {
    const out: SeenMap = {};
    for (const v of value) if (typeof v === 'string') out[v] = '';
    return out;
  }
  if (typeof value !== 'object' || value === null) return null;
  const out: SeenMap = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

/** The store after a look: adopt current revisions, prune what is gone. An
 *  empty board is treated as a failed fetch and leaves the store alone. */
export function markSeenMap(seen: SeenMap | null, current: SeenMap): SeenMap {
  const merged: SeenMap = { ...(seen ?? {}), ...current };
  if (Object.keys(current).length === 0) return merged;
  const out: SeenMap = {};
  for (const id of Object.keys(current)) out[id] = merged[id];
  return out;
}
