import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * /workflows has to DO something (the operator, 2026-08-18: "I want the ability to
 * add cronjobs through that workflow section as well ... It's basically
 * useless. It's just a fucking screen I look at"). The CRUD API already
 * existed; what was missing was any control in the OS that called it.
 */
const ui = readFileSync(join(process.cwd(), 'components/ScheduledTasks.tsx'), 'utf8');
const page = readFileSync(join(process.cwd(), 'app/workflows/page.tsx'), 'utf8');

describe('scheduled tasks are editable from /workflows', () => {
  test('the panel is called scheduled tasks, his words', () => {
    expect(ui).toContain('Scheduled tasks');
  });

  test('it can create, run, pause and delete — every verb wired to a real route', () => {
    expect(ui).toContain("'/api/agents/work'");
    expect(ui).toContain("method: 'POST'");
    expect(ui).toContain("method: 'PATCH'");
    expect(ui).toContain("method: 'DELETE'");
    expect(ui).toContain("'/api/cron/run'");
  });

  test('the page passes the real agent roster so a task can only target a real agent', () => {
    expect(page).toContain('<ScheduledTasks');
    expect(page).toContain('db.agents.all()');
  });

  test('it refreshes server data after a change instead of guessing locally', () => {
    expect(ui).toContain('router.refresh()');
  });

  test('presets cover the schedules he actually asks for', () => {
    expect(ui).toContain("'0 9 * * *'"); // every morning 9am
    expect(ui).toContain("'0 9 * * 1-5'"); // weekdays
  });
});
