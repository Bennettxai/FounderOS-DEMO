import type { BlueprintGraph, BlueprintNode, BlueprintEdge } from './graph';

/**
 * Blueprint hierarchy: the compiled graph re-read as buckets: containers
 * (the operator, the running OS, each machine, the cloud) → groups
 * (departments, capabilities, daemons, models) → things. Pure and
 * client-safe: everything here derives from lib/blueprint/compile.ts's
 * graph, so the map still cannot drift from the system. The concept this
 * ports (the blueprint concept) read a hand-written
 * audit; the OS reads itself.
 */

export type HKind =
  | 'operator'
  | 'command' // the engine the Conductor runs on
  | 'app' // the running OS
  | 'router'
  | 'agent'
  | 'person'
  | 'department'
  | 'skill'
  | 'connector'
  | 'model'
  | 'store'
  | 'surface'
  | 'daemon'
  | 'machine'
  | 'cloud'
  | 'group';

export type HShape = 'card' | 'compact' | 'hero' | 'start' | 'diamond' | 'external';
export type HStatus = BlueprintNode['status'];

export interface HNode {
  type: 'node';
  id: string;
  name: string;
  sub: string;
  kind: HKind;
  status: HStatus;
  shape: HShape;
  icon: string;
  facts: Record<string, string>;
  /** docked beside the previous card in its row without shifting the row off the spine */
  satellite?: boolean;
}

export interface HGroup {
  type: 'group';
  id: string;
  name: string;
  sub: string;
  kind: HKind;
  icon: string;
  children: HItem[];
  /** grid columns when the group has no explicit rows */
  cols?: number;
  /** explicit rows of child ids (centred, wide gaps) */
  rows?: string[][];
  /** disclosure level at which the group opens: 1 overview · 2 systems · 3 everything */
  level: 1 | 2 | 3;
  status?: HStatus;
  badge?: string;
}

export type HItem = HNode | HGroup;

export interface HContainer {
  type: 'container';
  id: string;
  name: string;
  sub: string;
  kind: HKind;
  icon: string;
  rows: HItem[][];
  facts: Record<string, string>;
}

export interface HRelation {
  from: string;
  to: string;
  kind: string;
  via?: string;
}

export interface HSpine {
  from: string;
  to: string | string[];
  kind: 'hot' | 'soft';
  label?: string;
  bus?: boolean;
  gutter?: 'left' | 'right';
}

export interface Hierarchy {
  compiledAt: string;
  containers: HContainer[];
  spine: HSpine[];
  relations: HRelation[];
}

export const ROUTER_DEPARTMENTS = 'router-departments';
export const ENGINE_ID = 'model-claude-engine';
export const APP_ID = 'k-founder';
export const CLOUD_ID = 'k-cloud';

export const KIND_LABEL: Record<HKind, string> = {
  operator: 'operator',
  command: 'engine',
  app: 'the OS',
  router: 'router',
  agent: 'agent',
  person: 'person',
  department: 'department',
  skill: 'skill',
  connector: 'connector',
  model: 'model',
  store: 'store',
  surface: 'page',
  daemon: 'daemon',
  machine: 'machine',
  cloud: 'cloud',
  group: 'group',
};

export const KIND_ICON: Record<HKind, string> = {
  operator: 'user-round',
  command: 'terminal',
  app: 'layout-dashboard',
  router: 'route',
  agent: 'bot',
  person: 'user-round',
  department: 'folder',
  skill: 'sparkles',
  connector: 'plug',
  model: 'cpu',
  store: 'database',
  surface: 'layout-grid',
  daemon: 'play',
  machine: 'server',
  cloud: 'globe',
  group: 'folder',
};

/** The legend strip: click one to dim everything that is not that kind. */
export const LEGEND: HKind[] = ['operator', 'router', 'agent', 'person', 'department', 'skill', 'connector', 'model', 'store', 'surface', 'daemon', 'machine'];

export const STATUS_LABEL: Record<HStatus, string> = {
  live: 'live',
  configured: 'configured',
  'not-configured': 'not configured',
  designed: 'designed',
};

const EDGE_LABEL: Record<BlueprintEdge['kind'], string> = {
  commands: 'commands',
  'member-of': 'member of',
  uses: 'uses',
  'runs-on': 'runs on',
  reads: 'reads',
  writes: 'writes',
  'delivers-to': 'delivers to',
};

function node(n: BlueprintNode, kind: HKind, shape: HShape, sub = n.blurb): HNode {
  return { type: 'node', id: n.id, name: n.name, sub, kind, status: n.status, shape, icon: n.icon || KIND_ICON[kind], facts: n.facts };
}

function group(id: string, name: string, sub: string, kind: HKind, icon: string, children: HItem[], level: 1 | 2 | 3, extra: Partial<HGroup> = {}): HGroup {
  return { type: 'group', id, name, sub, kind, icon, children, level, ...extra };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Agents' facts carry role/model/tools: the one-line sub says the role. */
function agentSub(n: BlueprintNode): string {
  const role = n.facts.role;
  if (n.status === 'designed') return role ? `${role} · designed, not wired` : 'designed, not wired';
  return role || n.blurb;
}

export function buildHierarchy(graph: BlueprintGraph): Hierarchy {
  const nodes = graph.nodes;
  const byKind = (k: BlueprintNode['kind']) => nodes.filter((n) => n.kind === k);
  const ids = new Set(nodes.map((n) => n.id));
  const hostOf = new Map<string, string>();
  for (const e of graph.edges) if (e.kind === 'runs-on' && e.to.startsWith('host-')) hostOf.set(e.from, e.to);
  const deptOf = new Map<string, string>();
  for (const e of graph.edges) if (e.kind === 'member-of') deptOf.set(e.from, e.to);

  const containers: HContainer[] = [];
  const spine: HSpine[] = [];

  // ── Operator ────────────────────────────────────────────────────────
  const operator = nodes.find((n) => n.kind === 'operator');
  if (operator) {
    containers.push({
      type: 'container',
      id: 'k-operator',
      kind: 'operator',
      name: operator.name,
      sub: operator.blurb,
      icon: 'user-round',
      rows: [[node(operator, 'operator', 'start', 'operator · everything answers upward to here')]],
      facts: {},
    });
  }

  // ── The running OS ─────────────────────────────────────────────────
  const wizardNode = nodes.find((n) => n.kind === 'wizard');
  const engineNode = nodes.find((n) => n.id === ENGINE_ID);
  const departments = byKind('department');
  const agents = byKind('agent');
  const people = byKind('person');
  const deptGroups: HGroup[] = departments.map((d) => {
    const members = [...agents, ...people].filter((m) => deptOf.get(m.id) === d.id);
    const own = members.filter((m) => m.kind === 'agent');
    const live = own.filter((m) => m.status === 'live').length;
    return group(
      d.id,
      d.name,
      d.blurb,
      'department',
      'folder',
      members.map((m) => (m.kind === 'agent' ? node(m, 'agent', 'compact', agentSub(m)) : node(m, 'person', 'compact'))),
      3,
      { cols: 2, status: live > 0 ? 'live' : 'configured', badge: own.length ? `${live} of ${own.length} live` : 'no agent' },
    );
  });
  // agents/people that belong to no department still belong on the map
  const orphans = [...agents, ...people].filter((m) => !deptOf.has(m.id));
  if (orphans.length) deptGroups.push(group('dept-unassigned', 'Unassigned', 'no department yet', 'department', 'folder', orphans.map((m) => node(m, m.kind === 'agent' ? 'agent' : 'person', 'compact', m.kind === 'agent' ? agentSub(m) : m.blurb)), 3, { cols: 2, status: 'configured', badge: `${orphans.length}` }));

  const connectors = byKind('connector');
  const skills = byKind('skillpack');
  const stores = byKind('store').filter((s) => !hostOf.has(s.id));
  const surfaces = byKind('surface');
  const routers = byKind('router');
  const capability: HGroup[] = [];
  if (connectors.length) capability.push(group('g-connectors', 'Connectors', `${connectors.length} wired · ${connectors.filter((c) => c.status === 'live').length} connected`, 'connector', 'plug', connectors.map((c) => node(c, 'connector', 'compact', c.facts.kind || c.blurb)), 2, { cols: 3 }));
  if (skills.length) capability.push(group('g-skills', 'Skills', plural(skills.length, 'skill pack'), 'skill', 'sparkles', skills.map((s) => node(s, 'skill', 'compact')), 2, { cols: 3 }));
  if (stores.length) capability.push(group('g-stores', 'Stores', plural(stores.length, 'store'), 'store', 'database', stores.map((s) => node(s, 'store', 'compact', s.facts.path || s.blurb)), 2, { cols: 2 }));
  if (surfaces.length) capability.push(group('g-pages', 'Pages', `${surfaces.length} surfaces`, 'surface', 'layout-grid', surfaces.map((s) => node(s, 'surface', 'compact', s.facts.route || s.blurb)), 2, { cols: 4 }));

  const appRows: HItem[][] = [];
  if (wizardNode) {
    const row: HItem[] = [node(wizardNode, 'app', 'hero', wizardNode.blurb)];
    if (engineNode) row.push({ ...node(engineNode, 'command', 'hero', engineNode.blurb), satellite: true });
    appRows.push(row);
  }
  const routerDepartments: HNode | null = deptGroups.length
    ? { type: 'node', id: ROUTER_DEPARTMENTS, name: 'Department routing', sub: 'hands work to the owner', kind: 'router', status: 'live', shape: 'diamond', icon: 'route', facts: { rule: 'every agent belongs to one department; the Wizard hands a task to the agent whose department owns it' } }
    : null;
  if (routerDepartments) appRows.push([routerDepartments]);
  if (deptGroups.length) appRows.push(deptGroups);
  if (capability.length) appRows.push(capability);
  if (routers.length) appRows.push(routers.map((r) => node(r, 'router', 'diamond', r.blurb.split(': ')[1] ?? r.blurb)));
  if (appRows.length) {
    containers.push({
      type: 'container',
      id: APP_ID,
      kind: 'app',
      name: 'Founder OS',
      sub: 'the running OS · the Conductor commands agents · agents belong to departments · agents use tools',
      icon: 'layout-dashboard',
      rows: appRows,
      facts: { agents: String(agents.length), departments: String(departments.length), pages: String(surfaces.length) },
    });
  }

  // ── Machines: whatever the graph says runs on a host ────────────────
  const hosts = byKind('host');
  const daemons = byKind('daemon');
  const hostedStores = byKind('store').filter((s) => hostOf.has(s.id));
  for (const h of hosts) {
    const rows: HItem[][] = [];
    const myDaemons = daemons.filter((d) => hostOf.get(d.id) === h.id);
    const myStores = hostedStores.filter((s) => hostOf.get(s.id) === h.id);
    if (myDaemons.length) rows.push([group(`g-daemons-${h.id}`, 'Daemons', `${myDaemons.length} background processes · launchd`, 'daemon', 'play', myDaemons.map((d) => node(d, 'daemon', 'card', d.facts.schedule ? `${d.facts.schedule} · ${d.blurb}` : d.blurb)), 2, { cols: 2 })]);
    if (myStores.length) rows.push(myStores.map((s) => node(s, 'store', 'compact', s.facts.path || s.blurb)));
    if (!rows.length) continue;
    containers.push({ type: 'container', id: `k-${h.id}`, kind: 'machine', name: h.name, sub: h.blurb, icon: h.icon || 'server', rows, facts: h.facts });
  }

  // ── Cloud: the models the OS calls out to ───────────────────────────
  const models = byKind('model').filter((m) => m.id !== ENGINE_ID);
  if (models.length) {
    containers.push({
      type: 'container',
      id: CLOUD_ID,
      kind: 'cloud',
      name: 'Cloud',
      sub: 'AI compute the OS calls out to',
      icon: 'globe',
      rows: [[group('g-models', 'Models', `${models.length} generation models · identity routing decides which`, 'model', 'cpu', models.map((m) => node(m, 'model', 'external', m.facts.family ? `${m.facts.family}${m.facts.identity ? ` · ${m.facts.identity}` : ''}` : m.blurb)), 2, { cols: 4 })]],
      facts: {},
    });
  }

  // ── Structural edges (always drawn): each one exists in the graph ──
  const has = (from: string, to: string, kind?: BlueprintEdge['kind']) => graph.edges.some((e) => e.from === from && e.to === to && (!kind || e.kind === kind));
  if (operator && wizardNode && has(operator.id, wizardNode.id, 'commands')) spine.push({ from: operator.id, to: wizardNode.id, kind: 'hot', label: 'commands' });
  if (wizardNode && engineNode && has(wizardNode.id, engineNode.id, 'runs-on')) spine.push({ from: wizardNode.id, to: engineNode.id, kind: 'soft', label: 'runs on' });
  if (wizardNode && routerDepartments) spine.push({ from: wizardNode.id, to: ROUTER_DEPARTMENTS, kind: 'hot' });
  if (routerDepartments && deptGroups.length) spine.push({ from: ROUTER_DEPARTMENTS, to: deptGroups.map((d) => d.id), kind: 'hot', label: 'by ownership', bus: true });
  if (deptGroups.length && capability.length) {
    const usesAny = graph.edges.some((e) => e.kind === 'uses' && e.from.startsWith('agent-'));
    spine.push({ from: deptGroups[Math.floor((deptGroups.length - 1) / 2)].id, to: capability.map((c) => c.id), kind: 'soft', label: usesAny ? 'agents use' : undefined, bus: true });
  }
  const gsend = graph.edges.find((e) => e.from === 'router-deals' && e.to.startsWith('daemon-'));
  if (gsend && hostOf.has(gsend.to)) spine.push({ from: 'router-deals', to: gsend.to, kind: 'soft', label: gsend.via, gutter: 'right' });
  const identityToModel = graph.edges.find((e) => e.from === 'router-identity' && e.to.startsWith('model-'));
  if (identityToModel && models.length) spine.push({ from: 'router-identity', to: 'g-models', kind: 'soft', label: 'routes to', gutter: 'left' });

  // ── Relations (drawn on selection): every graph edge that is not containment
  const relations: HRelation[] = [];
  for (const e of graph.edges) {
    if (e.kind === 'member-of') continue; // department membership is the frame itself
    if (e.kind === 'runs-on' && e.to.startsWith('host-')) continue; // the machine container
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    relations.push({ from: e.from, to: e.to, kind: EDGE_LABEL[e.kind], via: e.via });
  }

  return { compiledAt: graph.compiledAt, containers, spine, relations };
}

// ── Index helpers ───────────────────────────────────────────────────────

export type HAny = HItem | HContainer;

export interface HierarchyIndex {
  items: Map<string, HAny>;
  parent: Map<string, string>;
  groups: HGroup[];
  leaves: HNode[];
  chain: (id: string) => string[];
  containerOf: (id: string) => string;
  /** every descendant item (groups included) of a group or container */
  descendants: (id: string) => HItem[];
  countLeaves: (g: HGroup) => number;
}

export function indexHierarchy(h: Hierarchy): HierarchyIndex {
  const items = new Map<string, HAny>();
  const parent = new Map<string, string>();
  const walk = (it: HItem, par: string) => {
    items.set(it.id, it);
    parent.set(it.id, par);
    if (it.type === 'group') it.children.forEach((c) => walk(c, it.id));
  };
  for (const c of h.containers) {
    items.set(c.id, c);
    c.rows.forEach((row) => row.forEach((it) => walk(it, c.id)));
  }
  const chain = (id: string) => {
    const out: string[] = [];
    let p: string | undefined = id;
    while (p) {
      out.unshift(p);
      p = parent.get(p);
    }
    return out;
  };
  const collect = (it: HItem): HItem[] => (it.type === 'group' ? it.children.flatMap((c) => (c.type === 'group' ? [c, ...collect(c)] : [c])) : []);
  const descendants = (id: string): HItem[] => {
    const it = items.get(id);
    if (!it) return [];
    if (it.type === 'container') return it.rows.flat().flatMap((c) => (c.type === 'group' ? [c, ...collect(c)] : [c]));
    return collect(it);
  };
  const countLeaves = (g: HGroup): number => g.children.reduce((a, c) => a + (c.type === 'group' ? countLeaves(c) : 1), 0);
  const groups = [...items.values()].filter((i): i is HGroup => i.type === 'group');
  const leaves = [...items.values()].filter((i): i is HNode => i.type === 'node');
  return { items, parent, groups, leaves, chain, containerOf: (id) => chain(id)[0], descendants, countLeaves };
}

export interface HRelationHit extends HRelation {
  other: string;
  dir: 'in' | 'out';
}

/** Relations that cross the boundary of `id` (a node, a group or a container). */
export function relationsOf(h: Hierarchy, idx: HierarchyIndex, id: string): HRelationHit[] {
  const inside = new Set<string>([id, ...idx.descendants(id).map((d) => d.id)]);
  const out: HRelationHit[] = [];
  for (const r of h.relations) {
    const a = inside.has(r.from);
    const b = inside.has(r.to);
    if (a === b) continue;
    out.push({ ...r, other: a ? r.to : r.from, dir: a ? 'out' : 'in' });
  }
  return out;
}

/** Groups open at a disclosure level. */
export function expandedAtLevel(idx: HierarchyIndex, level: 1 | 2 | 3): Set<string> {
  return new Set(idx.groups.filter((g) => g.level <= level).map((g) => g.id));
}

export interface SearchHit {
  id: string;
  name: string;
  sub: string;
  kind: HKind;
  type: 'node' | 'group';
  path: string;
}

/** ⌘K search: names, sublines and facts; an empty query lists the groups + the spine. */
export function searchHierarchy(idx: HierarchyIndex, query: string, limit = 16): SearchHit[] {
  const q = query.trim().toLowerCase();
  const all = [...idx.items.values()].filter((i): i is HItem => i.type !== 'container');
  const text = (i: HItem) => `${i.name} ${i.sub} ${i.type === 'node' ? Object.values(i.facts).join(' ') : ''}`.toLowerCase();
  let hits = q
    ? all.filter((i) => text(i).includes(q)).sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)))
    : all.filter((i) => i.type === 'group' || i.kind === 'app' || i.kind === 'command' || i.kind === 'router' || i.kind === 'operator');
  hits = hits.slice(0, limit);
  return hits.map((i) => ({
    id: i.id,
    name: i.name,
    sub: i.sub,
    kind: i.kind,
    type: i.type,
    path: idx
      .chain(i.id)
      .slice(0, -1)
      .map((p) => idx.items.get(p)?.name ?? p)
      .join(' › '),
  }));
}

/** Text match used by live dimming while typing (groups match when a child does). */
export function matchesQuery(idx: HierarchyIndex, id: string, q: string): boolean {
  const it = idx.items.get(id);
  if (!it || it.type === 'container') return false;
  const txt = (x: HItem) => `${x.name} ${x.sub}`.toLowerCase();
  if (txt(it).includes(q)) return true;
  return it.type === 'group' && idx.descendants(id).some((d) => txt(d).includes(q));
}

export function matchesKind(idx: HierarchyIndex, id: string, kind: HKind): boolean {
  const it = idx.items.get(id);
  if (!it || it.type === 'container') return false;
  if (it.type === 'group') return it.kind === kind || idx.descendants(id).some((d) => d.kind === kind);
  return it.kind === kind;
}

/** What the ask bar hands the analyst: the selected scope, its chain, members and relations. */
export function describeScope(h: Hierarchy, idx: HierarchyIndex, id: string | null): Record<string, unknown> {
  if (!id || !idx.items.has(id)) {
    return {
      scope: 'the whole system',
      containers: h.containers.map((c) => ({ name: c.name, what: c.sub, holds: c.rows.flat().map((g) => (g.type === 'group' ? `${g.name} (${idx.countLeaves(g)})` : g.name)) })),
    };
  }
  const it = idx.items.get(id)!;
  const brief = (x: HAny) => ({
    name: x.name,
    kind: KIND_LABEL[x.kind],
    status: x.type === 'node' ? STATUS_LABEL[x.status] : x.type === 'group' && x.status ? STATUS_LABEL[x.status] : undefined,
    what: x.sub,
    facts: x.type === 'node' && Object.keys(x.facts).length ? x.facts : undefined,
  });
  const inside = idx
    .descendants(id)
    .filter((d) => d.type === 'node')
    .slice(0, 60)
    .map(brief);
  const rels = relationsOf(h, idx, id)
    .map((r) => {
      const other = idx.items.get(r.other);
      return other ? `${r.dir === 'out' ? '→' : '←'} ${r.via || r.kind}: ${other.name} (${KIND_LABEL[other.kind]}${other.type === 'node' ? `, ${STATUS_LABEL[other.status]}` : ''})` : null;
    })
    .filter(Boolean)
    .slice(0, 60);
  return {
    scope: it.name,
    path: idx
      .chain(id)
      .map((p) => idx.items.get(p)?.name ?? p)
      .join(' › '),
    item: brief(it),
    inside: inside.length ? inside : undefined,
    relations: rels.length ? rels : undefined,
  };
}
