/**
 * Per-item unread: the dot on the piece of content itself.
 *
 * The goal is a dot on the actual piece of content when it has
 * updates that have not been seen, not just a tab-level badge.
 *
 * The tab badges already existed, but they run off the SEEN map in
 * lib/deliverables-seen.ts, which `acknowledge` marks wholesale the moment
 * the Deliverables tab is opened. Driving a row dot off that store would
 * clear every dot on the very click meant to reveal them.
 *
 * So the dot gets its own store, keyed on what actually happened: OPENED this
 * item at this revision. One question per row, "has THIS version of THIS
 * file been seen", which also answers the follow-on case for free: an agent
 * rewriting something already read marks it again, as `updated`.
 *
 * Same storage discipline as the seen map: no per-user server state exists, so
 * this lives in the browser, and anything unreadable reads as never-looked,
 * which can only ever suppress a dot rather than invent one.
 */
export const DELIVERABLES_OPENED_KEY = 'founder-os:deliverables-opened';

/** id → the revision he had open. */
export type OpenedMap = Record<string, string>;

export type UnseenState = 'new' | 'updated' | null;

/**
 * Has he seen this exact version?
 *
 * A null store means this browser has never looked. Marking everything then
 * would put a dot on all 98 files at once, which is the same unusable noise he
 * just asked us to fix, in a different colour.
 */
export function unseenStateOf(opened: OpenedMap | null, id: string, revision: string): UnseenState {
  if (opened === null) return null;
  if (!(id in opened)) return 'new';
  return opened[id] === revision ? null : 'updated';
}

export function markOpened(opened: OpenedMap, id: string, revision: string): OpenedMap {
  return { ...opened, [id]: revision };
}

/** Mark a whole batch, for bulk clear. */
export function markManyOpened(
  opened: OpenedMap,
  items: { id: string; revision: string }[],
): OpenedMap {
  const next = { ...opened };
  for (const i of items) next[i.id] = i.revision;
  return next;
}

/**
 * Drop entries for rows that no longer exist, so the store cannot grow
 * forever. An empty board is treated as a failed fetch and left alone: wiping
 * on a transient error would re-dot the entire list on the next good load.
 */
export function pruneOpened(opened: OpenedMap, presentIds: string[]): OpenedMap {
  if (presentIds.length === 0) return opened;
  const present = new Set(presentIds);
  const out: OpenedMap = {};
  for (const [id, rev] of Object.entries(opened)) if (present.has(id)) out[id] = rev;
  return out;
}

export function parseOpenedMap(raw: string | null): OpenedMap | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const out: OpenedMap = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}
