import { describeCron } from '@/lib/cron';
import { dueCrons, nextScheduledOccurrence } from '@/lib/cron-scheduler';
import type { AgentCron } from '@/lib/schemas';

/**
 * The Scheduled panel on /workflows.
 *
 * Cron jobs show up in the workflow section rather than staying invisible. A list of
 * what SHOULD run would have been easy and nearly useless: the worst
 * scheduling failure on record was a heartbeat that curled a dead port
 * for months without anyone noticing. So every row also carries what actually
 * happened, and `overdue` compares the last scheduled slot against the last real
 * run. That single column is the difference between a schedule list and an audit.
 *
 * The runner itself (app/api/cron/tick, lib/cron-scheduler) and the /tasks view
 * belong to a parallel session; this module only shapes rows for the UI.
 */
export type CronStat = { runs: number; ok: number; lastRunAt: string | null; lastOk: boolean | null };

export type ScheduledJobRow = {
  id: string;
  description: string;
  agentId: string;
  agentName: string;
  /** the cron names an agent the runtime does not have, so it can only fail */
  unknownAgent: boolean;
  schedule: string;
  scheduleLabel: string;
  enabled: boolean;
  runs: number;
  ok: number;
  lastRunAt: string | null;
  lastOk: boolean | null;
  /** the next minute the schedule fires (null when disabled or unparseable) */
  nextRunAt: string | null;
  /** enabled, its slot has come round, and no run has happened since */
  overdue: boolean;
  /** ok flags for the last runs, oldest first, for the host bar strip */
  history: boolean[];
  /** what the most recent run reported, for surfacing failures inline */
  lastSummary: string | null;
};

export type CronRunLite = { ok: boolean; summary: string | null };

const EMPTY: CronStat = { runs: 0, ok: 0, lastRunAt: null, lastOk: null };

/**
 * Which jobs the runner would fire right now.
 *
 * This deliberately calls dueCrons rather than re-deriving "has its slot passed
 * since the last run". The panel's job is to report the runner's own view, and
 * a second implementation of the same predicate is a second thing that can
 * drift: the UI would eventually claim a job is fine while the runner disagrees,
 * which is precisely the blindness this panel exists to remove. Note that
 * matchesCron reads local time, so this follows the box's clock, not UTC.
 */
function overdueIds(crons: AgentCron[], stats: Record<string, CronStat>, now: Date): Set<string> {
  const due = dueCrons(
    crons.map((c) => ({
      id: c.id,
      agentId: c.agentId,
      schedule: c.schedule,
      description: c.description,
      enabled: c.enabled,
      lastRunAt: stats[c.id]?.lastRunAt ?? null,
    })),
    now,
  );
  return new Set(due.map((c) => c.id));
}

export function scheduledJobRows(input: {
  crons: AgentCron[];
  stats: Record<string, CronStat>;
  agentNames: Record<string, string>;
  /** per cron, most recent first, exactly as cronRuns.byCron returns them */
  recentRuns?: Record<string, CronRunLite[]>;
  now?: Date;
}): ScheduledJobRow[] {
  const now = input.now ?? new Date();
  const overdue = overdueIds(input.crons, input.stats, now);

  const rows = input.crons.map((c): ScheduledJobRow => {
    const s = input.stats[c.id] ?? EMPTY;
    const recent = input.recentRuns?.[c.id] ?? [];
    const name = input.agentNames[c.agentId];
    return {
      id: c.id,
      description: c.description,
      agentId: c.agentId,
      // Falling back to the raw id keeps a broken cron legible instead of
      // rendering a blank owner that looks like a UI bug.
      agentName: name ?? c.agentId,
      unknownAgent: name === undefined,
      schedule: c.schedule,
      scheduleLabel: describeCron(c.schedule) ?? c.schedule,
      enabled: c.enabled,
      runs: s.runs,
      ok: s.ok,
      lastRunAt: s.lastRunAt,
      lastOk: s.lastOk,
      nextRunAt: c.enabled ? (nextScheduledOccurrence(c.schedule, now)?.toISOString() ?? null) : null,
      overdue: overdue.has(c.id),
      history: recent.map((r) => r.ok).reverse(),
      lastSummary: recent[0]?.summary ?? null,
    };
  });

  // What needs attention first, then everything healthy, then what is switched
  // off. Alphabetical inside each band so the panel never reshuffles on a poll.
  const band = (r: ScheduledJobRow) => (!r.enabled ? 2 : r.overdue ? 0 : 1);
  return rows.sort((a, b) => band(a) - band(b) || a.description.localeCompare(b.description));
}
