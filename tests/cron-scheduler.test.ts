import { describe, expect, test } from 'vitest';
import { lastScheduledOccurrence, matchesCron, dueCrons, type SchedulableCron } from '@/lib/cron-scheduler';

/**
 * The runner that was always missing. Until 2026-08-18 `agent_crons` was
 * storage plus UI — the OS displayed schedules nothing ever fired. the operator's
 * 9am digest needs a real one, including catch-up: the host restarts (the
 * autodeploy daemon rebuilds it whenever main moves), and a job that was due
 * at 09:00 must still run if the process only came back at 09:06.
 */
// local time on purpose — cron is wall-clock, and the host runs in his TZ
const at = (d: number, h: number, m: number) => new Date(2026, 7, d, h, m, 0, 0);

describe('matchesCron', () => {
  test('daily 9am matches only at 09:00', () => {
    expect(matchesCron('0 9 * * *', at(18, 9, 0))).toBe(true);
    expect(matchesCron('0 9 * * *', at(18, 9, 1))).toBe(false);
    expect(matchesCron('0 9 * * *', at(18, 8, 0))).toBe(false);
  });

  test('step and list fields work', () => {
    expect(matchesCron('*/15 * * * *', at(18, 13, 30))).toBe(true);
    expect(matchesCron('*/15 * * * *', at(18, 13, 31))).toBe(false);
    expect(matchesCron('0 9,17 * * *', at(18, 17, 0))).toBe(true);
  });

  test('day-of-week is honoured (2026-08-18 is a Tuesday)', () => {
    expect(at(18, 9, 0).getDay()).toBe(2);
    expect(matchesCron('0 9 * * 2', at(18, 9, 0))).toBe(true);
    expect(matchesCron('0 9 * * 1', at(18, 9, 0))).toBe(false);
    expect(matchesCron('0 9 * * 1-5', at(18, 9, 0))).toBe(true);
  });

  test('a malformed expression never fires', () => {
    expect(matchesCron('not a cron', at(18, 9, 0))).toBe(false);
    expect(matchesCron('0 9 * *', at(18, 9, 0))).toBe(false);
  });
});

describe('lastScheduledOccurrence', () => {
  test('finds the most recent firing at or before now', () => {
    const got = lastScheduledOccurrence('0 9 * * *', at(18, 14, 32));
    expect(got?.getTime()).toBe(at(18, 9, 0).getTime());
  });

  test('crosses midnight back to yesterday when today has not fired yet', () => {
    const got = lastScheduledOccurrence('0 9 * * *', at(18, 3, 0));
    expect(got?.getTime()).toBe(at(17, 9, 0).getTime());
  });
});

describe('dueCrons', () => {
  const cron = (over: Partial<SchedulableCron> = {}): SchedulableCron => ({
    id: 'c1',
    agentId: 'comms-digest',
    schedule: '0 9 * * *',
    description: 'morning digest',
    enabled: true,
    lastRunAt: null,
    ...over,
  });

  test('a never-run job is due once its time has passed', () => {
    expect(dueCrons([cron()], at(18, 9, 30)).map((c) => c.id)).toEqual(['c1']);
  });

  test('not due again after it already ran for that occurrence', () => {
    const c = cron({ lastRunAt: at(18, 9, 2).toISOString() });
    expect(dueCrons([c], at(18, 14, 0))).toEqual([]);
  });

  test('CATCH-UP: a restart after the window still runs the missed job', () => {
    const c = cron({ lastRunAt: at(17, 9, 1).toISOString() });
    expect(dueCrons([c], at(18, 9, 6)).map((c2) => c2.id)).toEqual(['c1']);
  });

  test('due again the next day', () => {
    const c = cron({ lastRunAt: at(17, 9, 1).toISOString() });
    expect(dueCrons([c], at(18, 9, 0)).length).toBe(1);
  });

  test('disabled jobs never fire', () => {
    expect(dueCrons([cron({ enabled: false })], at(18, 9, 30))).toEqual([]);
  });

  test('before the first occurrence of the day, nothing is due', () => {
    const c = cron({ lastRunAt: at(17, 9, 1).toISOString() });
    expect(dueCrons([c], at(18, 3, 0))).toEqual([]);
  });

  test('a job whose expression is garbage is skipped, not crashed on', () => {
    expect(dueCrons([cron({ schedule: 'every morning' })], at(18, 9, 30))).toEqual([]);
  });
});
