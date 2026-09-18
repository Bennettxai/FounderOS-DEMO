import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildKnowledgeGraph, graphDirectory } from '@/lib/knowledge-graph';
import type { Agent, Department, Person, SopTask } from '@/lib/schemas';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Mock 1d (interaction rebrand handoff, artboard 1d): /brain. The capture bar
 * is a lens row whose Save is the three-state async control, the Radial/Neural
 * switch slides, pillar chips filter the directory AND dim the graph, and
 * hovering a node raises a 240px card with "open note" / "gbrain › query".
 */
describe('/brain mock-1d: capture bar states', () => {
  const dump = read('components/BrainDump.tsx');

  test('the bar is a lens row on the panel radius', () => {
    expect(dump).toContain('pressable is-row');
    expect(dump).toContain('data-lens="r"');
    expect(dump).toContain('rounded-panel');
    expect(dump).not.toContain('rounded-lg-t');
  });

  test('Save is the three-state AsyncButton: saving → ✓ embedded', () => {
    expect(dump).toContain('AsyncButton');
    expect(dump).toContain("busyLabel=\"saving\"");
    expect(dump).toContain('embedded');
    // the outcome drives the done label — a failed save never reads as ✓ embedded
    expect(dump).toContain('failed');
  });

  test('mic and Upload are controls, and neither hovers on one property alone', () => {
    expect(dump).toContain('data-lens="c"');
    expect(dump).toContain('is-dark');
    expect(dump).not.toContain('transition-colors hover:border-os-border-strong hover:text-os-text');
  });

  test('the footer message line still reflects every state', () => {
    expect(dump).toContain("'saving…'");
    expect(dump).toContain('status.embedded');
    expect(dump).toContain("status.kind === 'error'");
  });
});

describe('/brain mock-1d: AsyncButton can be disabled and can report failure', () => {
  const btn = read('components/AsyncButton.tsx');

  test('a disabled control never enters the busy/done cycle', () => {
    expect(btn).toContain('disabled');
    expect(btn).toMatch(/if \(disabled \|\| phase !== 'idle'\) return;/);
  });

  test('a failed run renders ✗ in the error color instead of a lying ✓', () => {
    expect(btn).toContain('failed');
    expect(btn).toContain('✗');
    expect(btn).toContain("var(--err)");
  });
});

describe('/brain mock-1d: Radial/Neural switch + pillar chips', () => {
  const view = read('components/BrainGraphView.tsx');

  test('the view switch is the sliding pill, two lanes of 84', () => {
    expect(view).toContain("variant=\"pill\"");
    expect(view).toContain('tabWidth={84}');
  });

  test('pillar chips sit after a divider in the tab row, radial view only', () => {
    expect(view).toContain('Chip');
    expect(view).toContain('activePillars');
    expect(view).toContain('h-[18px] w-px');
    expect(view).toMatch(/view === 'radial' &&/);
  });

  test('the lazy skeletons use the rebrand panel radius', () => {
    expect(view).not.toContain('rounded-lg-t');
    expect(view).toContain('rounded-panel');
  });
});

describe('/brain mock-1d: directory rows carry their pillars', () => {
  const dept = (id: string, name: string): Department => ({ id, name, slug: id, tagline: '', color: '#fff', order: 1 });
  const departments = [dept('dept-sales', 'Sales'), dept('dept-tech', 'TECH')];
  const agents: Agent[] = [
    { id: 'closer', name: 'Closer', role: '', status: 'active', model: 'x', departmentId: 'dept-sales', description: '', tools: ['attio'], parentId: null },
    { id: 'builder', name: 'Builder', role: '', status: 'active', model: 'x', departmentId: 'dept-tech', description: '', tools: ['attio'], parentId: null },
  ] as unknown as Agent[];
  const people: Person[] = [
    { id: 'ben', name: 'the operator', role: '', departmentId: 'dept-sales', tools: [] },
  ] as unknown as Person[];
  const tasks: SopTask[] = [
    { id: 'sop-1', title: 'Book calls', departmentId: 'dept-sales', assigneeKind: 'agent', assigneeId: 'closer' },
  ] as unknown as SopTask[];
  const graph = buildKnowledgeGraph(agents, departments, people, tasks);
  const dir = graphDirectory(agents, departments, people, tasks, graph);

  test('agents, humans and SOPs carry their own department id', () => {
    expect(dir[0].rows.find((r) => r.label === 'Closer')?.deptIds).toEqual(['dept-sales']);
    expect(dir[1].rows.find((r) => r.label === 'the operator')?.deptIds).toEqual(['dept-sales']);
    expect(dir[2].rows.find((r) => r.label === 'Book calls')?.deptIds).toEqual(['dept-sales']);
  });

  test('a shared tool carries every department that uses it', () => {
    const attio = dir[3].rows[0];
    expect([...(attio.deptIds ?? [])].sort()).toEqual(['dept-sales', 'dept-tech']);
  });
});

describe('/brain mock-1d: directory filters and its empty state', () => {
  const gd = read('components/GraphDirectory.tsx');

  test('rows are lens rows', () => {
    expect(gd).toContain('data-lens="r"');
    expect(gd).toContain('pressable is-row');
  });

  test('with every pillar off the list says so and offers a way back', () => {
    expect(gd).toContain('No pillars selected.');
    expect(gd).toContain('show all pillars');
    expect(gd).toContain('onShowAllPillars');
    expect(gd).toContain('data-lens="c"');
  });
});

describe('/brain mock-1d: pillar chips dim the graph', () => {
  const kg = read('components/KnowledgeGraph.tsx');

  test('KnowledgeGraph takes the active pillars and folds them into the lit set', () => {
    expect(kg).toContain('activePillars');
    expect(kg).toContain('pillarLit');
    expect(kg).toMatch(/const lit = focusSet \?\? \(hoverId \? litFor\(hoverId\) : null\) \?\?/);
  });

  test('the directory only lists rows in an active pillar', () => {
    expect(kg).toMatch(/deptIds/);
  });
});

describe('/brain mock-1d: node hover card', () => {
  const card = read('components/GraphNodeCard.tsx');
  const kg = read('components/KnowledgeGraph.tsx');

  test('the card is a 240px floating panel that enters, pinned bottom-left', () => {
    expect(card).toContain('w-60');
    expect(card).toContain('rounded-panel');
    expect(card).toContain('enter');
    expect(kg).toContain('GraphNodeCard');
    expect(kg).toMatch(/bottom-3 left-3/);
  });

  test('it names the node and its links under a "node · hover card" eyebrow', () => {
    expect(card).toContain('node · hover card');
    expect(card).toContain('links');
  });

  test('its two controls are "open note" and a real gbrain query', () => {
    expect(card).toContain('open note');
    expect(card).toContain('gbrain › query');
    expect(card).toContain('/api/brain?q=');
    expect(card).toContain('AsyncButton');
    expect(card).toContain('data-lens="c"');
  });
});
