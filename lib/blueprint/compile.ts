import type { FounderDb } from '@/lib/db';
import { realAgents } from '@/lib/agents/real';
import { allConnectorStatuses } from '@/lib/connectors';
import { llmStatus, modelChain } from '@/lib/connectors/llm';
import type { ConnectorStatus } from '@/lib/connectors/types';
import { NAV_OPERATE, NAV_AGENTS, NAV_INTELLIGENCE, NAV_SYSTEM, NAV_LIBRARY, type NavItem } from '@/lib/nav';
import {
  BlueprintGraphSchema,
  validateGraph,
  type BlueprintEdge,
  type BlueprintGraph,
  type BlueprintNode,
} from '@/lib/blueprint/graph';

/**
 * The compiler: assembles the Blueprint graph from the operator's REAL registries
 * so the map can never drift from the system. Adding an agent, connector or
 * skill changes the graph with zero edits here. Tests enforce that every
 * registered thing appears (completeness) and validateGraph enforces that
 * every edge lands on a real node (honesty).
 *
 * Imported from the donor OS and re-pointed: the runtime registry is
 * lib/agents/real, the engine is the Vercel AI Gateway (lib/connectors/llm),
 * the stores are the SQLite files under data/ plus the Notion hub and the
 * federated brain, and the daemons are the ones this OS actually names.
 */

const OPERATOR_NAME = process.env.FOUNDER_OPERATOR_NAME?.trim() || 'the operator';

/** Static infrastructure inventory: the only hand-listed layer, because hosts
 *  live outside this repo's registries. Keep tiny and factual. */
const HOSTS: BlueprintNode[] = [
  { id: 'host-workstation', kind: 'host', name: 'Workstation', layer: 4, status: 'live', blurb: 'Where the OS is built and operated; the dev server and the local CLIs run here.', facts: {}, icon: 'laptop' },
  { id: 'host-railway', kind: 'host', name: 'Railway', layer: 4, status: 'configured', blurb: 'The production service (Dockerfile from GitHub) with a persistent volume at DATA_DIR. Reachability is not probed at compile time.', facts: { platform: 'Railway' }, icon: 'server' },
];

const STORES: BlueprintNode[] = [
  { id: 'store-db', kind: 'store', name: 'OS database', layer: 4, status: 'live', blurb: 'Agents, runs, departments, workflows, crons, metrics (SQLite).', facts: { path: 'data/founder-os.db' }, icon: 'database' },
  { id: 'store-ledger', kind: 'store', name: 'Ledger', layer: 4, status: 'live', blurb: 'Statement events and income by business (SQLite).', facts: { path: 'data/ledger.db' }, icon: 'database' },
  { id: 'store-bank', kind: 'store', name: 'Bank', layer: 4, status: 'live', blurb: 'Uploaded statements and the bank line items (SQLite).', facts: { path: 'data/bank.db' }, icon: 'database' },
  { id: 'store-candles', kind: 'store', name: 'Candles', layer: 4, status: 'live', blurb: 'Crypto and ETF candles the trading backtests read.', facts: { path: 'data/candles/' }, icon: 'list' },
  {
    id: 'store-brain',
    kind: 'store',
    name: 'Brain store',
    layer: 4,
    status: 'live',
    blurb: 'The knowledge base G-Brain retrieves from, via the configured brain provider.',
    // Static, honest facts: the provider may shell a CLI, so its live status is
    // NOT polled here; that would mean this page's compile spawns a subprocess
    // on every request.
    facts: { provider: process.env.BRAIN_PROVIDER ?? 'federated', note: 'status not polled at compile time' },
    icon: 'book-open',
  },
  { id: 'store-notion-deals', kind: 'store', name: 'Notion Brand Deals Hub', layer: 4, status: 'live', blurb: 'The sponsorship pipeline. Notion stays the source of truth; the OS reads it.', facts: { source: 'Notion data source' }, icon: 'handshake' },
  { id: 'store-ad-intel', kind: 'store', name: 'Ad intel', layer: 4, status: 'live', blurb: "Adscout's synced ads, signals and saves.", facts: { path: 'data/ad-intel/' }, icon: 'radar' },
];

/** Honest inventory of the background processes this OS names. None is
 *  verified from a compile, so none claims 'live' here: 'configured' when its
 *  wiring is present on this host, 'not-configured' when it is not. */
function daemons(): BlueprintNode[] {
  const has = (k: string) => Boolean(process.env[k]?.trim());
  return [
    {
      id: 'daemon-cron',
      kind: 'daemon',
      name: 'Cron scheduler',
      layer: 4,
      status: 'configured',
      blurb: 'Runs the agent crons on schedule and records every run in cron_runs. Ticks on /api/cron/tick; whether the tick is being called is visible on /workflows, not here.',
      facts: { tick: '/api/cron/tick' },
      icon: 'sunrise',
    },
    {
      id: 'daemon-analytics-refresh',
      kind: 'daemon',
      name: 'Analytics refresh',
      layer: 4,
      status: 'configured',
      blurb: 'The 15-minute sweep that snapshots metrics so /analytics never pays a live call per render.',
      facts: { cadence: 'every 15 min' },
      icon: 'radar',
    },
    {
      id: 'daemon-hermes',
      kind: 'daemon',
      name: 'Hermes gateway',
      layer: 4,
      status: has('HERMES_GATEWAY_URL') ? 'configured' : 'not-configured',
      blurb: has('HERMES_GATEWAY_URL') ? 'Gateway URL set; the dashboard tab on /agents talks to it. Not probed at compile time.' : 'HERMES_GATEWAY_URL is unset on this host.',
      facts: {},
      icon: 'send',
    },
    {
      id: 'daemon-telegram',
      kind: 'daemon',
      name: 'Telegram bridge',
      layer: 4,
      status: has('TELEGRAM_BOT_TOKEN') ? 'configured' : 'not-configured',
      blurb: has('TELEGRAM_BOT_TOKEN') ? 'The front door from a phone: a message becomes a comment on the cockpit issue and wakes the Conductor.' : 'TELEGRAM_BOT_TOKEN is unset on this host.',
      facts: {},
      icon: 'message-circle',
    },
  ];
}

const KIND_ICON: Record<string, string> = {
  agent: 'bot',
  department: 'folder',
  connector: 'plug',
  model: 'cpu',
  skillpack: 'sparkles',
  person: 'user-round',
};

/** Honest tool->connector matches only. A tool with no real connector check
 *  behind it (openclaw, remotion, higgsfield, supabase, ...) stays a fact on
 *  the agent, never a fabricated edge. Keys are the tool slugs agents carry;
 *  values are ids in lib/connectors CHECKS. */
const TOOL_TO_CONNECTOR: Record<string, string> = {
  gmail: 'email',
  imap: 'email',
  calendar: 'calendar',
  attio: 'attio',
  ledger: 'attio',
  zernio: 'zernio',
  postly: 'zernio',
  beehiiv: 'beehiiv',
  newsletter: 'beehiiv',
  stripe: 'payments',
  paypal: 'payments',
  square: 'payments',
  gbrain: 'gbrain',
  'brain-store': 'gbrain',
  tmux: 'local-stack',
  slack: 'slack',
  whatsapp: 'whatsapp',
  trakyo: 'trakyo',
  fathom: 'fathom',
  recall: 'fathom',
  plaud: 'plaud',
  ghl: 'ghl',
  arcads: 'arcads',
  adsmith: 'arcads',
  wispr: 'wispr',
};

/** One node per OS page in the nav: the surface layer. Icon names match the
 *  canvas's own Lucide-language map (see components/blueprint/icons.ts). */
const SURFACE_ICON: Record<string, string> = {
  '/': 'home',
  '/comms': 'message-square',
  '/funnel': 'filter',
  '/workflows': 'workflow',
  '/social': 'share-2',
  '/content': 'clapperboard',
  '/brand-deals': 'handshake',
  '/finances': 'wallet',
  '/trading': 'bar-chart-3',
  '/adpilot': 'crosshair',
  '/agents': 'users',
  '/chats': 'messages-square',
  '/tasks': 'list-checks',
  '/skills': 'sparkles',
  '/org': 'network',
  '/blueprint': 'waypoints',
  '/brain': 'brain',
  '/doctor': 'wrench',
  '/integrations': 'plug',
  '/usage': 'radar',
  '/roadmap': 'map',
  '/analytics': 'bar-chart-3',
  '/reference': 'layout-grid',
  '/personas': 'layers',
};

/** Obvious surface->store reads. Every other surface is honestly just a node
 *  with no fabricated data edge. */
const SURFACE_STORE_EDGES: Record<string, string[]> = {
  '/brain': ['store-brain'],
  '/finances': ['store-ledger', 'store-bank'],
  '/trading': ['store-candles'],
  '/brand-deals': ['store-notion-deals'],
  '/adpilot': ['store-ad-intel'],
};

const ALL_NAV: NavItem[] = [...NAV_OPERATE, ...NAV_AGENTS, ...NAV_INTELLIGENCE, ...NAV_SYSTEM, ...NAV_LIBRARY];

function surfaceSlug(href: string): string {
  return href === '/' ? 'home' : href.replace(/^\//, '').replace(/\//g, '-');
}

function connectorStatusToNode(status: ConnectorStatus): BlueprintNode {
  const map: Record<string, BlueprintNode['status']> = {
    connected: 'live',
    not_configured: 'not-configured',
    error: 'configured',
  };
  return {
    id: `connector-${status.id}`,
    kind: 'connector',
    name: status.name,
    layer: 3,
    status: map[status.state] ?? 'configured',
    blurb: status.detail.slice(0, 140),
    facts: { kind: status.kind },
    icon: 'plug',
  };
}

export type CompileOptions = {
  /** Injected statuses (tests, or a caller that already fetched them). Defaults to the live fan-out. */
  connectors?: ConnectorStatus[];
  llm?: ConnectorStatus;
};

export async function compileBlueprint(db: FounderDb, opts: CompileOptions = {}): Promise<BlueprintGraph> {
  const nodes: BlueprintNode[] = [];
  const edges: BlueprintEdge[] = [];
  const runtimeIds = new Set(realAgents.map((a) => a.id));
  const agents = db.agents.all();
  const departments = db.departments.all();
  const skills = db.skills.all();
  const people = db.people.all();

  // Fetched early so the agent loop below can wire honest tool->connector
  // edges without a second pass.
  const connectors = opts.connectors ?? (await allConnectorStatuses());
  const connectorNodeIds = new Set(connectors.map((c) => `connector-${c.id}`));

  // L0 + L1: the spine.
  nodes.push({ id: 'operator', kind: 'operator', name: OPERATOR_NAME, layer: 0, status: 'live', blurb: 'The operator. Everything answers upward to here.', facts: {}, icon: 'user-round' });
  const conductor = agents.find((a) => a.id === 'conductor');
  nodes.push({
    id: 'agent-conductor',
    kind: 'wizard',
    name: 'Conductor',
    layer: 1,
    status: 'live',
    blurb: conductor?.description.slice(0, 140) ?? 'The super agent: talks to everything, routes to everyone.',
    facts: conductor ? { role: conductor.role, model: conductor.model } : {},
    icon: 'wand-2',
  });
  edges.push({ from: 'operator', to: 'agent-conductor', kind: 'commands' });

  // L2: departments + agents from the DB, bound against the runtime registry.
  // A seeded agent with no runtime is honestly 'designed'; a wired one that is
  // not active on the roster is 'configured', never 'live'.
  for (const d of departments) {
    nodes.push({ id: `dept-${d.slug}`, kind: 'department', name: d.name, layer: 2, status: 'live', blurb: d.tagline, facts: {}, icon: KIND_ICON.department });
  }
  for (const a of agents) {
    if (a.id === 'conductor') continue; // already the L1 spine node
    const wired = runtimeIds.has(a.id);
    const planned = a.status === 'planned';
    const status: BlueprintNode['status'] = planned || !wired ? 'designed' : a.status === 'active' ? 'live' : 'configured';
    nodes.push({
      id: `agent-${a.id}`,
      kind: 'agent',
      name: a.name,
      layer: 2,
      status,
      blurb: a.description.slice(0, 140),
      facts: { role: a.role, model: a.model, tools: a.tools.join(', '), tier: a.tier, roster: a.status },
      icon: KIND_ICON.agent,
    });
    edges.push({ from: 'agent-conductor', to: `agent-${a.id}`, kind: 'commands' });
    const dept = departments.find((d) => d.id === a.departmentId);
    if (dept) edges.push({ from: `agent-${a.id}`, to: `dept-${dept.slug}`, kind: 'member-of' });

    // Honest agent->connector `uses` edges: only tools with a real connector
    // behind them get an edge; everything else stays a fact on the node.
    const seen = new Set<string>();
    for (const tool of a.tools) {
      const connectorId = TOOL_TO_CONNECTOR[tool];
      const nodeId = connectorId ? `connector-${connectorId}` : undefined;
      if (nodeId && connectorNodeIds.has(nodeId) && !seen.has(nodeId)) {
        seen.add(nodeId);
        edges.push({ from: `agent-${a.id}`, to: nodeId, kind: 'uses' });
      }
    }
  }
  for (const p of people) {
    nodes.push({ id: `person-${p.id}`, kind: 'person', name: p.name, layer: 2, status: 'live', blurb: p.role, facts: {}, icon: KIND_ICON.person });
    const dept = departments.find((d) => d.id === p.departmentId);
    if (dept) edges.push({ from: `person-${p.id}`, to: `dept-${dept.slug}`, kind: 'member-of' });
  }

  // The engine the Conductor and every chat actually run on: the AI Gateway.
  const llm = opts.llm ?? (await llmStatus());
  const engineUp = llm.state === 'connected';
  nodes.push({
    id: 'model-claude-engine',
    kind: 'model',
    name: 'AI Gateway',
    layer: 3,
    status: engineUp ? 'live' : 'not-configured',
    blurb: llm.detail.slice(0, 140),
    facts: { via: 'Vercel AI Gateway', chain: modelChain().join(' > ') },
    icon: 'cpu',
  });
  edges.push({ from: 'agent-conductor', to: 'model-claude-engine', kind: 'runs-on' });

  // L3: skills, connectors (live statuses), the model chain the gateway walks.
  for (const s of skills) {
    nodes.push({ id: `skill-${s.id}`, kind: 'skillpack', name: s.name, layer: 3, status: 'live', blurb: (s as { description?: string }).description?.slice(0, 120) ?? '', facts: {}, icon: KIND_ICON.skillpack });
  }
  for (const c of connectors) nodes.push(connectorStatusToNode(c));
  for (const id of modelChain()) {
    nodes.push({
      id: `model-${id.replace(/[^a-z0-9]+/gi, '-')}`,
      kind: 'model',
      name: id,
      layer: 3,
      status: engineUp ? 'live' : 'not-configured',
      blurb: 'In the gateway fallback chain: tried in order when the preferred model is refused.',
      facts: { id },
      icon: KIND_ICON.model,
    });
  }

  // L3: surface nodes, one per OS page, wired to the stores named as obvious
  // reads. Every other surface is honestly bare.
  for (const item of ALL_NAV) {
    const slug = surfaceSlug(item.href);
    nodes.push({
      id: `surface-${slug}`,
      kind: 'surface',
      name: item.label,
      layer: 3,
      status: 'live',
      blurb: `OS page at ${item.href}.`,
      facts: { route: item.href },
      icon: SURFACE_ICON[item.href] ?? 'square',
    });
    for (const storeId of SURFACE_STORE_EDGES[item.href] ?? []) {
      edges.push({ from: `surface-${slug}`, to: storeId, kind: 'uses' });
    }
  }

  // L4: infrastructure.
  const DAEMONS = daemons();
  nodes.push(...HOSTS, ...STORES, ...DAEMONS);
  for (const s of ['store-db', 'store-ledger', 'store-bank', 'store-candles']) edges.push({ from: s, to: 'host-workstation', kind: 'runs-on' });
  for (const d of DAEMONS) edges.push({ from: d.id, to: 'host-workstation', kind: 'runs-on' });

  // The one routing diamond with a real rule behind it: sponsorship deals.
  nodes.push({
    id: 'router-deals',
    kind: 'router',
    name: 'Deal routing',
    layer: 3,
    status: 'live',
    blurb: 'Deal routing: inbound sponsor messages land in the Notion hub, the brand-deal agents draft there, the board reads it back.',
    facts: { rule: 'Notion is the source of truth; the OS never writes a deal, only reads the hub' },
    icon: 'route',
  });
  edges.push({ from: 'surface-comms', to: 'router-deals', kind: 'uses', via: 'inbound' });
  edges.push({ from: 'surface-brand-deals', to: 'router-deals', kind: 'uses', via: 'board' });
  edges.push({ from: 'router-deals', to: 'store-notion-deals', kind: 'uses', via: 'Notion hub' });

  const graph = BlueprintGraphSchema.parse({ compiledAt: new Date().toISOString(), nodes, edges });
  const problems = validateGraph(graph);
  if (problems.length > 0) throw new Error(`blueprint graph invalid: ${problems.join('; ')}`);
  return graph;
}
