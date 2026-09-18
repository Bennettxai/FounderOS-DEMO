/**
 * "Not now": a hold on a queue row, in the viewer's own browser, for two hours.
 *
 * Mock 3a puts Snooze on every Needs-you row beside Approve and Dismiss. It is
 * deliberately NOT a third decision kind: an approve or a dismiss is recorded
 * on the board and read back by the agent that wrote the file (see
 * lib/deliverable-decisions and DECISION_KINDS in lib/schemas), and telling an
 * agent "declined" when the operator meant "after lunch" is a lie the agent
 * then acts on.
 *
 * So it lives on the same storage discipline as lib/deliverables-opened: no
 * per-user server state exists, this is one viewer's view of their own queue,
 * and anything unreadable reads as NOTHING snoozed. That direction matters: the
 * failure mode is a parked row coming back, never a row that still needs
 * attention silently disappearing.
 */
export const DELIVERABLES_SNOOZE_KEY = 'founder-os:deliverables-snoozed';

/** Long enough to finish the task at hand, short enough to still be today. */
export const SNOOZE_MS = 2 * 60 * 60 * 1000;

/** id → the instant the hold expires. */
export type SnoozeMap = Record<string, number>;

export function snoozeItem(map: SnoozeMap, id: string, now = Date.now()): SnoozeMap {
  return { ...map, [id]: now + SNOOZE_MS };
}

/** Undo. The toast offers it for 2.6s; this is what it calls. */
export function unsnooze(map: SnoozeMap, id: string): SnoozeMap {
  const { [id]: _dropped, ...rest } = map;
  return rest;
}

export function isSnoozed(map: SnoozeMap, id: string, now = Date.now()): boolean {
  const until = map[id];
  return typeof until === 'number' && until > now;
}

/** Expired holds are dropped on write so the store cannot grow forever. */
export function pruneSnoozed(map: SnoozeMap, now = Date.now()): SnoozeMap {
  const out: SnoozeMap = {};
  for (const [id, until] of Object.entries(map)) if (until > now) out[id] = until;
  return out;
}

export function parseSnoozeMap(raw: string | null): SnoozeMap {
  if (raw === null) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: SnoozeMap = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}
