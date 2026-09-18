import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Department heads, final form (the operator, 2026-08-06): the PILLAR NODE IS the
 * department-head agent — no satellite crown nodes. Pillars wear the robot
 * icon; clicking a pillar expands the department AND opens its executive card
 * (live board seat, a real Run via the board heartbeat, and the department's
 * SOP skills). The Obsidian core stays on canvas but out of the side legend.
 */
describe('pillar = department-head agent', () => {
  test('pillars wear their original Users icon; no head kind anywhere in the graph chrome', () => {
    const kg = read('components/KnowledgeGraph.tsx');
    // the operator 2026-08-07: robot pillars reverted to the original look
    expect(kg).toContain("team: { color: 'var(--brain-1)', Icon: Users, label: 'Pillars', r: 15 }");
    expect(kg).not.toContain("Icon: Crown");
    expect(kg).toContain("['team', 'board', 'task', 'person', 'employee', 'tool']"); // side legend: no self, no head
  });

  test('clicking a pillar expands it AND opens the exec card', () => {
    const kg = read('components/KnowledgeGraph.tsx');
    expect(kg).toContain("if (n.kind === 'team' && entering) setSelectedHeadId(n.id)");
    expect(kg).toContain('HeadDetailCard');
    expect(kg).toContain('DEPT_EXEC_TITLES[deptId]');
    expect(kg).toContain('boardLeads');
    // the sidecar guard must know the card exists, or clicks expand silently
    expect(kg).toContain('agentCard || toolCard || headCard');
  });

  test('the exec card runs the real board heartbeat and lists the dept skills', () => {
    const card = read('components/KnowledgeDetail.tsx');
    expect(card).toContain('/api/board/agents/${boardLead.id}/run');
    expect(card).toContain('presides over');
  });

  test('the run route exists and is POST-only (no GET to the smoke net)', () => {
    const route = read('app/api/board/agents/[id]/run/route.ts');
    expect(route).toContain('invokePaperclipHeartbeat');
    expect(route).toContain('export async function POST');
    expect(route).not.toMatch(/export\s+(async\s+)?function\s+GET/);
  });
});
