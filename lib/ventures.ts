/**
 * Alex's two active income sources — the venture lens over the OS.
 *
 * One database, one G-Brain, one agent roster: ventures never partition the
 * data. They are saved filters — each one names the agents that serve it per
 * life area, the brain tag that marks its pages, and the current executive
 * focus. Switching venture in the hierarchy or life map swaps which crew
 * lights up; the agents themselves keep full visibility of everything.
 *
 * Personal Brand (brand-deals) was retired from this lens — the OS
 * focuses on Vantage (the agency) and Launchpad Cohort (the mentorship).
 */
import type { LifeArea } from '@/lib/life-map';
import { LIFE_AREAS } from '@/lib/life-map';

export type Venture = {
  id: string;
  label: string;
  kind: string;
  color: string;
  detail: string;
  /** Tag that marks this venture's pages inside the single shared G-Brain. */
  brainTag: string;
  /** Current executive priorities — edit freely, this is Alex's list. */
  focus: string[];
  /** life-area id → the agents working that area FOR this venture. */
  areaAgents: Record<string, string[]>;
};

const SHARED_OPS = ['conductor', 'stack-monitor'];
const SHARED_KNOWLEDGE = ['data-agent', 'markdown-auditor', 'vector-auditor'];

export const VENTURES: Venture[] = [
  {
    id: 'vantage',
    label: 'Vantage',
    kind: 'AI agency',
    // Brand green sampled from the Vantage logo.
    color: '#00ffaa',
    detail: 'Client AI builds and delivery — the agency arm.',
    brainTag: 'vantage',
    focus: [
      'Active client builds shipped on schedule',
      'Pipeline: proposals out, deals advanced in Ledger',
      'Delivery quality — every handoff documented in G-Brain',
    ],
    areaAgents: {
      marketing: ['social-agent', 'postly-publisher', 'reelkit-editor', 'renderly-creative'],
      sales: ['vantage-sales', 'vantage-paykit', 'sales-agent', 'sales-calls-data'],
      communication: ['comms-agent', 'gmail-worker', 'slack-worker', 'crm-pulse'],
      finances: ['payments-pulse', 'stripe-sales', 'processor-confirmation'],
      knowledge: [...SHARED_KNOWLEDGE],
      operations: SHARED_OPS,
    },
  },
  {
    id: 'launchpad-cohort',
    label: 'Launchpad Cohort',
    kind: 'Mentorship program',
    // Brand crimson — hsl(355 70% 50%) from the live LC site theme + brand guide.
    color: '#d9263f',
    detail: 'The mentorship — students, curriculum, community.',
    brainTag: 'launchpad-cohort',
    focus: [
      'Student results — track wins, unblock stuck students fast',
      'Content + newsletter cadence for enrollment',
      'Community pulse on WhatsApp; T1 response times hold',
    ],
    areaAgents: {
      marketing: ['social-agent', 'adsmith-creative', 'postly-publisher', 'dmflow-mcp', 'reelkit-editor'],
      sales: ['launchpad-cohort-sales', 'paykit-sales', 'sales-agent', 'sales-calls-data'],
      communication: ['whatsapp-worker', 'gmail-worker', 'comms-agent', 'crm-pulse'],
      finances: ['payments-pulse', 'stripe-sales', 'flexpay-financing', 'processor-confirmation'],
      knowledge: SHARED_KNOWLEDGE,
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
  return VENTURES.filter((v) => ventureAgentSet(v.id).has(agentId));
}

/** Agents on one life area for one venture (the click-through Alex described). */
export function ventureAreaAgents(ventureId: string, areaId: string): string[] {
  return getVenture(ventureId)?.areaAgents[areaId] ?? [];
}

export function lifeAreaById(areaId: string): LifeArea | null {
  return LIFE_AREAS.find((a) => a.id === areaId) ?? null;
}
