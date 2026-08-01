import { describe, expect, test } from 'vitest';
import { buildKnowledgeGraph, graphDeptRank, graphDirectory, toolSlugOf, GRAPH_DEPT_ORDER } from '@/lib/knowledge-graph';
import type { Agent, Department, Person, SopTask } from '@/lib/schemas';

const dept = (id: string, name: string): Department => ({
  id,
  name,
  slug: id,
  tagline: '',
  color: '#fff',
  order: 1,
});

const agent = (over: Partial<Agent> & { id: string; departmentId: string }): Agent => ({
  name: over.id,
  role: '',
  status: 'active',
  tier: 'worker',
  description: '',
  model: '',
  tools: [],
  parentId: null,
  instance: 'builtin',
  ...over,
});

const person = (id: string, departmentId: string, tools: string[]): Person => ({
  id,
  departmentId,
  name: id,
  role: 'Human',
  tools,
});

const task = (
  id: string,
  departmentId: string,
  assigneeKind: SopTask['assigneeKind'],
  assigneeId: string,
): SopTask => ({
  id,
  departmentId,
  title: `Do ${id}`,
  summary: '',
  steps: ['step one', 'step two', 'step three'],
  assigneeKind,
  assigneeId,
});

const departments = [dept('dept-tech', 'TECH'), dept('dept-sales', 'Sales')];
const agents: Agent[] = [
  agent({ id: 'conductor', departmentId: 'dept-tech', name: 'Conductor', tier: 'lead', tools: ['openclaw'] }),
  agent({ id: 'data-agent', departmentId: 'dept-tech', name: 'Data Agent', parentId: 'conductor', tools: ['openclaw', 'comms-feed'] }),
  agent({ id: 'sales-agent', departmentId: 'dept-sales', name: 'Sales Agent', tools: ['attio'] }),
];
const people: Person[] = [person('person-marco', 'dept-sales', ['fathom'])];
const tasks: SopTask[] = [
  task('sop-conductor', 'dept-tech', 'agent', 'conductor'),
  task('sop-data', 'dept-tech', 'agent', 'data-agent'),
  task('sop-sales', 'dept-sales', 'agent', 'sales-agent'),
  task('sop-marco', 'dept-sales', 'person', 'person-marco'),
];

const build = () => buildKnowledgeGraph(agents, departments, people, tasks);

describe('buildKnowledgeGraph — dept → task → worker → tools chain', () => {
  test('a single Alex center node on ring 0, linked to every team (pillar edges)', () => {
    const { nodes, edges } = build();
    const self = nodes.filter((n) => n.kind === 'self');
    expect(self).toHaveLength(1);
    expect(self[0].ring).toBe(0);
    const pillars = edges.filter((e) => e.kind === 'pillar');
    expect(pillars).toContainEqual({ source: 'self', target: 'team:dept-tech', kind: 'pillar' });
    expect(pillars).toContainEqual({ source: 'self', target: 'team:dept-sales', kind: 'pillar' });
    expect(pillars).toHaveLength(2);
  });

  test('one team node per department on ring 1, tinted with its life-area color', () => {
    const { nodes } = build();
    const teams = nodes.filter((n) => n.kind === 'team');
    expect(teams.map((t) => t.label).sort()).toEqual(['Sales', 'TECH']);
    expect(teams.every((t) => t.ring === 1)).toBe(true);
    expect(teams.find((t) => t.label === 'Sales')?.color).toBe('#ef4444');
  });

  test('one task node per SOP task on ring 2, labeled with the job title', () => {
    const { nodes } = build();
    const taskNodes = nodes.filter((n) => n.kind === 'task');
    expect(taskNodes).toHaveLength(4);
    expect(taskNodes.every((t) => t.ring === 2)).toBe(true);
    expect(taskNodes.find((t) => t.id === 'task:sop-marco')?.label).toBe('Do sop-marco');
  });

  test('agents are employee nodes and humans are person nodes, both on ring 3', () => {
    const { nodes } = build();
    const emps = nodes.filter((n) => n.kind === 'employee');
    const humans = nodes.filter((n) => n.kind === 'person');
    expect(emps).toHaveLength(3);
    expect(humans).toHaveLength(1);
    expect(humans[0].id).toBe('person:person-marco');
    expect([...emps, ...humans].every((w) => w.ring === 3)).toBe(true);
  });

  test('one tool node per unique tool slug, deduped, on ring 4, label prettified', () => {
    const { nodes } = build();
    const tools = nodes.filter((n) => n.kind === 'tool');
    // openclaw (×2), comms-feed, attio, fathom (person) → 4 unique
    expect(tools).toHaveLength(4);
    expect(tools.every((t) => t.ring === 4)).toBe(true);
    expect(tools.find((t) => t.id === 'tool:comms-feed')?.label).toBe('Comms Feed');
    expect(tools.find((t) => t.id === 'tool:fathom')?.label).toBe('Fathom');
  });

  test('team→task sop edges, exactly one per task', () => {
    const { edges } = build();
    const sop = edges.filter((e) => e.kind === 'sop');
    expect(sop).toContainEqual({ source: 'team:dept-sales', target: 'task:sop-marco', kind: 'sop' });
    expect(sop).toHaveLength(4);
  });

  test('task→worker does edges — monogamous: one worker per task, one task per worker', () => {
    const { edges } = build();
    const does = edges.filter((e) => e.kind === 'does');
    expect(does).toContainEqual({ source: 'task:sop-conductor', target: 'emp:conductor', kind: 'does' });
    expect(does).toContainEqual({ source: 'task:sop-marco', target: 'person:person-marco', kind: 'does' });
    expect(does).toHaveLength(4);
    // no task fans out to two workers, no worker takes two tasks
    expect(new Set(does.map((e) => e.source)).size).toBe(4);
    expect(new Set(does.map((e) => e.target)).size).toBe(4);
  });

  test('workers have no direct member edge to their team — the task carries the chain', () => {
    const { edges } = build();
    expect(edges.filter((e) => e.kind === 'member')).toHaveLength(0);
  });

  test('an unassigned worker falls back to a member edge so nothing orphans', () => {
    const extra = [...agents, agent({ id: 'stray', departmentId: 'dept-tech' })];
    const { edges } = buildKnowledgeGraph(extra, departments, people, tasks);
    expect(edges.filter((e) => e.kind === 'member')).toEqual([
      { source: 'emp:stray', target: 'team:dept-tech', kind: 'member' },
    ]);
  });

  test('uses edges run worker→tool for agents AND humans', () => {
    const { edges } = build();
    const uses = edges.filter((e) => e.kind === 'uses');
    expect(uses).toContainEqual({ source: 'emp:data-agent', target: 'tool:openclaw', kind: 'uses' });
    expect(uses).toContainEqual({ source: 'person:person-marco', target: 'tool:fathom', kind: 'uses' });
    expect(uses.filter((e) => e.source === 'emp:data-agent')).toHaveLength(2);
  });

  test('employee→lead reports edge only when parentId is set', () => {
    const { edges } = build();
    const reports = edges.filter((e) => e.kind === 'reports');
    expect(reports).toEqual([{ source: 'emp:data-agent', target: 'emp:conductor', kind: 'reports' }]);
  });

  test('no dangling edges — every endpoint resolves to a node', () => {
    const { nodes, edges } = build();
    const ids = new Set(nodes.map((n) => n.id));
    for (const e of edges) {
      expect(ids.has(e.source), `missing ${e.source}`).toBe(true);
      expect(ids.has(e.target), `missing ${e.target}`).toBe(true);
    }
  });
});

describe('shared tools split per department — no cross-screen lines', () => {
  const multiDepts = [...departments, dept('dept-clients', 'Clients')];
  const multiAgents = [...agents, agent({ id: 'client-roster', departmentId: 'dept-clients', name: 'Client Roster', tools: ['attio'] })];
  const multiTasks = [...tasks, task('sop-roster', 'dept-clients', 'agent', 'client-roster')];
  const buildMulti = () => buildKnowledgeGraph(multiAgents, multiDepts, people, multiTasks);

  test('a tool used by two departments becomes one copy per department', () => {
    const { nodes } = buildMulti();
    const attios = nodes.filter((n) => n.kind === 'tool' && toolSlugOf(n.id) === 'attio');
    expect(attios.map((a) => a.id).sort()).toEqual(['tool:attio@dept-clients', 'tool:attio@dept-sales']);
    expect(attios.every((a) => a.label === 'Attio' && a.ring === 4)).toBe(true);
  });

  test('every uses edge points at the copy inside the worker own department', () => {
    const { edges } = buildMulti();
    expect(edges).toContainEqual({ source: 'emp:sales-agent', target: 'tool:attio@dept-sales', kind: 'uses' });
    expect(edges).toContainEqual({ source: 'emp:client-roster', target: 'tool:attio@dept-clients', kind: 'uses' });
    expect(edges.some((e) => e.target === 'tool:attio')).toBe(false);
  });

  test('single-department tools keep their plain id (openclaw has two users, one dept)', () => {
    const { nodes, edges } = buildMulti();
    expect(nodes.some((n) => n.id === 'tool:openclaw')).toBe(true);
    expect(nodes.some((n) => n.id === 'tool:fathom')).toBe(true);
    expect(edges).toContainEqual({ source: 'emp:data-agent', target: 'tool:openclaw', kind: 'uses' });
  });

  test('no dangling edges after the split', () => {
    const { nodes, edges } = buildMulti();
    const ids = new Set(nodes.map((n) => n.id));
    for (const e of edges) {
      expect(ids.has(e.source), `missing ${e.source}`).toBe(true);
      expect(ids.has(e.target), `missing ${e.target}`).toBe(true);
    }
  });

  test('toolSlugOf strips prefix and department suffix', () => {
    expect(toolSlugOf('tool:attio@dept-sales')).toBe('attio');
    expect(toolSlugOf('tool:attio')).toBe('attio');
    expect(toolSlugOf('tool:comms-feed@dept-tech')).toBe('comms-feed');
  });
});

describe('graphDirectory — the scrollable everything-index', () => {
  const multiDepts = [...departments, dept('dept-clients', 'Clients')];
  const multiAgents = [...agents, agent({ id: 'client-roster', departmentId: 'dept-clients', name: 'Client Roster', tools: ['attio'] })];
  const multiTasks = [...tasks, task('sop-roster', 'dept-clients', 'agent', 'client-roster')];

  test('four groups in order: agents, humans, SOPs, tools — every row present', () => {
    const dir = graphDirectory(multiAgents, multiDepts, people, multiTasks, buildKnowledgeGraph(multiAgents, multiDepts, people, multiTasks));
    expect(dir.map((g) => g.kind)).toEqual(['employee', 'person', 'task', 'tool']);
    expect(dir[0].rows).toHaveLength(4); // agents
    expect(dir[1].rows).toHaveLength(1); // humans
    expect(dir[2].rows).toHaveLength(5); // SOPs
    expect(dir[3].rows).toHaveLength(4); // unique tools (attio deduped across dept copies)
  });

  test('rows sort alphabetically by label within each group', () => {
    const dir = graphDirectory(multiAgents, multiDepts, people, multiTasks, buildKnowledgeGraph(multiAgents, multiDepts, people, multiTasks));
    for (const g of dir) {
      const labels = g.rows.map((r) => r.label);
      expect(labels, g.kind).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    }
  });

  test('every row carries a resolvable target: node id (or tool slug) + dept name', () => {
    const g = buildKnowledgeGraph(multiAgents, multiDepts, people, multiTasks);
    const ids = new Set(g.nodes.map((n) => n.id));
    const dir = graphDirectory(multiAgents, multiDepts, people, multiTasks, g);
    for (const group of dir) {
      for (const row of group.rows) {
        if (group.kind === 'tool') {
          expect(g.nodes.some((n) => n.kind === 'tool' && toolSlugOf(n.id) === row.id), row.label).toBe(true);
        } else {
          expect(ids.has(row.id), `${row.label} → ${row.id}`).toBe(true);
        }
      }
    }
    const roster = dir[0].rows.find((r) => r.label === 'Client Roster');
    expect(roster).toEqual({ id: 'emp:client-roster', label: 'Client Roster', sub: 'Clients' });
  });
});

describe('graph department order (AC1)', () => {
  test('Finances sits immediately next to Sales', () => {
    expect(graphDeptRank('dept-finance')).toBe(graphDeptRank('dept-sales') + 1);
  });

  test('covers all six pillars exactly once', () => {
    expect(new Set(GRAPH_DEPT_ORDER).size).toBe(6);
    for (const id of ['dept-sales', 'dept-finance', 'dept-clients', 'dept-marketing-growth', 'dept-tech', 'dept-comms']) {
      expect(GRAPH_DEPT_ORDER).toContain(id);
    }
  });

  test('unknown departments rank after the known ones', () => {
    expect(graphDeptRank('dept-mystery')).toBeGreaterThan(graphDeptRank('dept-comms'));
  });
});
