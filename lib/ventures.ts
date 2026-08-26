/**
 * Nik's two active ventures — the venture lens over the OS.
 *
 * One database, one knowledge base, one agent roster: ventures never partition
 * the data. They are saved filters — each one names the agents that serve it
 * per life area and the current executive focus. Switching venture in the
 * hierarchy or life map swaps which crew lights up; the agents themselves keep
 * full visibility of everything.
 */
import type { LifeArea } from '@/lib/life-map';
import { LIFE_AREAS } from '@/lib/life-map';

export type Venture = {
  id: string;
  label: string;
  kind: string;
  color: string;
  detail: string;
  /** Tag that marks this venture's pages inside the single shared knowledge base. */
  brainTag: string;
  /** Current executive priorities — edit freely, this is Nik's list. */
  focus: string[];
  /** life-area id → the agents working that area FOR this venture. */
  areaAgents: Record<string, string[]>;
};

const SHARED_OPS = ['conductor', 'cron-health', 'github-agent', 'drift-sentinel'];
const SHARED_KNOWLEDGE = ['data-agent', 'surf-research'];

export const VENTURES: Venture[] = [
  {
    id: 'diagnostic-maps',
    label: 'Diagnostic Maps',
    kind: 'Field diagnostic content',
    // Deep teal — distinct from every life-area hue.
    color: '#0d9488',
    detail: 'The canonical TL-DM fleet and its release dashboard.',
    brainTag: 'diagnostic-maps',
    focus: [
      'Fleet stays current — every model covered and verified',
      'Guided walks audited: no duplication, no dead-ends',
      'Fleet dashboard never drifts from the canonical fleet',
    ],
    areaAgents: {
      diagmaps: ['map-builder', 'guided-qa', 'fleet-coverage'],
      research: ['data-agent', 'surf-research'],
      operations: SHARED_OPS,
    },
  },
  {
    id: 'openfieldpro',
    label: 'OpenFieldPro',
    kind: 'Field-service platform',
    // Spring green — the platform's fresh start.
    color: '#00ffaa',
    detail: 'The self-hosted field-service management platform.',
    brainTag: 'openfieldpro',
    focus: [
      'Release checklist closed — production release clear',
      'Lead-to-payment spine verified across the stack',
      'Live ops data flowing from the Postgres/Fastify core',
    ],
    areaAgents: {
      fieldops: ['fieldops-agent', 'release-gate', 'ops-data'],
      dev: ['dev-agent', 'code-worker', 'test-worker'],
      research: ['data-agent'],
      operations: SHARED_OPS,
    },
  },
];

export function getVenture(id: string): Venture | null {
  return VENTURES.find((v) => v.id === id) ?? null;
}

/** Every agent serving a venture, across all its life areas. */
export function ventureAgentSet(ventureId: string): Set<string> {
  const v = getVenture(ventureId);
  return new Set(v ? Object.values(v.areaAgents).flat() : []);
}

/** Which ventures an agent works for (shared infra agents serve all). */
export function venturesForAgent(agentId: string): Venture[] {
  return VENTURES.filter((v) => Object.values(v.areaAgents).flat().includes(agentId));
}

export function ventureLifeAreas(venture: Venture): LifeArea[] {
  return LIFE_AREAS.filter((a) => venture.areaAgents[a.id]);
}
