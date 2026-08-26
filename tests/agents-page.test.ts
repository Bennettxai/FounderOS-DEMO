import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * The Agents roster must surface each agent's brain search scope, so the
 * scoping (AGENT_BRAIN_SOURCES) is visible on the card, not just enforced
 * by the searchGBrain tool. Regression guard for the detail panel.
 */
describe('Agents page brain scope visibility', () => {
  test('roster cards render a "searches:" line driven by AGENT_BRAIN_SOURCES', () => {
    const page = read('app/agents/page.tsx');
    expect(page).toContain("import { AGENT_BRAIN_SOURCES } from '@/lib/brain-graph'");
    expect(page).toContain('AGENT_BRAIN_SOURCES[agent.id]');
    expect(page).toContain('searches:');
  });
});