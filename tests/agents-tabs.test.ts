import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * /agents carries the Hermes worker-pool dashboard as a TAB (the operator,
 * 2026-08-05): embed the stock dashboard via iframe rather than rebuilding
 * its UI (update-chasing trap). The iframe mounts lazily on first tab
 * activation so /agents never pays the dashboard's load cost by default,
 * and the URL comes from env (HERMES_DASH_URL) with the private network default.
 */
describe('agents Hermes tab', () => {
  test('AgentsTabs is a client component with Roster + Hermes tabs and a lazy iframe', () => {
    const src = read('components/AgentsTabs.tsx');
    expect(src).toContain("'use client'");
    expect(src).toContain('Roster');
    expect(src).toContain('Hermes');
    expect(src).toContain('<iframe');
    // lazy mount: iframe only renders once the tab has been visited
    expect(src).toMatch(/visited|mounted|activated/i);
    // external escape hatch — open the dashboard in its own tab
    expect(src).toContain('target="_blank"');
  });

  test('the agents page wraps its body in AgentsTabs with the env-driven URL', () => {
    const page = read('app/agents/page.tsx');
    expect(page).toContain('AgentsTabs');
    expect(page).toContain('HERMES_DASH_URL');
    expect(page).toContain('https://os.example.internal:9000');
  });
});

/**
 * The /agents Conductor card speaks to the REAL CEO (board cockpit thread),
 * not the retired Gateway router that sent the operator to read-only seeded agents.
 */
describe('agents Conductor = the real CEO', () => {
  test('ConductorChat uses the cockpit endpoint, not the old gateway route', () => {
    const src = read('components/ConductorChat.tsx');
    expect(src).toContain('/api/conductor/chat');
    expect(src).not.toContain('/api/agents/conductor/chat');
    // async reality: it polls the thread for the CEO's reply
    expect(src).toMatch(/poll|interval|setTimeout/i);
  });
});
