import { describe, expect, test } from 'vitest';
import { scheduledJobRows } from '@/lib/scheduled-jobs';
import type { AgentCron } from '@/lib/schemas';

/**
 * The Scheduled panel on /workflows (the operator, 2026-08-18: "I want those cron
 * jobs to be showing up in the workflow section").
 *
 * The column that earns this panel's place is `overdue`. the operator's worst
 * scheduling failure was a heartbeat that curled a dead port for months with
 * nobody noticing, so a list that only shows what SHOULD run repeats that
 * mistake. Comparing the last scheduled occurrence against the last actual run
 * is what turns a schedule list into an audit.
 */
const cron = (over: Partial<AgentCron> = {}): AgentCron => ({
  id: 'cron-1',
  agentId: 'stack-monitor',
  schedule: '0 7 * * *',
  description: 'Connector health sweep',
  enabled: true,
  createdAt: '2026-08-18T00:00:00.000Z',
  ...over,
});

const NAMES = { 'stack-monitor': 'Stack Monitor', 'payments-pulse': 'Payments Pulse' };

/**
 * matchesCron reads LOCAL time (getHours/getDay), so every instant here is
 * built in local time. UTC literals would make these pass or fail depending on
 * which machine ran them.
 */
const local = (d: number, h: number, m = 0, s = 0) => new Date(2026, 7, d, h, m, s);
const NOON = local(18, 12);

const stat = (over: Partial<{ runs: number; ok: number; lastRunAt: string | null; lastOk: boolean | null }> = {}) => ({
  runs: 5, ok: 5, lastRunAt: local(18, 7, 0, 12).toISOString(), lastOk: true, ...over,
});

const rows = (crons: AgentCron[], stats: Record<string, ReturnType<typeof stat>> = {}) =>
  scheduledJobRows({ crons, stats, agentNames: NAMES, now: NOON });

describe('scheduledJobRows', () => {
  test('resolves the owning agent to a name a person can read', () => {
    expect(rows([cron()])[0].agentName).toBe('Stack Monitor');
  });

  /** A cron pointing at an agent that does not exist can only ever fail. */
  test('an unknown agent id is flagged, not silently prettified', () => {
    const r = rows([cron({ agentId: 'ghost-agent' })])[0];
    expect(r.unknownAgent).toBe(true);
    expect(r.agentName).toBe('ghost-agent');
  });

  test('turns the cron expression into a human label', () => {
    expect(rows([cron()])[0].scheduleLabel).toBe('at 07:00, daily');
  });

  test('an unparseable expression falls back to the raw string rather than blank', () => {
    expect(rows([cron({ schedule: 'nonsense' })])[0].scheduleLabel).toBe('nonsense');
  });

  test('carries the run history through', () => {
    const r = rows([cron()], { 'cron-1': stat({ runs: 9, ok: 8, lastOk: false }) })[0];
    expect(r).toMatchObject({ runs: 9, ok: 8, lastOk: false });
  });

  test('a job that has never run reports zeroes, not nulls that break the UI', () => {
    expect(rows([cron()])[0]).toMatchObject({ runs: 0, ok: 0, lastRunAt: null, lastOk: null });
  });

  describe('overdue — the column that makes this an audit', () => {
    test('ran after its last scheduled slot, so it is healthy', () => {
      expect(rows([cron()], { 'cron-1': stat() })[0].overdue).toBe(false);
    });

    test('the 07:00 slot passed and only yesterday\'s run exists, so it is overdue', () => {
      expect(rows([cron()], { 'cron-1': stat({ lastRunAt: local(17, 7, 0, 4).toISOString() }) })[0].overdue).toBe(true);
    });

    test('never run at all and its slot has passed today', () => {
      expect(rows([cron()])[0].overdue).toBe(true);
    });

    test('a disabled job is never overdue, it is just off', () => {
      expect(rows([cron({ enabled: false })])[0].overdue).toBe(false);
    });

    /**
     * 23:00 has not come round again today, and last night's run happened. The
     * slot being "later today" is not what clears a job; having run since its
     * most recent slot is.
     */
    test('a job that ran at its last slot is clear until the next one', () => {
      const late = cron({ schedule: '0 23 * * *' });
      expect(rows([late], { 'cron-1': stat({ lastRunAt: local(17, 23, 0, 5).toISOString() }) })[0].overdue).toBe(false);
    });
  });

  describe('ordering — what needs attention first', () => {
    test('overdue jobs sort above healthy ones, disabled sink to the bottom', () => {
      const out = rows(
        [
          cron({ id: 'healthy', description: 'Healthy', agentId: 'payments-pulse' }),
          cron({ id: 'off', description: 'Off', enabled: false }),
          cron({ id: 'late', description: 'Late' }),
        ],
        { healthy: stat() },
      );
      expect(out.map((r) => r.id)).toEqual(['late', 'healthy', 'off']);
    });

    test('ties break alphabetically so the list never reshuffles on its own', () => {
      const out = rows([
        cron({ id: 'b', description: 'Beta', schedule: '0 23 * * *' }),
        cron({ id: 'a', description: 'Alpha', schedule: '0 23 * * *' }),
      ]);
      expect(out.map((r) => r.description)).toEqual(['Alpha', 'Beta']);
    });
  });

  test('an empty schedule list is an empty panel, not a crash', () => {
    expect(rows([])).toEqual([]);
  });
});
