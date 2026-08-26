/**
 * Hermes cron connector — the scheduled job grid written by the Brainz
 * daemon / Hermes scheduler (~/.hermes/cron/jobs.json). Each job carries an
 * honest last_status (ok | degraded | skipped | failed | null), so this
 * connector surfaces the supervisor's real health instead of pretending.
 */
import fs from 'node:fs';
import path from 'node:path';
import { NIKOS_PATHS } from '@/lib/nikos-paths';
import type { ConnectorStatus } from '@/lib/connectors/types';

export type CronJob = {
  id: string;
  name?: string;
  schedule_display?: string;
  enabled?: boolean;
  last_run_at?: string | null;
  last_status?: string | null;
  last_error?: string | null;
};

export type CronSnapshot = {
  updatedAt: string | null;
  jobs: CronJob[];
  tally: Record<string, number>;
};

export function readCronJobs(): CronSnapshot | null {
  const file = path.join(NIKOS_PATHS.hermes, 'cron', 'jobs.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const jobs: CronJob[] = Array.isArray(raw.jobs) ? raw.jobs : [];
    const tally: Record<string, number> = {};
    for (const j of jobs) {
      const s = typeof j.last_status === 'string' ? j.last_status : 'never';
      tally[s] = (tally[s] ?? 0) + 1;
    }
    return {
      updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : null,
      jobs,
      tally,
    };
  } catch {
    return null;
  }
}

export async function hermesCronStatus(): Promise<ConnectorStatus> {
  const file = path.join(NIKOS_PATHS.hermes, 'cron', 'jobs.json');
  if (!fs.existsSync(file)) {
    return {
      id: 'hermes-cron',
      name: 'Hermes Cron',
      kind: 'orchestration',
      state: 'not_configured',
      detail: `No jobs.json at ${file} — the Hermes scheduler hasn't written one yet.`,
    };
  }
  const snap = readCronJobs();
  if (!snap) {
    return {
      id: 'hermes-cron',
      name: 'Hermes Cron',
      kind: 'orchestration',
      state: 'error',
      detail: `jobs.json exists but couldn't be parsed — check ${file}.`,
    };
  }
  const total = snap.jobs.length;
  const enabled = snap.jobs.filter((j) => j.enabled !== false).length;
  const ok = snap.tally.ok ?? 0;
  const degraded = snap.tally.degraded ?? 0;
  const failed = snap.tally.failed ?? 0;
  const meta: Record<string, string | number> = {
    jobs: total,
    enabled,
    ok,
    degraded,
    failed,
    skipped: snap.tally.skipped ?? 0,
    updatedAt: snap.updatedAt ?? 'unknown',
  };
  return {
    id: 'hermes-cron',
    name: 'Hermes Cron',
    kind: 'orchestration',
    state: total > 0 ? 'connected' : 'not_configured',
    detail:
      total === 0
        ? 'jobs.json exists but has no jobs.'
        : `${enabled}/${total} jobs enabled · ${ok} ok · ${degraded} degraded · ${failed} failed · updated ${snap.updatedAt}`,
    meta,
  };
}
