import type { Agent, Department, Person, SopTask } from '@/lib/schemas';
import { lifeAreaForDepartment } from '@/lib/life-map';

/**
 * The operating-knowledge graph that powers the /brain force graph — Alex's
 * life and the org in one. Five concentric rings: Alex at the core (ring 0),
 * the life pillars / teams tinted by their life-area color (ring 1), the
 * written-out SOP tasks — the actual jobs (ring 2), the workers who do them —
 * AI agents AND human employees (ring 3), and the software tools they use
 * (ring 4). Each task is done by exactly ONE worker and each worker owns
 * exactly ONE task (the monogamy rule; the seed tests enforce it). Pure data;
 * icons live in the component, colors are carried on the nodes that have a
 * brand one.
 */
export type KGNodeKind = 'self' | 'team' | 'task' | 'employee' | 'person' | 'tool';

export type KGNode = {
  id: string;
  kind: KGNodeKind;
  label: string;
  ring: number; // 0 = Alex core → 4 = outer (tools)
  color?: string; // life-area tint (teams)
};

export type KGEdgeKind = 'pillar' | 'sop' | 'does' | 'member' | 'uses' | 'reports';

export type KGEdge = {
  source: string;
  target: string;
  kind: KGEdgeKind;
};

export type KnowledgeGraph = { nodes: KGNode[]; edges: KGEdge[] };

const RING: Record<KGNodeKind, number> = { self: 0, team: 1, task: 2, employee: 3, person: 3, tool: 4 };

export const SELF_ID = 'self';

/**
 * Display order for the graph only (not the sidebar/org/roadmap): Finances rides
 * immediately next to Sales so the revenue + payment-processor story sits together.
 */
export const GRAPH_DEPT_ORDER = [
  'dept-sales',
  'dept-finance',
  'dept-clients',
  'dept-marketing-growth',
  'dept-tech',
  'dept-comms',
] as const;

/** Rank a department id for graph layout; unknown ids sort after the known five. */
export function graphDeptRank(deptId: string): number {
  const i = (GRAPH_DEPT_ORDER as readonly string[]).indexOf(deptId);
  return i < 0 ? GRAPH_DEPT_ORDER.length + 1 : i;
}

/** Order any dept-keyed list by the graph display order (Finances beside Sales). */
export function orderGraphDepartments<T>(items: T[], deptIdOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => graphDeptRank(deptIdOf(a)) - graphDeptRank(deptIdOf(b)));
}

/** 'comms-feed' → 'Comms Feed' */
function prettify(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Graph node id for a task's worker: agents are `emp:`, humans are `person:`. */
export function workerNodeId(kind: SopTask['assigneeKind'], assigneeId: string): string {
  return kind === 'agent' ? `emp:${assigneeId}` : `person:${assigneeId}`;
}

/**
 * Tool node id → tool slug. Tools shared by several departments are split
 * into one node per department (`tool:attio@dept-sales`) so no line has to
 * cross the whole wheel to a far-away shelf; single-department tools keep
 * the plain `tool:slug` id.
 */
export function toolSlugOf(nodeId: string): string {
  return nodeId.replace(/^tool:/, '').split('@')[0];
}

export type DirectoryRow = { id: string; label: string; sub: string };
export type DirectoryGroup = { kind: 'employee' | 'person' | 'task' | 'tool'; title: string; rows: DirectoryRow[] };

/**
 * The scrollable everything-index for the graph: four labeled groups (AI
 * agents, humans, SOPs, tools), each alphabetized. Rows carry the graph node
 * id to jump to — tools carry their SLUG (the click resolves to the copy in
 * the focused pillar, since shared tools are duplicated per department).
 */
export function graphDirectory(
  agents: Agent[],
  departments: Department[],
  people: Person[],
  tasks: SopTask[],
  graph: KnowledgeGraph,
): DirectoryGroup[] {
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const byLabel = (a: DirectoryRow, b: DirectoryRow) => a.label.localeCompare(b.label);

  const toolRows = new Map<string, DirectoryRow>();
  for (const n of graph.nodes) {
    if (n.kind !== 'tool') continue;
    const slug = toolSlugOf(n.id);
    if (!toolRows.has(slug)) {
      const users = new Set(
        graph.edges.filter((e) => e.kind === 'uses' && toolSlugOf(e.target) === slug).map((e) => e.source),
      );
      toolRows.set(slug, { id: slug, label: n.label, sub: `${users.size} user${users.size === 1 ? '' : 's'}` });
    }
  }

  return [
    {
      kind: 'employee',
      title: 'AI agents',
      rows: agents.map((a) => ({ id: `emp:${a.id}`, label: a.name, sub: deptName.get(a.departmentId) ?? a.departmentId })).sort(byLabel),
    },
    {
      kind: 'person',
      title: 'Humans',
      rows: people.map((p) => ({ id: `person:${p.id}`, label: p.name, sub: deptName.get(p.departmentId) ?? p.departmentId })).sort(byLabel),
    },
    {
      kind: 'task',
      title: 'SOPs',
      rows: tasks.map((t) => ({ id: `task:${t.id}`, label: t.title, sub: deptName.get(t.departmentId) ?? t.departmentId })).sort(byLabel),
    },
    {
      kind: 'tool',
      title: 'Tools',
      rows: [...toolRows.values()].sort(byLabel),
    },
  ];
}

export function buildKnowledgeGraph(
  agents: Agent[],
  departments: Department[],
  people: Person[] = [],
  tasks: SopTask[] = [],
): KnowledgeGraph {
  const nodes: KGNode[] = [];
  const edges: KGEdge[] = [];

  // Alex at the core — every pillar hangs off him (the life-at-the-core idea
  // folded in from the old life map).
  nodes.push({ id: SELF_ID, kind: 'self', label: 'Alex', ring: RING.self });

  // Teams / life pillars (ring 1) — only departments that actually have workers,
  // tinted with their life-area color.
  const usedDepts = new Set([...agents.map((a) => a.departmentId), ...people.map((p) => p.departmentId)]);
  for (const d of departments) {
    if (!usedDepts.has(d.id)) continue;
    const color = lifeAreaForDepartment(d.id)?.color;
    nodes.push({ id: `team:${d.id}`, kind: 'team', label: d.name, ring: RING.team, color });
    edges.push({ source: SELF_ID, target: `team:${d.id}`, kind: 'pillar' });
  }

  // SOP tasks (ring 2) — the written-out jobs. Each hangs off its department
  // and hands the chain to exactly one worker below.
  const assignedWorkers = new Set<string>();
  for (const t of tasks) {
    if (!usedDepts.has(t.departmentId)) continue;
    nodes.push({ id: `task:${t.id}`, kind: 'task', label: t.title, ring: RING.task });
    edges.push({ source: `team:${t.departmentId}`, target: `task:${t.id}`, kind: 'sop' });
    const worker = workerNodeId(t.assigneeKind, t.assigneeId);
    edges.push({ source: `task:${t.id}`, target: worker, kind: 'does' });
    assignedWorkers.add(worker);
  }

  const agentIds = new Set(agents.map((a) => a.id));

  // First pass: which departments touch each tool? A tool used from several
  // departments is DUPLICATED — one copy per department — so its lines stay
  // local instead of crossing the wheel (Alex: no messy long edges).
  const deptsOfTool = new Map<string, Set<string>>();
  const workerRows: { nodeId: string; kind: 'employee' | 'person'; label: string; deptId: string; tools: string[] }[] = [
    ...agents.map((a) => ({ nodeId: `emp:${a.id}`, kind: 'employee' as const, label: a.name, deptId: a.departmentId, tools: a.tools })),
    ...people.map((p) => ({ nodeId: `person:${p.id}`, kind: 'person' as const, label: p.name, deptId: p.departmentId, tools: p.tools })),
  ];
  for (const w of workerRows) {
    for (const slug of w.tools) {
      (deptsOfTool.get(slug) ?? deptsOfTool.set(slug, new Set()).get(slug)!).add(w.deptId);
    }
  }
  const toolNodeId = (slug: string, deptId: string) =>
    (deptsOfTool.get(slug)?.size ?? 0) > 1 ? `tool:${slug}@${deptId}` : `tool:${slug}`;

  // Workers (ring 3): AI agents and the humans in the process.
  for (const w of workerRows) {
    nodes.push({ id: w.nodeId, kind: w.kind, label: w.label, ring: RING[w.kind] });
    // Workers reach their team through their task; only a worker with no task
    // (a data gap the seed tests forbid) falls back to a direct member edge.
    if (!assignedWorkers.has(w.nodeId) && usedDepts.has(w.deptId)) {
      edges.push({ source: w.nodeId, target: `team:${w.deptId}`, kind: 'member' });
    }
    for (const slug of w.tools) {
      edges.push({ source: w.nodeId, target: toolNodeId(slug, w.deptId), kind: 'uses' });
    }
  }
  for (const a of agents) {
    if (a.parentId && agentIds.has(a.parentId)) {
      edges.push({ source: `emp:${a.id}`, target: `emp:${a.parentId}`, kind: 'reports' });
    }
  }

  // Software tools (outer ring) — one node per (tool, department-that-uses-it)
  // for shared tools, a single node otherwise.
  for (const slug of [...deptsOfTool.keys()].sort()) {
    const depts = [...deptsOfTool.get(slug)!].sort();
    if (depts.length > 1) {
      for (const deptId of depts) {
        nodes.push({ id: `tool:${slug}@${deptId}`, kind: 'tool', label: prettify(slug), ring: RING.tool });
      }
    } else {
      nodes.push({ id: `tool:${slug}`, kind: 'tool', label: prettify(slug), ring: RING.tool });
    }
  }

  return { nodes, edges };
}
