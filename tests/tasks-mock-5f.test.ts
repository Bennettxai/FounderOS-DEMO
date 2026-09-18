import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { nextScheduledOccurrence } from '@/lib/cron-scheduler';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Mock 5f (the operator, 2026-09-07): /tasks becomes the mock's three-section
 * screen. A cron card strip up top (square dot, cadence plus next fire,
 * ok/runs count, failures in red), the Paperclip board queue in the middle
 * (open-issue count, routing chips, Create issue, per-row age), and a
 * four-lane local kanban underneath. Real data only: cron_runs numbers,
 * live board issues, agent_tasks rows.
 */
describe('/tasks mock-5f: next-fire helper', () => {
  test('finds the next strictly-future minute a cron fires', () => {
    // daily 07:00, asked at 10:00 -> tomorrow 07:00 local
    const at = new Date(2026, 5, 11, 10, 0);
    expect(nextScheduledOccurrence('0 7 * * *', at)).toEqual(new Date(2026, 5, 12, 7, 0));
    // every 30 minutes, asked at 10:05 -> 10:30 the same day
    expect(nextScheduledOccurrence('*/30 * * * *', new Date(2026, 5, 11, 10, 5))).toEqual(
      new Date(2026, 5, 11, 10, 30),
    );
  });

  test('a minute that matches now is not "next" · strictly after', () => {
    const at = new Date(2026, 5, 11, 7, 0);
    expect(nextScheduledOccurrence('0 7 * * *', at)).toEqual(new Date(2026, 5, 12, 7, 0));
  });

  test('an invalid expression yields null', () => {
    expect(nextScheduledOccurrence('not a cron', new Date(2026, 5, 11))).toBeNull();
  });
});

describe('/tasks mock-5f: scheduled-job rows carry the next fire', () => {
  const lib = read('lib/scheduled-jobs.ts');

  test('rows expose nextRunAt computed from the real scheduler', () => {
    expect(lib).toContain('nextScheduledOccurrence');
    expect(lib).toContain('nextRunAt');
  });
});

describe('/tasks mock-5f: cron card strip', () => {
  const strip = read('components/TaskCronStrip.tsx');

  test('the strip is a compact card grid, not a row list', () => {
    expect(strip).toMatch(/grid-cols/);
  });

  test('each card shows cadence plus the next fire and the ok/runs count', () => {
    expect(strip).toContain('nextRunAt');
    expect(strip).toMatch(/\{r\.ok\}\/\{r\.runs\}/);
  });

  test('a failing job reads red', () => {
    expect(strip).toMatch(/lastOk === false/);
    expect(strip).toContain('text-os-err');
  });
});

describe('/tasks mock-5f: board queue', () => {
  const board = read('components/BoardTasks.tsx');

  test('the header is the mock: Board queue, open-issue count, open board link', () => {
    expect(board).toContain('Board queue');
    expect(board).toMatch(/open issues/);
    expect(board).toMatch(/open board/i);
  });

  test('routing chips route the composer: Conductor routes / TECH / Sales', () => {
    expect(board).toContain("'Conductor routes'");
    expect(board).toContain("'TECH'");
    expect(board).toContain("'Sales'");
    expect(board).toMatch(/from '@\/components\/Pressable'/);
  });

  test('the submit is Create issue and rows carry an age from updatedAt', () => {
    expect(board).toContain('Create issue');
    expect(board).toContain('updatedAt');
    expect(board).toMatch(/ago\(/);
  });

  test('no em dashes anywhere in the file', () => {
    expect(board).not.toContain('—');
  });
});

describe('/tasks mock-5f: four-lane local kanban', () => {
  const board = read('components/TaskBoard.tsx');

  test('the review lane exists between doing and done', () => {
    expect(board).toContain("'review'");
    expect(board).toContain("'In review'");
  });

  test('advance walks open -> doing -> review -> done', () => {
    expect(board).toMatch(/doing:\s*'review'/);
    expect(board).toMatch(/review:\s*'done'/);
  });

  test('the header is the mock: Local kanban with the drag-or-advance hint', () => {
    expect(board).toContain('Local kanban');
    expect(board).toContain('or click ▸ to advance');
  });
});

describe('/tasks mock-5f: schema + API accept the review status', () => {
  test('AgentTaskSchema includes review', () => {
    expect(read('lib/schemas.ts')).toMatch(/'open',\s*'doing',\s*'review',\s*'done'/);
  });

  test('the work PATCH route includes review', () => {
    expect(read('app/api/agents/work/route.ts')).toMatch(/'open',\s*'doing',\s*'review',\s*'done'/);
  });
});

describe('/tasks mock-5f: page header pill', () => {
  test('the header carries the board-state pill naming paperclip', () => {
    const page = read('app/tasks/page.tsx');
    expect(page).toMatch(/right=\{/);
    expect(page).toMatch(/paperclip/i);
  });
});
