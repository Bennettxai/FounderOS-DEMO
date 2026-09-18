import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Step 9 of the interaction rebrand, beyond /comms: empty states say what is
 * empty, why, and one way out; panes that refetch on a source switch show
 * .skeleton rows for the fetch and enter their rows with animate-enter.
 */
describe('step-9 empty states + refetch skeletons', () => {
  test('the empty Conductor transcript says Nothing yet and offers quick actions', () => {
    const panel = read('components/ConductorPanel.tsx');
    expect(panel).toMatch(/Nothing yet/);
    expect(panel).toContain('QUICK_ACTIONS');
  });

  test('the deliverables review lane names itself when empty', () => {
    const list = read('components/DeliverablesList.tsx');
    expect(list).toMatch(/Nothing in review/);
  });

  test('ChatHub shows skeleton rows while a thread loads, rows enter animated', () => {
    const hub = read('components/ChatHub.tsx');
    expect(hub).toContain('loadingThread');
    expect(hub).toMatch(/className="skeleton/);
    expect(hub).toContain('animate-enter');
  });

  test('the skeleton primitive exists in globals with a reduced-motion guard', () => {
    const css = read('app/globals.css');
    expect(css).toMatch(/\.skeleton\s*\{/);
    expect(css).toMatch(/prefers-reduced-motion/);
  });
});
