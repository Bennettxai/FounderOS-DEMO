import { isValidCron } from '@/lib/cron';

/**
 * The cron RUNNER. `lib/cron.ts` only ever validated and described schedules —
 * the OS displayed jobs nothing fired. This decides what is actually due.
 *
 * Two properties matter:
 *  - wall-clock local time, because "9am" means 9am where the operator is, and
 *    the host runs in that timezone;
 *  - catch-up. the host is rebuilt by the autodeploy daemon whenever main
 *    moves, so the process is routinely restarted. A 09:00 job must still run
 *    if the box only came back at 09:06 — comparing the last run against the
 *    last SCHEDULED occurrence gives that for free, and also makes a double
 *    fire impossible inside one window.
 *
 * Pure and injectable; the loop lives in app/api/cron/tick/route.ts.
 */
export type SchedulableCron = {
  id: string;
  agentId: string;
  schedule: string;
  description: string;
  enabled: boolean;
  lastRunAt: string | null;
};

/** Does one cron field match a value? Supports `*`, lists, ranges and steps. */
function fieldMatches(field: string, value: number): boolean {
  for (const part of field.split(',')) {
    const [spec, stepRaw] = part.split('/');
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isFinite(step) || step < 1) continue;

    if (spec === '*') {
      if (value % step === 0) return true;
      continue;
    }
    const range = spec.match(/^(\d+)-(\d+)$/);
    if (range) {
      const lo = Number(range[1]);
      const hi = Number(range[2]);
      if (value >= lo && value <= hi && (value - lo) % step === 0) return true;
      continue;
    }
    if (/^\d+$/.test(spec)) {
      const n = Number(spec);
      if (stepRaw ? value >= n && (value - n) % step === 0 : value === n) return true;
    }
  }
  return false;
}

/** Would this 5-field expression fire during the given local minute? */
export function matchesCron(expr: string, when: Date): boolean {
  if (!isValidCron(expr)) return false;
  const [min, hour, dom, mon, dow] = expr.trim().split(/\s+/);
  return (
    fieldMatches(min, when.getMinutes()) &&
    fieldMatches(hour, when.getHours()) &&
    fieldMatches(dom, when.getDate()) &&
    fieldMatches(mon, when.getMonth() + 1) &&
    fieldMatches(dow, when.getDay())
  );
}

/** How far back to look for a missed window before giving up (8 days). */
const LOOKBACK_MINUTES = 8 * 24 * 60;

/**
 * The most recent minute at or before `now` when this expression fired, or
 * null if it has not fired within the lookback.
 */
export function lastScheduledOccurrence(expr: string, now: Date): Date | null {
  if (!isValidCron(expr)) return null;
  const cursor = new Date(now.getTime());
  cursor.setSeconds(0, 0);
  for (let i = 0; i <= LOOKBACK_MINUTES; i++) {
    if (matchesCron(expr, cursor)) return new Date(cursor.getTime());
    cursor.setMinutes(cursor.getMinutes() - 1);
  }
  return null;
}


/** How far forward to look for the next window before giving up (8 days). */
const LOOKAHEAD_MINUTES = LOOKBACK_MINUTES;

/**
 * The next minute strictly after `now` when this expression fires, or null
 * if nothing matches within the lookahead. Powers the "next 8h" copy on the
 * /tasks cron cards · display only, the runner keeps its own due logic.
 */
export function nextScheduledOccurrence(expr: string, now: Date): Date | null {
  if (!isValidCron(expr)) return null;
  const cursor = new Date(now.getTime());
  cursor.setSeconds(0, 0);
  for (let i = 0; i < LOOKAHEAD_MINUTES; i++) {
    cursor.setMinutes(cursor.getMinutes() + 1);
    if (matchesCron(expr, cursor)) return new Date(cursor.getTime());
  }
  return null;
}

/**
 * Which jobs should run right now: enabled, with a scheduled occurrence in the
 * past that is newer than their last run. A job that has never run fires on
 * its first occurrence rather than waiting a whole cycle.
 */
export function dueCrons(crons: SchedulableCron[], now: Date = new Date()): SchedulableCron[] {
  return crons.filter((c) => {
    if (!c.enabled) return false;
    const occurrence = lastScheduledOccurrence(c.schedule, now);
    if (!occurrence) return false;
    if (!c.lastRunAt) return true;
    const last = Date.parse(c.lastRunAt);
    if (!Number.isFinite(last)) return true;
    return last < occurrence.getTime();
  });
}
