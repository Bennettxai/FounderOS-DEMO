/**
 * Nik's life map: the radial taxonomy at the heart of the OS.
 * Center = Nik's work; ring 1 = color-coded life areas; ring 2 = the
 * modules inside each area. Field Ops additionally carries the contact
 * tier system — the numbered/colored response-priority ladder.
 *
 * This is the one place colors enter the otherwise black & white OS:
 * each life area owns a hue, and everything underneath inherits it.
 */
import type { LifeMap, LifeMapNode } from '@/lib/schemas';

export type LifeModule = { id: string; label: string; detail: string };

export type LifeArea = {
  id: string;
  label: string;
  color: string;
  detail: string;
  modules: LifeModule[];
  agents: string[]; // RuntimeAgent ids working this area
  brainFolders: string[]; // brain folders feeding this area
  departmentIds: string[]; // seeded departments that roll up to this area
};

export const LIFE_AREAS: LifeArea[] = [
  {
    id: 'diagmaps',
    label: 'Diagnostic Maps',
    color: '#3b82f6',
    detail: 'The canonical TL-DM fleet — every model, one map.',
    modules: [
      { id: 'canonicals', label: 'Canonicals', detail: 'Final maps per family, mirrored and verified.' },
      { id: 'guided-walks', label: 'Guided walks', detail: 'The step-by-step troubleshooting flows.' },
      { id: 'fleet', label: 'Fleet gate', detail: 'Dashboard that never drifts from the canon.' },
      { id: 'service-matters', label: 'ServiceMatters', detail: 'Job-aid corpus and reference extraction.' },
    ],
    agents: ['map-builder', 'guided-qa', 'fleet-coverage'],
    brainFolders: ['canonical-maps', 'reference'],
    departmentIds: ['dept-diagmaps'],
  },
  {
    id: 'fieldops',
    label: 'Field Ops',
    color: '#ef4444',
    detail: 'OpenFieldPro: the field-service platform.',
    modules: [
      { id: 'work-orders', label: 'Work orders', detail: 'Job intake, dispatch, and execution.' },
      { id: 'invoicing', label: 'Invoicing', detail: 'Estimates, invoices, and accounts receivable.' },
      { id: 'release', label: 'Release', detail: 'The release checklist to production.' },
      { id: 'clients', label: 'Clients', detail: 'Tagged contacts with response tiers.' },
    ],
    agents: ['fieldops-agent', 'release-gate', 'ops-data'],
    brainFolders: ['projects'],
    departmentIds: ['dept-fieldops'],
  },
  {
    id: 'dev',
    label: 'Development',
    color: '#22c55e',
    detail: 'Code, tests, and repo health.',
    modules: [
      { id: 'code', label: 'Code', detail: 'Features and fixes across the repos.' },
      { id: 'tests', label: 'Tests', detail: 'The suite that has to stay green.' },
      { id: 'repos', label: 'Repos', detail: 'Branch hygiene and commit cadence.' },
    ],
    agents: ['dev-agent', 'code-worker', 'test-worker'],
    brainFolders: ['projects'],
    departmentIds: ['dept-dev'],
  },
  {
    id: 'research',
    label: 'Research',
    color: '#a855f7',
    detail: 'Bounties, SurfSense, and the knowledge base.',
    modules: [
      { id: 'bounties', label: 'Bounties', detail: 'Real, payable GitHub bounties — scams quarantined.' },
      { id: 'surfsense', label: 'SurfSense', detail: 'RAG research over personal sources.' },
      { id: 'brain', label: 'Knowledge base', detail: 'Canonical maps, docs, knowledge graph.' },
    ],
    agents: ['research-agent', 'bounty-radar', 'surf-research', 'data-agent'],
    brainFolders: ['*'],
    departmentIds: ['dept-research'],
  },
  {
    id: 'models',
    label: 'Models',
    color: '#06b6d4',
    detail: 'Local inference, eval, and training.',
    modules: [
      { id: 'inference', label: 'Inference', detail: 'llama.cpp and Ollama serving.' },
      { id: 'evals', label: 'Evals', detail: 'Fixed-budget benchmarks on local models.' },
      { id: 'training', label: 'Training', detail: 'OneTrainer workspaces and checkpoints.' },
    ],
    agents: ['models-agent', 'eval-runner', 'training-run'],
    brainFolders: ['models'],
    departmentIds: ['dept-models'],
  },
  {
    id: 'picks',
    label: 'Picks',
    color: '#f59e0b',
    detail: 'Brainz pick bots: sports, trading, health.',
    modules: [
      { id: 'sports', label: 'Sports', detail: 'SportsClaw picks with research briefs.' },
      { id: 'trading', label: 'Trading', detail: 'TradingDesk picks with research briefs.' },
      { id: 'health', label: 'Ecosystem', detail: 'SysBot run-record health.' },
    ],
    agents: ['picks-agent', 'sportsclaw', 'tradingdesk', 'sysbot'],
    brainFolders: ['picks'],
    departmentIds: ['dept-picks'],
  },
  {
    id: 'operations',
    label: 'Operations',
    color: '#fafafa',
    detail: 'The machine that runs the machine.',
    modules: [
      { id: 'cron', label: 'Cron', detail: 'The Hermes scheduled-job grid.' },
      { id: 'github', label: 'GitHub', detail: 'Auth and remotes for every repo.' },
      { id: 'drift', label: 'Drift', detail: 'Uncommitted-change sentinel.' },
      { id: 'orchestrator', label: 'Orchestrator', detail: 'Broadcast fan-out and instance hosts.' },
    ],
    agents: ['ops-agent', 'cron-health', 'github-agent', 'drift-sentinel', 'conductor'],
    brainFolders: ['ops', 'org'],
    departmentIds: ['dept-ops'],
  },
];

export type ContactTier = {
  tier: number;
  label: string;
  color: string;
  respond: string;
  tags: string[];
};

/**
 * The response-priority ladder for the people in the loop.
 * 1 = red (clients & field customers), 2 = yellow (partners), 3 = green (personal).
 * Specific people get overrides via the contact_tags table.
 */
export const CONTACT_TIERS: ContactTier[] = [
  { tier: 1, label: 'Priority 1', color: '#ef4444', respond: 'ASAP', tags: ['client', 'student'] },
  { tier: 2, label: 'Priority 2', color: '#eab308', respond: 'same day', tags: ['brand', 'partner', 'lead'] },
  { tier: 3, label: 'Priority 3', color: '#22c55e', respond: 'when free', tags: ['personal', 'friend', 'community'] },
];

export function lifeAreaForDepartment(departmentId: string): LifeArea | null {
  return LIFE_AREAS.find((a) => a.departmentIds.includes(departmentId)) ?? null;
}

export function buildLifeMap(): LifeMap {
  const nodes: LifeMapNode[] = [
    {
      id: 'center',
      type: 'center',
      label: "Nik's OS",
      color: '#fafafa',
      parent: null,
      detail: 'The core. Everything orbits this.',
      agents: [],
      brainFolders: [],
    },
  ];
  const edges: LifeMap['edges'] = [];

  for (const area of LIFE_AREAS) {
    nodes.push({
      id: area.id,
      type: 'area',
      label: area.label,
      color: area.color,
      parent: 'center',
      detail: area.detail,
      agents: area.agents,
      brainFolders: area.brainFolders,
    });
    edges.push({ source: 'center', target: area.id });

    for (const mod of area.modules) {
      const id = `${area.id}/${mod.id}`;
      nodes.push({
        id,
        type: 'module',
        label: mod.label,
        color: area.color,
        parent: area.id,
        detail: mod.detail,
        agents: [],
        brainFolders: [],
      });
      edges.push({ source: area.id, target: id });
    }
  }

  // the contact priority ladder hangs off client management under Field Ops
  for (const t of CONTACT_TIERS) {
    const id = `tier-${t.tier}`;
    nodes.push({
      id,
      type: 'tier',
      label: `T${t.tier} ${t.label}`,
      color: t.color,
      parent: 'fieldops/clients',
      detail: `${t.tags.join(', ')} — respond ${t.respond}`,
      agents: [],
      brainFolders: [],
    });
    edges.push({ source: 'fieldops/clients', target: id });
  }

  return { nodes, edges };
}
