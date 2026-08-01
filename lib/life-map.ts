/**
 * Alex's life map: the radial taxonomy at the heart of the OS.
 * Center = Alex's life; ring 1 = color-coded life areas; ring 2 = the
 * modules inside each area. Communication additionally carries the contact
 * tier system — the numbered/colored response-priority ladder for people.
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
  brainFolders: string[]; // brain-store folders feeding this area
  departmentIds: string[]; // seeded departments that roll up to this area
};

export const LIFE_AREAS: LifeArea[] = [
  {
    id: 'marketing',
    label: 'Marketing',
    color: '#f59e0b',
    detail: 'Everything that earns attention.',
    modules: [
      { id: 'content', label: 'Content', detail: 'Posts, scripts, and creative across IG/TikTok/YT/X.' },
      { id: 'email', label: 'Email', detail: 'Campaigns and sequences.' },
      { id: 'newsletter', label: 'Newsletter', detail: 'The recurring owned-audience send.' },
      { id: 'sms', label: 'SMS', detail: 'Text blasts and reminders.' },
      { id: 'editing', label: 'Editing', detail: 'Cuts, captions, and post-production.' },
    ],
    agents: ['social-agent', 'zernio-publisher', 'arcads-creative', 'remotion-editor', 'higgsfield-creative', 'manychat-mcp', 'social-pulse'],
    brainFolders: ['media', 'writing', 'ideas'],
    departmentIds: ['dept-marketing-growth'],
  },
  {
    id: 'sales',
    label: 'Sales',
    color: '#ef4444',
    detail: 'Deals, pipeline, and revenue relationships.',
    modules: [
      { id: 'pipeline', label: 'Pipeline', detail: 'Active deals and stages.' },
      { id: 'crm', label: 'CRM', detail: 'People, companies, and account history.' },
      { id: 'follow-up', label: 'Follow-up', detail: 'Next actions and reminders.' },
      { id: 'offers', label: 'Offers', detail: 'Proposals, pricing, and close paths.' },
    ],
    agents: [
      'sales-agent',
      'crm-pulse',
      'launchpad-cohort-sales',
      'vantage-sales',
      'fanbasis-sales',
      'vantage-fanbasis',
      'stripe-sales',
      'processor-confirmation',
      'pava-financing',
      'sales-calls-data',
    ],
    brainFolders: ['people', 'companies', 'hiring'],
    departmentIds: ['dept-sales'],
  },
  {
    id: 'finances',
    label: 'Finances',
    color: '#22c55e',
    detail: 'Money in, money out, every processor.',
    modules: [
      { id: 'payments', label: 'Payments', detail: 'Stripe + the processor registry.' },
      { id: 'invoicing', label: 'Invoicing', detail: 'What is owed and by whom.' },
      { id: 'subscriptions', label: 'Subscriptions', detail: 'Recurring revenue and churn.' },
      { id: 'bookkeeping', label: 'Bookkeeping', detail: 'Categorized, reconciled, tax-ready.' },
    ],
    agents: ['payments-pulse'],
    brainFolders: ['companies'],
    departmentIds: ['dept-finance'],
  },
  {
    id: 'communication',
    label: 'Communication',
    color: '#3b82f6',
    detail: 'Every person, every channel, one priority ladder.',
    modules: [
      {
        id: 'client-management',
        label: 'Client management',
        detail: 'Tagged people with response tiers — who needs an answer ASAP.',
      },
      { id: 'inbox', label: 'Inbox', detail: '4 IMAP inboxes, unified.' },
      { id: 'whatsapp', label: 'WhatsApp', detail: '611 chats from local ChatStorage.' },
      { id: 'slack', label: 'Slack', detail: 'Workspace messages and mentions.' },
      { id: 'meetings', label: 'Meetings', detail: 'Notes and follow-ups.' },
    ],
    agents: ['comms-agent', 'gmail-worker', 'whatsapp-worker', 'slack-worker'],
    brainFolders: ['inbox', 'meetings', 'people'],
    departmentIds: ['dept-comms'],
  },
  {
    id: 'clients',
    label: 'Clients',
    color: '#14b8a6',
    detail: 'Every client, onboarded and served.',
    modules: [
      { id: 'roster', label: 'Roster', detail: 'Who is a client right now, by venture.' },
      { id: 'onboarding', label: 'Onboarding', detail: 'Closed-won to kickoff without a dropped step.' },
      { id: 'service', label: 'Service', detail: 'Check-in cadence and deliverable tracking.' },
      { id: 'renewals', label: 'Renewals', detail: 'Expansion and renewal timing.' },
    ],
    agents: ['client-roster', 'client-onboarding', 'client-success'],
    brainFolders: ['people', 'companies'],
    departmentIds: ['dept-clients'],
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    color: '#a855f7',
    detail: 'G-Brain: markdown, vectors, and recall.',
    modules: [
      { id: 'brain-store', label: 'Brain store', detail: 'Markdown source of truth on disk.' },
      { id: 'vector-db', label: 'Vector DB', detail: 'Chunks → embeddings → pgvector.' },
      { id: 'prompts', label: 'Prompts', detail: 'Reusable prompt library.' },
      { id: 'sources', label: 'Sources', detail: 'Reference material and citations.' },
    ],
    agents: ['data-agent', 'markdown-auditor', 'vector-auditor', 'notion-sync', 'brain-librarian'],
    brainFolders: ['concepts', 'prompts', 'sources', 'archive'],
    departmentIds: ['dept-tech'],
  },
  {
    id: 'operations',
    label: 'Operations',
    color: '#fafafa',
    detail: 'The machine that runs the machine.',
    modules: [
      { id: 'agents', label: 'Agents', detail: 'The roster and its hierarchy.' },
      { id: 'automations', label: 'Automations', detail: 'Scheduled and self-healing jobs.' },
      { id: 'infra', label: 'Infra', detail: 'Local stack, ports, Mac mini target.' },
      { id: 'hiring', label: 'Hiring', detail: 'Candidates and roles.' },
    ],
    // dept-tech rolls up to knowledge first (lifeAreaForDepartment takes the
    // first match); operations still owns the conductor + stack agents.
    agents: ['conductor', 'stack-monitor'],
    brainFolders: ['org', 'projects', 'hiring'],
    departmentIds: ['dept-tech'],
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
 * The response-priority ladder for people Alex talks to.
 * 1 = red (clients & students), 2 = yellow (brand), 3 = green (personal).
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
      label: "Alex's Life",
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

  // the contact priority ladder hangs off client management
  for (const t of CONTACT_TIERS) {
    const id = `tier-${t.tier}`;
    nodes.push({
      id,
      type: 'tier',
      label: `T${t.tier} ${t.label}`,
      color: t.color,
      parent: 'communication/client-management',
      detail: `${t.tags.join(', ')} — respond ${t.respond}`,
      agents: [],
      brainFolders: [],
    });
    edges.push({ source: 'communication/client-management', target: id });
  }

  return { nodes, edges };
}
