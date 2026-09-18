import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { scheduledJobRows } from '@/lib/scheduled-jobs';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Mock 5a (the operator, 2026-09-07): /workflows becomes the mock's two-section
 * screen. Scheduled tasks up top with a next-fire countdown, a NEXT column,
 * last-12-runs mini bars fed by real cron_runs history, a "run now" text
 * button and the failure summary surfaced on failed rows; the process map
 * below gains its section header. Real crons and real run history only.
 */
describe('/workflows mock-5a: rows carry real run history', () => {
  const cron = {
    id: 'c1',
    agentId: 'a1',
    schedule: '0 7 * * *',
    description: 'Morning brief',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const base = {
    crons: [cron],
    stats: { c1: { runs: 2, ok: 1, lastRunAt: '2026-06-11T07:00:00.000Z', lastOk: false } },
    agentNames: { a1: 'Conductor' },
    now: new Date(2026, 5, 11, 10, 0),
  };

  test('recentRuns (newest first, as the repo returns) become oldest-first bars plus the last summary', () => {
    const [row] = scheduledJobRows({
      ...base,
      recentRuns: {
        c1: [
          { ok: false, summary: 'stripe: HTTP 401' },
          { ok: true, summary: 'pulled balance' },
        ],
      },
    });
    expect(row.history).toEqual([true, false]);
    expect(row.lastSummary).toBe('stripe: HTTP 401');
  });

  test('no history yields an empty run strip, never a crash', () => {
    const [row] = scheduledJobRows(base);
    expect(row.history).toEqual([]);
    expect(row.lastSummary).toBeNull();
  });
});

describe('/workflows mock-5a: scheduled tasks panel', () => {
  const panel = read('components/ScheduledTasks.tsx');

  test('the header counts down to the soonest enabled fire', () => {
    expect(panel).toContain('next fires in');
    expect(panel).toContain('nextRunAt');
  });

  test('each row renders the last-12-runs strip with failures in red', () => {
    expect(panel).toContain('job.history');
    expect(panel).toMatch(/var\(--err\)|bg-os-err/);
  });

  test('run now is a labelled text button, not a bare icon', () => {
    expect(panel).toContain('▸ run now');
  });

  test('a failed row surfaces the run summary', () => {
    expect(panel).toContain('lastSummary');
    expect(panel).toMatch(/failed ·/);
  });

  test('no em dashes anywhere in the file', () => {
    expect(panel).not.toContain('—');
  });
});

describe('/workflows mock-5a: page header pill', () => {
  const page = read('app/workflows/page.tsx');

  test('the header carries the crons + healthy pill from real rows', () => {
    expect(page).toMatch(/right=\{/);
    expect(page).toMatch(/crons ·/);
    expect(page).toContain('healthy');
  });

  test('run history rides in from the real cron_runs table', () => {
    expect(page).toContain('byCron');
  });
});

describe('/workflows mock-5a: process map section header', () => {
  test('the map half announces itself like the mock (the Slab tree replaced the chain map, 2026-09-17)', () => {
    expect(read('app/workflows/page.tsx')).toContain('Process map');
    expect(read('app/workflows/page.tsx')).toContain('<WorkflowTree');
  });
});
