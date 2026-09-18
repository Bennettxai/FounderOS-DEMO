import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Home console contract (the operator, 2026-09-06 spring cleaning; reshaped by the
 * 2026-09-07 interaction rebrand): nothing useless on the screen. The old
 * ticker and Recent runs list are gone — Done today is now the only surface
 * reading agent_runs, and it must go through collapseRuns so a 30-minute
 * polling cron costs one line carrying its own repeat count, not 48 identical
 * sentences.
 */
describe('home console does not repeat itself', () => {
  const page = read('app/page.tsx');

  test('collapses runs before rendering them', () => {
    expect(page).toContain("from '@/lib/agents/run-digest'");
    expect(page).toMatch(/collapseRuns\(/);
  });

  test('the run surface is built from collapsed runs, never a raw slice', () => {
    expect(page).not.toMatch(/recentRuns\.slice/);
    expect(page).toMatch(/collapseRuns\(recentRuns\)/);
  });

  test('the ticker and Recent runs sections stayed dead', () => {
    expect(page).not.toContain('os-ticker');
    expect(page).not.toContain('Recent runs');
  });

  test('a collapsed group says how many runs it stands for', () => {
    expect(page).toMatch(/repeat > 1/);
  });

  test('the rebrand surfaces are all mounted', () => {
    expect(page).toContain('HomeNeedsYou');
    expect(page).toContain('InterjectComposer');
    expect(page).toContain('Done today');
    expect(page).toContain('CountUp');
  });
});
