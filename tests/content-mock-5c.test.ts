import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Mock 5c (interaction rebrand handoff, artboard 5c): /content joins the
 * pressable/lens vocabulary. The three intelligence backlinks, the agent
 * cards and the Zernio pipeline rows are all rows (data-lens="r"), every
 * agent card carries a three-state "run" control (data-lens="c"), and the
 * tool chips are controls too. Nothing hovers on a single property any more.
 */
describe('/content mock-5c: intelligence backlinks are lens rows', () => {
  const page = read('app/content/page.tsx');

  test('the backlink card is a pressable row, not a border-brighten card', () => {
    expect(page).toMatch(/pressable is-row[^']*rounded-panel|rounded-panel[^']*pressable is-row/);
    expect(page).toContain('data-lens="r"');
    // the old single-property hover is gone
    expect(page).not.toContain('transition-colors hover:border-os-border-strong');
  });
});

describe('/content mock-5c: agent cards run their agent', () => {
  const card = read('components/ContentAgentCard.tsx');
  const page = read('app/content/page.tsx');

  test('the card is a client component driving the real run route', () => {
    expect(card.startsWith("'use client'")).toBe(true);
    expect(card).toContain('/api/agents/');
    expect(card).toContain("method: 'POST'");
  });

  test('the run control is the three-state AsyncButton with elapsed seconds', () => {
    expect(card).toContain('AsyncButton');
    expect(card).toContain('showElapsed');
    expect(card).toContain('run');
    expect(card).toContain('data-lens');
  });

  test('the card itself is a lens row and its tool chips are controls', () => {
    expect(card).toContain('pressable is-row');
    expect(card).toContain('data-lens="r"');
    expect(card).toContain('data-lens="c"');
    expect(card).toContain('rounded-panel');
  });

  test('the page renders the client card instead of a local one', () => {
    expect(page).toContain('ContentAgentCard');
    expect(page).not.toMatch(/^function AgentCard\(/m);
  });
});

describe('/content mock-5c: Zernio pipeline rows', () => {
  const page = read('app/content/page.tsx');

  test('each post row is a pressable lens row carrying its status', () => {
    const rows = page.slice(page.indexOf('Zernio content pipeline'));
    expect(rows).toContain('pressable is-row');
    expect(rows).toContain('data-lens="r"');
    expect(rows).toContain('p.status');
  });
});

describe('/content mock-5c: radius rule', () => {
  const page = read('app/content/page.tsx');
  const card = read('components/ContentAgentCard.tsx');

  test('floating surfaces use the rebrand panel radius, chips stay round', () => {
    expect(page).not.toContain('rounded-lg-t');
    expect(card).not.toContain('rounded-lg-t');
    expect(card).toContain('rounded-full');
  });
});
