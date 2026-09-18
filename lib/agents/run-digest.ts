/**
 * Collapse repeated agent runs into one line each.
 *
 * Polling crons are the problem this solves. `cron-plaud-ingest-30m` fires 48
 * times a day and emits a byte-identical summary every time, so the home
 * ticker and the Recent runs panel filled with the same sentence fifteen times
 * over while every other agent's run scrolled off the end. An identical
 * summary is not new information, it is the same fact restated, so the same
 * (agent, ok, summary) triple folds into a single entry carrying how many runs
 * it stands for. Nothing is hidden: the count is shown, and the newest row of
 * the group is the one kept, so timestamps stay true.
 */

export type CollapsibleRun = { agentId: string; summary: string; ok: boolean };

export type CollapsedRun<T> = T & { repeat: number };

/**
 * @param runs  newest-first, as the repos return them
 * @param limit how many collapsed entries to keep (applied AFTER collapsing,
 *              so a noisy cron can no longer crowd out quieter agents)
 */
export function collapseRuns<T extends CollapsibleRun>(runs: readonly T[], limit?: number): CollapsedRun<T>[] {
  const byKey = new Map<string, CollapsedRun<T>>();
  const out: CollapsedRun<T>[] = [];

  for (const run of runs) {
    const key = `${run.agentId} ${run.ok ? '1' : '0'} ${run.summary}`;
    const seen = byKey.get(key);
    if (seen) {
      seen.repeat += 1;
      continue;
    }
    const entry = { ...run, repeat: 1 } as CollapsedRun<T>;
    byKey.set(key, entry);
    out.push(entry);
  }

  return limit === undefined ? out : out.slice(0, limit);
}
