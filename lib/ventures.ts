/**
 * Alex's three income sources — the venture lens over the OS.
 *
 * One database, one G-Brain, one agent roster: ventures never partition the
 * data. They are saved filters — each one names the agents that serve it per
 * life area, the brain tag that marks its pages, and the current executive
 * focus. Switching venture in the hierarchy or life map swaps which crew
 * lights up; the agents themselves keep full visibility of everything.
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
    // Brand green sampled from VANTAGE LOGO (~/vantage/VANTAGE LOGO).
    color: '#00ffaa',
    detail: 'Client AI builds and delivery — the agency arm.',
    brainTag: 'vantage',
    focus: [
      'Active client builds shipped on schedule',
      'Pipeline: proposals out, deals advanced in Attio',
      'Delivery quality — every handoff documented in G-Brain',
    ],
    areaAgents: {
      marketing: ['social-agent', 'zernio-publisher', 'remotion-editor', 'higgsfield-creative'],
      sales: ['vantage-sales', 'vantage-fanbasis', 'sales-agent', 'sales-calls-data'],
      communication: ['comms-agent', 'gmail-worker', 'slack-worker', 'crm-pulse'],
      finances: ['payments-pulse', 'stripe-sales', 'processor-confirmation'],
      knowledge: [...SHARED_KNOWLEDGE, 'notion-sync'],
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
      marketing: ['social-agent', 'arcads-creative', 'zernio-publisher', 'manychat-mcp', 'remotion-editor'],
      sales: ['launchpad-cohort-sales', 'fanbasis-sales', 'sales-agent', 'sales-calls-data'],
      communication: ['whatsapp-worker', 'gmail-worker', 'comms-agent', 'crm-pulse'],
      finances: ['payments-pulse', 'stripe-sales', 'pava-financing', 'processor-confirmation'],
      knowledge: SHARED_KNOWLEDGE,
      operations: SHARED_OPS,
    },
  },
  {
    // Internal id/brainTag stay 'brand-deals'; presented as Personal Brand.
    id: 'brand-deals',
    label: 'Personal Brand',
    kind: 'Paid collaborations',
    color: '#a3e635',
    detail: 'Sponsored collabs with AI companies — personally managed.',
    brainTag: 'brand-deals',
    focus: [
      'Inbound collab offers triaged and answered',
      'Deliverables calendar — no missed posting windows',
      'Invoices out and chased; rates documented per brand',
    ],
    areaAgents: {
      marketing: ['arcads-creative', 'social-agent', 'zernio-publisher', 'higgsfield-creative', 'remotion-editor'],
      sales: ['sales-agent', 'crm-pulse'],
      communication: ['gmail-worker', 'crm-pulse', 'comms-agent'],
      finances: ['payments-pulse', 'stripe-sales'],
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
