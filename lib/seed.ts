import type { FounderDb } from '@/lib/db';
import { PERSONAS } from '@/lib/personas-seed';
import { runCostUsd } from '@/lib/agent-costs';
import type {
  AgentCron,
  Agent,
  AgentRun,
  AgentTask,
  Department,
  Domain,
  EmailListSnapshot,
  FunnelContact,
  FunnelTouch,
  Metric,
  Person,
  Phase,
  RoadmapItem,
  SopTask,
  Workflow,
  Skill,
  SocialAccount,
  SocialDm,
  SocialDmSnapshot,
  SocialDmMessage,
  SocialPost,
  SocialSnapshot,
  Tool,
  LeadMagnet,
  TradingAccountSnapshot,
  TradingPosition,
  TradeActivity,
  Proposal,
} from '@/lib/schemas';

// Monochrome palette — the UI is strict black & white; "color" fields carry
// grayscale steps used only for subtle hierarchy.
const GRAY = {
  white: '#fafafa',
  light: '#d4d4d4',
  mid: '#a3a3a3',
  dim: '#737373',
  dark: '#525252',
};

// The five operating pillars of the seeded organisation.
const departments: Department[] = [
  { id: 'dept-sales', name: 'Sales', slug: 'sales', tagline: 'Pipeline and deals.', color: GRAY.white, order: 1 },
  { id: 'dept-marketing-growth', name: 'Marketing/Growth', slug: 'marketing-growth', tagline: 'Publishing, content, attention.', color: GRAY.light, order: 2 },
  { id: 'dept-tech', name: 'TECH', slug: 'tech', tagline: 'AI & automations · G-Brain.', color: GRAY.mid, order: 3 },
  { id: 'dept-finance', name: 'Finances', slug: 'finances', tagline: 'Every processor, one view.', color: GRAY.dim, order: 4 },
  { id: 'dept-comms', name: 'Communications', slug: 'communications', tagline: 'Gmail, WhatsApp, Slack → one feed.', color: GRAY.dark, order: 5 },
  { id: 'dept-clients', name: 'Clients', slug: 'clients', tagline: 'Every client, onboarded and served.', color: GRAY.light, order: 6 },
];

// The roster IS the runtime — every row here maps 1:1 to a RuntimeAgent in
// lib/agents/real.ts (enforced by tests/seed.test.ts). No demo agents.
//
// Shape: top-level agents (parentId null) are INSTANCE slots — each one is
// what becomes its own Clawline / Claude Code process on a dedicated host
// (`instance` records that binding; everything is 'builtin' until then).
// Worker rows underneath them do one specific task each and sit at the
// bottom of the hierarchy.
const agents: Agent[] = [
  // ── TECH: AI head ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'conductor',
    departmentId: 'dept-tech',
    name: 'Conductor',
    role: 'Broadcast & Orchestration',
    status: 'active',
    tier: 'lead',
    description: 'Fans your message out to every agent at once and checks which instance hosts (Clawline, Ollama, tmux) are available for future bindings.',
    model: 'fan-out runtime',
    tools: ['broadcast', 'clawline', 'tmux'],
    parentId: null,
    instance: 'builtin',
  },
  // ── Communications: one instance, three channel workers feeding /comms ────────
  {
    id: 'comms-digest',
    departmentId: 'dept-comms',
    name: 'Comms Digest',
    role: 'Morning Report · 09:00 daily',
    status: 'active',
    tier: 'lead',
    description:
      'Scrapes the last 24h across all four inboxes, WhatsApp and Slack and ranks who needs a reply: calls first, then clients, community members, brand deals, group chats, companies last. Also lists what to unsubscribe from.',
    model: 'rules + connectors',
    tools: ['comms-feed', 'calendar', 'ledger'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'comms-agent',
    departmentId: 'dept-comms',
    name: 'Comms Agent',
    role: 'Unified Communications Instance',
    status: 'active',
    tier: 'lead',
    description: 'Owns the unified /comms feed. Aggregates its three channel workers and reports which are live.',
    model: 'aggregate of workers',
    tools: ['comms-feed'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'gmail-worker',
    departmentId: 'dept-comms',
    name: 'Gmail Worker',
    role: 'IMAP Inboxes ×4',
    status: 'planned',
    tier: 'worker',
    description: 'Pulls unread counts and recent mail from up to four IMAP inboxes into /comms. Activates when INBOX_* creds land.',
    model: 'imapflow',
    tools: ['imap'],
    parentId: 'comms-agent',
    instance: 'builtin',
  },
  {
    id: 'whatsapp-worker',
    departmentId: 'dept-comms',
    name: 'WhatsApp Worker',
    role: 'Chat Monitor',
    status: 'active',
    tier: 'worker',
    description: 'Reads the local WhatsApp ChatStorage (local team chats) into /comms. Works today.',
    model: 'local sqlite (read-only)',
    tools: ['whatsapp'],
    parentId: 'comms-agent',
    instance: 'builtin',
  },
  {
    id: 'slack-worker',
    departmentId: 'dept-comms',
    name: 'Slack Worker',
    role: 'Channel Digest',
    status: 'planned',
    tier: 'worker',
    description: 'Latest messages across joined channels into /comms. Needs SLACK_BOT_TOKEN.',
    model: '@slack/web-api',
    tools: ['slack'],
    parentId: 'comms-agent',
    instance: 'builtin',
  },
  // ── Marketing/Growth: social/content crew ───────────────────────────
  {
    id: 'social-agent',
    departmentId: 'dept-marketing-growth',
    name: 'Social Agent',
    role: 'Social Media & Content Creation Instance',
    status: 'active',
    tier: 'lead',
    description: 'Owns publishing and content production. Aggregates the Postly and Adsmith workers.',
    model: 'aggregate of workers',
    tools: ['postly', 'adsmith', 'reelkit', 'renderly', 'dmflow'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'brand-deal-agent',
    departmentId: 'dept-sales',
    name: 'Brand Deal Agent',
    role: 'Vera · brand deal manager',
    status: 'active',
    tier: 'worker',
    description:
      'Negotiates as Vera, Alex\u2019s brand deal manager: qualifies inbound, anchors and counters, chases unpaid invoices, and bumps stalled threads. A tested contact governor decides whether a thread may be touched at all (five bumps maximum, one revival per brand per six months). Drafts only, never sends.',
    model: 'rules + gateway',
    tools: ['ledger', 'imap'],
    parentId: 'sales-agent',
    instance: 'builtin',
  },
  {
    id: 'newsletter-agent',
    departmentId: 'dept-marketing-growth',
    name: 'Newsletter Agent',
    role: 'Issue drafting',
    status: 'active',
    tier: 'worker',
    description:
      'Reads newsletter send performance, builds a brief that is honest about how thin the history is, and drafts the next issue against the skill file. Drafts only, never schedules or sends.',
    model: 'rules + gateway',
    tools: ['newsletter'],
    parentId: 'social-agent',
    instance: 'builtin',
  },
  {
    id: 'postly-publisher',
    departmentId: 'dept-marketing-growth',
    name: 'Postly Publisher',
    role: 'Six-Platform Publishing',
    status: 'active',
    tier: 'worker',
    description: 'Publishes and monitors six platforms under @founderos.ai via Postly. Live once the Postly key is set.',
    model: 'postly api',
    tools: ['postly'],
    parentId: 'social-agent',
    instance: 'builtin',
  },
  {
    id: 'adsmith-creative',
    departmentId: 'dept-marketing-growth',
    name: 'Adsmith Creative',
    role: 'UGC Ad Generation',
    status: 'active',
    tier: 'worker',
    description: 'Generates UGC ads for Vantage (Veo/Sora/Kling) via the Adsmith API. Live once Adsmith auth is set.',
    model: 'adsmith api',
    tools: ['adsmith'],
    parentId: 'social-agent',
    instance: 'builtin',
  },
  {
    id: 'reelkit-editor',
    departmentId: 'dept-marketing-growth',
    name: 'Reelkit Editor',
    role: 'Social Editing Pipeline',
    status: 'active',
    tier: 'worker',
    description: 'Editing and rendering pipeline for social media clips, captions, and promotional cuts.',
    model: 'reelkit pipeline',
    tools: ['reelkit', 'whisper'],
    parentId: 'social-agent',
    instance: 'builtin',
  },
  {
    id: 'renderly-creative',
    departmentId: 'dept-marketing-growth',
    name: 'Renderly Creative',
    role: 'AI Creative Studio',
    status: 'active',
    tier: 'worker',
    description: 'Renderly creative generation for social assets, product shots, and campaign visuals.',
    model: 'renderly cli',
    tools: ['renderly'],
    parentId: 'social-agent',
    instance: 'builtin',
  },
  {
    id: 'dmflow-mcp',
    departmentId: 'dept-marketing-growth',
    name: 'DMFlow MCP',
    role: 'DM Automation',
    // live: the MCP server is registered user-scope and the
    // connector authenticates against the real Instagram Pro account
    status: 'active',
    tier: 'worker',
    description: 'DMFlow MCP/API lane for social DM automations, keyword flows, and lead capture.',
    model: 'dmflow api',
    tools: ['dmflow'],
    parentId: 'social-agent',
    instance: 'builtin',
  },
  {
    id: 'sales-agent',
    departmentId: 'dept-sales',
    name: 'Sales Agent',
    role: 'Deals & Pipeline Instance',
    status: 'active',
    tier: 'lead',
    description: 'Owns the sales pillar. Aggregates CRM Pulse and reports the live Ledger deals pipeline.',
    model: 'aggregate of workers',
    tools: ['ledger', 'paykit', 'stripe', 'flexpay', 'recall', 'plaud'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'launchpad-cohort-sales',
    departmentId: 'dept-sales',
    name: 'Launchpad Cohort',
    role: 'Sales Account Lane',
    status: 'planned',
    tier: 'worker',
    description: 'Launchpad Cohort sales lane: offers, calls, payment confirmation, and CRM context.',
    model: 'account lane',
    tools: ['ledger', 'stripe', 'paykit'],
    parentId: 'sales-agent',
    instance: 'builtin',
  },
  {
    id: 'vantage-sales',
    departmentId: 'dept-sales',
    name: 'Vantage',
    role: 'Sales Account Lane',
    status: 'planned',
    tier: 'worker',
    description: 'Vantage sales lane: account pipeline, PayKit context, payment confirmation, and call data.',
    model: 'account lane',
    tools: ['ledger', 'stripe', 'paykit'],
    parentId: 'sales-agent',
    instance: 'builtin',
  },
  {
    id: 'paykit-sales',
    departmentId: 'dept-finance',
    name: 'PayKit',
    role: 'Offer & Payment Platform',
    status: 'planned',
    tier: 'worker',
    description: 'PayKit sales platform connection for offers and customer/payment context.',
    model: 'paykit api',
    tools: ['paykit'],
    parentId: 'payments-pulse',
    instance: 'builtin',
  },
  {
    id: 'vantage-paykit',
    departmentId: 'dept-sales',
    name: 'Vantage PayKit',
    role: 'Vantage PayKit Lane',
    status: 'planned',
    tier: 'worker',
    description: 'PayKit lane specifically under Vantage for offer, payment, and customer context.',
    model: 'paykit api',
    tools: ['paykit'],
    parentId: 'vantage-sales',
    instance: 'builtin',
  },
  {
    id: 'stripe-sales',
    departmentId: 'dept-finance',
    name: 'Stripe',
    role: 'Sales Payment Processor',
    status: 'planned',
    tier: 'worker',
    description: 'Stripe payment confirmation lane for sales workflows and account-level revenue checks.',
    model: 'stripe sdk',
    tools: ['stripe'],
    parentId: 'payments-pulse',
    instance: 'builtin',
  },
  {
    id: 'processor-confirmation',
    departmentId: 'dept-finance',
    name: 'Processor Confirm',
    role: 'Payment API Confirmation',
    status: 'planned',
    tier: 'worker',
    description: 'APIs to payment processors for confirming paid, failed, disputed, and pending states.',
    model: 'processor registry',
    tools: ['stripe', 'paypal', 'square', 'whop', 'paykit'],
    parentId: 'payments-pulse',
    instance: 'builtin',
  },
  {
    id: 'flexpay-financing',
    departmentId: 'dept-finance',
    name: 'FlexPay Financing',
    role: 'Financing Options',
    status: 'planned',
    tier: 'worker',
    description: 'FlexPay financing options lane for sales offers and payment-plan context.',
    model: 'flexpay api',
    tools: ['flexpay'],
    parentId: 'payments-pulse',
    instance: 'builtin',
  },
  {
    id: 'sales-calls-data',
    departmentId: 'dept-sales',
    name: 'Sales Calls Data',
    role: 'Call Intelligence',
    status: 'planned',
    tier: 'worker',
    description: 'Sales calls data lane for recordings, notes, outcomes, and follow-up context: Recall on the calls, Plaud in the room.',
    model: 'recall + plaud + crm',
    tools: ['recall', 'plaud', 'ledger'],
    parentId: 'sales-agent',
    instance: 'builtin',
  },
  // ── TECH: the G-Brain data analyst and its auditors ──────────────────────────────
  {
    id: 'data-agent',
    departmentId: 'dept-tech',
    name: 'Data Agent',
    role: 'G-Brain Analyst',
    status: 'active',
    tier: 'lead',
    description: 'Bound to the G-Brain instance: analyzes markdown + vector storage health and surfaces ideas. Answers broadcasts by querying the brain.',
    model: 'gbrain CLI',
    tools: ['gbrain', 'brain-store', 'ollama', 'supabase'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'markdown-auditor',
    departmentId: 'dept-tech',
    name: 'Markdown Auditor',
    role: 'brain-store Health',
    status: 'active',
    tier: 'worker',
    description: 'Audits the knowledge base: broken wikilinks, orphan pages, duplicate titles, and whether the index search reads still matches the store on disk.',
    model: 'link audit',
    tools: ['brain-store'],
    parentId: 'data-agent',
    instance: 'builtin',
  },
  {
    id: 'vector-auditor',
    departmentId: 'dept-tech',
    name: 'Vector Auditor',
    role: 'pgvector / Supabase Health',
    status: 'active',
    tier: 'worker',
    description: 'Runs gbrain doctor: connection to Supabase pgvector, embedding checks, health score. Works today.',
    model: 'gbrain doctor',
    tools: ['supabase', 'ollama'],
    parentId: 'data-agent',
    instance: 'builtin',
  },
  // ── Finances ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'payments-pulse',
    departmentId: 'dept-finance',
    name: 'Payments Pulse',
    role: 'Processor Monitor',
    status: 'planned',
    tier: 'lead',
    description: 'Stripe balance + recent charges; PayPal/Square/Whop registered and awaiting keys.',
    model: 'stripe sdk',
    tools: ['stripe', 'paypal', 'square', 'whop'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'crm-pulse',
    departmentId: 'dept-sales',
    name: 'Ledger CRM',
    role: 'ATTO / Ledger Deals Pipeline',
    status: 'active',
    tier: 'worker',
    description: 'Vantage + LC deals from Ledger, key reused from the MCP config. Works today.',
    model: 'ledger api',
    tools: ['ledger'],
    parentId: 'sales-agent',
    instance: 'builtin',
  },
  // ── TECH: automations ─────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'stack-monitor',
    departmentId: 'dept-tech',
    name: 'Stack Monitor',
    role: 'Local Stack Health',
    status: 'active',
    tier: 'lead',
    description: 'Reelkit, Ollama, command-center, Clawline, tmux, whisper, ffmpeg, renderly, gh + Dictate Flow stats.',
    model: 'local checks',
    tools: ['reelkit', 'ollama', 'tmux', 'dictate'],
    parentId: null,
    instance: 'builtin',
  },
  // ── Clients: roster, onboarding, service ──────────────────────────────────
  {
    id: 'client-roster',
    departmentId: 'dept-clients',
    name: 'Client Roster',
    role: 'Live Client List',
    status: 'active',
    tier: 'lead',
    description: 'The single source of truth for who is a client: reconciles Ledger and PayKit against the funnel and keeps the roster current.',
    model: 'funnel + Ledger',
    tools: ['ledger', 'paykit'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'client-onboarding',
    departmentId: 'dept-clients',
    name: 'Onboarding Agent',
    role: 'Closed-Won to Kickoff',
    status: 'planned',
    tier: 'worker',
    description: 'Runs the onboarding SOP end to end when a deal closes: welcome pack, workspace setup, kickoff booked, handoff notes.',
    model: 'ledger + slack',
    tools: ['ledger', 'slack'],
    parentId: 'client-roster',
    instance: 'builtin',
  },
  {
    id: 'client-success',
    departmentId: 'dept-clients',
    name: 'Client Success',
    role: 'Service & Renewals',
    status: 'planned',
    tier: 'worker',
    description: 'Keeps active clients served: check-in cadence, deliverable tracking from call notes (Recall) and in-person meeting recordings (Plaud), renewal and upsell flags.',
    model: 'recall + plaud + slack',
    tools: ['recall', 'plaud', 'slack'],
    parentId: 'client-roster',
    instance: 'builtin',
  },
];

// ── Humans in the process ─────────────────────────────────────────────────────
// Named heads plus demo-first seeds for the roles an operator hires
// into (rename when a real person lands). Tools use the agents' slug
// namespace so the graph chain still ends in tools for humans too.
const people: Person[] = [
  { id: 'person-marco', departmentId: 'dept-sales', name: 'Marco', role: 'Head of Sales', tools: ['recall', 'ledger'] },
  { id: 'person-nadia', departmentId: 'dept-marketing-growth', name: 'Nadia', role: 'Head of Growth & Marketing', tools: ['postly', 'dmflow'] },
  { id: 'person-mia', departmentId: 'dept-comms', name: 'Mia Torres', role: 'Executive Assistant', tools: ['imap', 'slack'] },
  { id: 'person-dana', departmentId: 'dept-finance', name: 'Dana Whitfield', role: 'Bookkeeper', tools: ['stripe', 'paykit'] },
  { id: 'person-sasha', departmentId: 'dept-clients', name: 'Sasha Bell', role: 'Account Manager', tools: ['ledger', 'recall'] },
];

// ── SOP tasks — every department role's job, written out ─────────────────────
// One task per worker, one worker per task (monogamous; tests enforce it).
// The chain the /brain graph draws: department → task → worker → tools.
const leadMagnets: LeadMagnet[] = [
  {
    id: 'operator-stack',
    name: 'The Operator Stack',
    offer: 'Every layer of the agent stack, and what to use instead of each one',
    url: 'https://stack.example.com',
    status: 'live',
    captures: 'email',
    destination: 'Newsletter · main list',
    source: 'Carousel · "One person, a company of agents" (comment STACK)',
    launchedAt: '2026-08-12',
    origin: 'seed',
    notes: 'Ungated. Newsletter signup plus a separate cohort waitlist form.',
  },
  {
    id: 'automation-teardown',
    name: 'The Automation Teardown',
    offer: 'A workflow pulled apart step by step, with the hours each one costs',
    url: 'https://teardown.example.com',
    status: 'live',
    captures: 'email',
    destination: 'Newsletter · main list',
    source: 'Short · "Where the week actually goes" (comment TEARDOWN)',
    launchedAt: '2026-08-05',
    origin: 'seed',
    notes: 'Built from the workflows view. Doubles as the cohort lesson one handout.',
  },
  {
    id: 'cohort-waitlist',
    name: 'Cohort Waitlist',
    offer: 'A seat in the next cohort before it opens publicly',
    url: 'https://waitlist.example.com',
    status: 'paused',
    captures: 'email',
    destination: 'Newsletter · cohort waitlist segment',
    source: 'Bio link + end cards',
    launchedAt: '2026-07-28',
    origin: 'seed',
    notes: 'Paused between cohorts. Reopen when the next intake is dated.',
  },
];

const sopTasks: SopTask[] = [
  // TECH
  {
    id: 'sop-conductor', departmentId: 'dept-tech', assigneeKind: 'agent', assigneeId: 'conductor',
    title: 'Broadcast directives across the fleet',
    summary: 'One message in, every agent briefed, replies collected.',
    steps: [
      'Receive the directive from the operator console',
      'Resolve the target list: the whole fleet, or the pillar the directive names',
      'Poll instance hosts (Clawline, Ollama, tmux) for availability before dispatch',
      'Fan the message out to every target at once and stamp each send',
      'Collect replies as they land and file the run to agent_runs',
      'Report non-responders after sixty seconds so nothing fails silently',
    ],
  },
  {
    id: 'sop-data-agent', departmentId: 'dept-tech', assigneeKind: 'agent', assigneeId: 'data-agent',
    title: 'Answer questions from G-Brain',
    summary: 'Hybrid search over the second brain, honest fallbacks.',
    steps: [
      'Parse the incoming question into a gbrain query',
      'Run gbrain hybrid search (--no-expand) against Supabase',
      'Fall back to local brain-store grep when the database is paused',
      'Rank passages and keep only the ones that actually answer the question',
      'Return cited passages with their source notes, never invented ones',
      'Log unanswerable questions as gaps for the Markdown Auditor to fill',
    ],
  },
  {
    id: 'sop-markdown-auditor', departmentId: 'dept-tech', assigneeKind: 'agent', assigneeId: 'markdown-auditor',
    title: 'Audit brain-store markdown health',
    summary: 'Keep the knowledge base clean and linkable.',
    steps: [
      'Walk every markdown file in knowledge/brain-store',
      'Flag broken wiki-links, orphan notes and stale frontmatter',
      'Check generated org docs still match the live agents, SOPs and tools',
      'Write the health report with per-folder scores',
      'Queue fix-ups for the worst offenders and track them to done',
    ],
  },
  {
    id: 'sop-vector-auditor', departmentId: 'dept-tech', assigneeKind: 'agent', assigneeId: 'vector-auditor',
    title: 'Audit the vector index',
    summary: 'Embeddings in Supabase must mirror brain-store.',
    steps: [
      'Ping the Supabase Second Brain project (free tier pauses on idle)',
      'Wake the database and wait until it accepts queries before comparing',
      'Compare pgvector chunk counts against brain-store files',
      'Flag drift and paused-tier warnings on the /brain doctor card',
      'Trigger bge-m3 re-embeds for drifted documents and verify counts after',
    ],
  },
  {
    id: 'sop-stack-monitor', departmentId: 'dept-tech', assigneeKind: 'agent', assigneeId: 'stack-monitor',
    title: 'Watch the local stack',
    summary: 'Honest status for every port, session and binary.',
    steps: [
      'Probe the command center :3100 and the worker gateway :8642',
      'Check the brew binaries the agents shell out to (ffmpeg, pdftotext, whisper, gh) and the gbrain CLI',
      'Record honest ConnectorStatus, never fake connected',
      'Compare against the last sweep to catch flapping services',
      'Alert the console when something that was up goes down',
    ],
  },

  // COMMUNICATIONS
  {
    id: 'sop-comms-digest', departmentId: 'dept-comms', assigneeKind: 'agent', assigneeId: 'comms-digest',
    title: 'Run the 09:00 comms report',
    summary: 'Every morning: 24h of email, WhatsApp and Slack, ranked by who needs a reply.',
    steps: [
      'Pull the trailing 24 hours from all four inboxes, WhatsApp and Slack (one guarded call each — a dead channel degrades the report, it never cancels it)',
      'Load the ranking context: calendar titles for upcoming calls, the Ledger roster for clients, contact tags for community members',
      'Rank every message: calls first, then clients and proposal replies, then community questions, then brand deals, then group chats, companies and software last',
      'Collect the automated senders into an unsubscribe worklist, noisiest first',
      'Store the report so /comms renders it instantly, and log the run against the schedule',
    ],
  },
  {
    id: 'sop-comms-agent', departmentId: 'dept-comms', assigneeKind: 'agent', assigneeId: 'comms-agent',
    title: 'Compose the unified comms feed',
    summary: 'Three channels, one timeline at /comms.',
    steps: [
      'Collect fresh output from the Gmail, WhatsApp and Slack workers',
      'Dedupe and merge everything into one ordered timeline',
      'Tag each entry with its contact tier',
      'Bubble urgent and reply-needed items to the top of the feed',
      'Publish the feed and report which channels are live',
    ],
  },
  {
    id: 'sop-gmail-worker', departmentId: 'dept-comms', assigneeKind: 'agent', assigneeId: 'gmail-worker',
    title: 'Triage the four Gmail inboxes',
    summary: 'IMAP slots 1–4 read, classified, escalated.',
    steps: [
      'Connect the four configured IMAP inboxes on the sync cadence',
      'Pull unread counts and every thread newer than the last sweep',
      'Classify each thread: urgent, reply-needed, waiting-on-us, FYI',
      'Draft suggested replies for reply-needed threads in Alex voice',
      'Hand urgent threads to the escalation queue with a one-line summary',
      'Surface anything from a client domain to the Clients pillar too',
    ],
  },
  {
    id: 'sop-whatsapp-worker', departmentId: 'dept-comms', assigneeKind: 'agent', assigneeId: 'whatsapp-worker',
    title: 'Monitor WhatsApp chats',
    summary: 'Local team chats surfaced.',
    steps: [
      'Read the local ChatStorage.sqlite (read-only, nothing leaves the machine)',
      'Surface new messages from the LC and Vantage team chats',
      'Map senders to their contact tags',
      'Flag messages that mention money, deadlines or blockers',
      'Push tagged messages into the unified feed',
    ],
  },
  {
    id: 'sop-slack-worker', departmentId: 'dept-comms', assigneeKind: 'agent', assigneeId: 'slack-worker',
    title: 'Digest Slack channels',
    summary: 'Joined channels summarized into the feed.',
    steps: [
      'List channels the bot has joined',
      'Pull the latest messages per channel since the last sweep',
      'Summarize each channel into a short digest',
      'Call out direct mentions and unanswered questions separately',
      'Push the digest into the unified feed',
    ],
  },

  // MARKETING / GROWTH
  {
    id: 'sop-social-agent', departmentId: 'dept-marketing-growth', assigneeKind: 'agent', assigneeId: 'social-agent',
    title: 'Run the daily content pipeline',
    summary: 'Calendar → briefs → assets → publish queue.',
    steps: [
      'Pull today’s slots from the content calendar',
      'Brief the creative workers (Adsmith, Renderly, Reelkit) with hooks and formats',
      'Collect finished assets and check them against the brief',
      'Reject anything off-brand with a one-line reason so the fix is fast',
      'Queue approved posts for the Postly publisher with per-platform captions',
      'Log what shipped to the calendar so tomorrow’s brief starts warm',
    ],
  },
  {
    id: 'sop-newsletter-agent', departmentId: 'dept-marketing-growth', assigneeKind: 'agent', assigneeId: 'newsletter-agent',
    title: 'Draft the next newsletter issue',
    summary: 'Aim the draft at what the list actually opened and clicked.',
    steps: [
      'Pull the newsletter send history and build the performance brief',
      'Say plainly when the history is too thin to call a pattern',
      'Write three subject lines and the issue against the skill file',
      'Avoid repeating the angle of any recent issue in the brief',
      'Hand the draft over unsent, and never state a metric that was not measured',
    ],
  },
  {
    id: 'sop-postly-publisher', departmentId: 'dept-marketing-growth', assigneeKind: 'agent', assigneeId: 'postly-publisher',
    title: 'Publish to six platforms',
    summary: 'One queue out to every @founderos.ai surface.',
    steps: [
      'Take the next queued post from the pipeline',
      'Adapt the caption per platform (IG, TikTok, X, YouTube, LinkedIn, Facebook)',
      'Publish through the Postly API',
      'Record post ids and verify each went live',
      'Retry failed platforms once, then flag them to the Social Agent',
    ],
  },
  {
    id: 'sop-adsmith-creative', departmentId: 'dept-marketing-growth', assigneeKind: 'agent', assigneeId: 'adsmith-creative',
    title: 'Generate UGC ad variants',
    summary: 'Vantage ad angles rendered as UGC actors.',
    steps: [
      'Take the ad brief with hook, angle and offer',
      'Generate actor variants across Veo / Sora / Kling',
      'Cull the takes that break the brief before rendering finals',
      'Render finals and name them by angle',
      'Deliver the batch to creative review with a variant sheet',
    ],
  },
  {
    id: 'sop-reelkit-editor', departmentId: 'dept-marketing-growth', assigneeKind: 'agent', assigneeId: 'reelkit-editor',
    title: 'Cut short-form edits',
    summary: 'Raw footage to platform-ready crops.',
    steps: [
      'Transcribe the source clip locally with Whisper',
      'Pick the hook and strongest segments from the transcript',
      'Render through the Reelkit pipeline with the right theme (LC / Vantage)',
      'Check captions land on beat before exporting anything',
      'Export platform crops and hand them to the pipeline',
    ],
  },
  {
    id: 'sop-renderly-creative', departmentId: 'dept-marketing-growth', assigneeKind: 'agent', assigneeId: 'renderly-creative',
    title: 'Produce AI visuals',
    summary: 'Stills and motion from the creative brief.',
    steps: [
      'Read the creative brief and pick the matching Renderly model',
      'Generate stills or motion to the spec in the brief',
      'Cull to the strongest takes before spending on upscales',
      'Upscale the picks to delivery resolution',
      'Hand finals to the editor for assembly with the brief attached',
    ],
  },
  {
    id: 'sop-dmflow-mcp', departmentId: 'dept-marketing-growth', assigneeKind: 'agent', assigneeId: 'dmflow-mcp',
    title: 'Automate DM funnels',
    summary: 'Keyword triggers to booked conversations.',
    steps: [
      'Watch configured trigger keywords across platforms',
      'Fire the matching DMFlow flow for each trigger',
      'Tag subscribers by intent as they move through the flow',
      'Hand hot leads to the Sales pillar with their conversation history',
      'Report conversions back to the growth dashboard',
    ],
  },
  {
    id: 'sop-nadia', departmentId: 'dept-marketing-growth', assigneeKind: 'person', assigneeId: 'person-nadia',
    title: 'Set content strategy & approve drops',
    summary: 'The human editorial gate on everything published.',
    steps: [
      'Review last cycle’s performance numbers from the dashboard',
      'Set this week’s angles and slot them on the calendar',
      'Approve or kill every queued asset before it publishes',
      'Spot-check published posts landed exactly as approved',
      'Debrief the crew on what worked and what died',
    ],
  },

  // SALES
  {
    id: 'sop-sales-agent', departmentId: 'dept-sales', assigneeKind: 'agent', assigneeId: 'sales-agent',
    title: 'Keep the pipeline moving',
    summary: 'Deals inspected daily, nothing stalls silently.',
    steps: [
      'Pull every open deal and its stage from Ledger each morning',
      'Rank deals by value and days-in-stage; anything past 7 days is stalled',
      'Attach a concrete next action and owner to every stalled deal',
      'Prepare payment links across PayKit, Stripe and FlexPay before calls',
      'Brief Marco with the top five deals and their objections before each call',
      'Log stage changes back to Ledger the same day they happen',
    ],
  },
  {
    id: 'sop-lc-lane', departmentId: 'dept-sales', assigneeKind: 'agent', assigneeId: 'launchpad-cohort-sales',
    title: 'Run the Launchpad Cohort lane',
    summary: 'Webinar registrants to closed LC deals.',
    steps: [
      'Track LC leads from webinar registration to booked call',
      'Chase no-shows with the rebooking sequence within 24 hours',
      'Sync every stage change back to Ledger',
      'Reconcile LC payments against Stripe',
      'Report lane revenue to the pipeline brief',
    ],
  },
  {
    id: 'sop-vantage-lane', departmentId: 'dept-sales', assigneeKind: 'agent', assigneeId: 'vantage-sales',
    title: 'Run the Vantage lane',
    summary: 'Local-business inbound worked end to end.',
    steps: [
      'Qualify inbound Vantage leads against the ICP',
      'Book qualified leads onto Marco’s calendar with context attached',
      'Sync stage changes back to Ledger',
      'Reconcile payments across PayKit and Stripe',
      'Report lane revenue to the pipeline brief',
    ],
  },
  {
    id: 'sop-vantage-paykit', departmentId: 'dept-sales', assigneeKind: 'agent', assigneeId: 'vantage-paykit',
    title: 'Reconcile the Vantage PayKit lane',
    summary: 'PayKit customers matched to CRM deals.',
    steps: [
      'Pull month-to-date customers from PayKit',
      'Match each payment to its Ledger deal',
      'Flag payments with no deal and deals with no payment',
      'Chase every mismatch to a resolution, not just a flag',
      'Post month-to-date totals to Finances',
    ],
  },
  {
    id: 'sop-sales-calls-data', departmentId: 'dept-sales', assigneeKind: 'agent', assigneeId: 'sales-calls-data',
    title: 'Mine sales-call recordings',
    summary: 'Every Recall call and Plaud recording becomes CRM intelligence.',
    steps: [
      'Ingest Recall notes after each recorded call',
      'Ingest Plaud transcripts + AI notes after each in-person meeting or site walk',
      'Extract objections, commitments and next steps',
      'Write the extract back to the Ledger record',
      'Tag calls where pricing or competitors came up',
      'Feed recurring patterns into the pipeline brief',
    ],
  },
  {
    id: 'sop-crm-pulse', departmentId: 'dept-sales', assigneeKind: 'agent', assigneeId: 'crm-pulse',
    title: 'Keep Ledger clean',
    summary: 'A CRM the numbers can be trusted from.',
    steps: [
      'Scan records for missing fields and duplicates',
      'Verify deal stages match what actually happened',
      'Merge duplicates and backfill whatever can be backfilled safely',
      'Nudge lane owners on records gone stale',
      'Snapshot pipeline metrics for the dashboard',
    ],
  },
  {
    id: 'sop-brand-deal-agent', departmentId: 'dept-sales', assigneeKind: 'agent', assigneeId: 'brand-deal-agent',
    title: 'Work the brand deal pipeline as Vera',
    summary: 'Qualify, quote, chase and bump, without ever sending.',
    steps: [
      'Read the OS brand deal store and rank what needs answering today',
      'Check the contact governor before touching any thread, and respect a refusal',
      'Draft the reply, counter or bump as Vera, speaking about Alex in third person',
      'Escalate anything below floor, equity shaped, or asking for a call',
      'Leave every draft for Alex to send, and never claim one went out',
    ],
  },
  {
    id: 'sop-marco', departmentId: 'dept-sales', assigneeKind: 'person', assigneeId: 'person-marco',
    title: 'Run discovery & close calls',
    summary: 'The human on the phone from hello to signed.',
    steps: [
      'Review the pre-call brief and the lead’s last three touches',
      'Run the discovery script and qualify hard on budget and timeline',
      'Handle objections with the objection sheet, never improvise pricing',
      'Present the matching offer and the financing option when it fits',
      'Log the outcome, next step and payment link before the next call',
    ],
  },

  // FINANCES
  {
    id: 'sop-paykit', departmentId: 'dept-finance', assigneeKind: 'agent', assigneeId: 'paykit-sales',
    title: 'Track PayKit income',
    summary: 'Month-to-date, split by venture, refunds flagged.',
    steps: [
      'Pull month-to-date customers from the PayKit API',
      'Split income by venture (LC vs Vantage)',
      'Record the income snapshot for the Finances view',
      'Flag refunds and disputes the day they land',
      'Reconcile the running total against the month-end books',
    ],
  },
  {
    id: 'sop-stripe', departmentId: 'dept-finance', assigneeKind: 'agent', assigneeId: 'stripe-sales',
    title: 'Track Stripe income',
    summary: 'Balance and charges labeled Launchpad Cohort.',
    steps: [
      'Pull balance and recent charges from Stripe',
      'Label income to Launchpad Cohort',
      'Record the snapshot for the income chart',
      'Flag anomalies against the trailing average',
      'Note upcoming payouts so cash flow is never a surprise',
    ],
  },
  {
    id: 'sop-processor-confirm', departmentId: 'dept-finance', assigneeKind: 'agent', assigneeId: 'processor-confirmation',
    title: 'Confirm payments across processors',
    summary: 'No deal marked paid without an API receipt.',
    steps: [
      'Receive the payment claim from a sales lane',
      'Check the claimed processor’s API (Stripe / PayPal / Square / Whop / PayKit)',
      'Confirm the charge or flag the mismatch loudly',
      'Write the confirmation onto the deal record',
      'Keep an audit trail of every confirmation for month-end close',
    ],
  },
  {
    id: 'sop-flexpay', departmentId: 'dept-finance', assigneeKind: 'agent', assigneeId: 'flexpay-financing',
    title: 'Quote financing options',
    summary: 'Payment plans attached to live offers.',
    steps: [
      'Take the deal size and buyer profile from the lane',
      'Pull matching plan options from FlexPay',
      'Attach terms to the offer before the call',
      'Track which plans get accepted and which stall deals',
      'Report acceptance rates so pricing keeps getting sharper',
    ],
  },
  {
    id: 'sop-payments-pulse', departmentId: 'dept-finance', assigneeKind: 'agent', assigneeId: 'payments-pulse',
    title: 'Watch processor health',
    summary: 'Every processor pinged, status recorded honestly.',
    steps: [
      'Ping each processor registered in the registry',
      'Record honest ConnectorStatus, never fake connected',
      'Alert Finances when a processor goes down',
      'Re-check failed processors on a tighter cadence until they recover',
      'Keep the uptime history for the analytics view',
    ],
  },

  // CLIENTS
  {
    id: 'sop-client-roster', departmentId: 'dept-clients', assigneeKind: 'agent', assigneeId: 'client-roster',
    title: 'Keep the client roster live',
    summary: 'One list of every client, always current.',
    steps: [
      'Pull clients and deal states from Ledger and PayKit every morning',
      'Reconcile them against the funnel journeys and payment records',
      'Mark each account active, at risk, or churned with a reason',
      'Flag stale records and missing fields to the owning lane',
      'Publish the roster to the Clients pillar and note the deltas',
    ],
  },
  {
    id: 'sop-client-onboarding', departmentId: 'dept-clients', assigneeKind: 'agent', assigneeId: 'client-onboarding',
    title: 'Onboard new clients',
    summary: 'Closed-won to kickoff without a dropped step.',
    steps: [
      'Trigger when a deal moves to closed-won in Ledger',
      'Verify payment landed with Processor Confirm before anything ships',
      'Send the welcome pack and countersigned agreement within 24 hours',
      'Create their Slack channel, invite the client team, pin the scope doc',
      'Book the kickoff call inside 5 business days and confirm attendance',
      'Collect access and assets (logins, brand kit, tracking) in one request',
      'Hand to Client Success with full context notes and the risk flags',
    ],
  },
  {
    id: 'sop-client-success', departmentId: 'dept-clients', assigneeKind: 'agent', assigneeId: 'client-success',
    title: 'Service active clients',
    summary: 'Cadence, deliverables and renewals on rails.',
    steps: [
      'Run the weekly check-in cadence per client, no skipped weeks',
      'Track deliverables against the sold scope and flag slippage early',
      'Log Recall call notes back to the client record the same day',
      'Score account health monthly: green, watch, or at risk with a reason',
      'Raise renewals and upsell openings 30 days out to Sasha and Sales',
    ],
  },
  {
    id: 'sop-mia', departmentId: 'dept-comms', assigneeKind: 'person', assigneeId: 'person-mia',
    title: 'Handle escalations & VIP replies',
    summary: 'The human hands on the threads that need judgment.',
    steps: [
      'Review the escalation queue the workers built overnight',
      'Draft replies in Alex’s voice for VIP threads',
      'Send what is cleared, file the rest for Alex’s approval',
      'Chase any thread waiting on us for more than 24 hours',
      'Close the loop in /comms so nothing dangles',
    ],
  },
  {
    id: 'sop-dana', departmentId: 'dept-finance', assigneeKind: 'person', assigneeId: 'person-dana',
    title: 'Close the books monthly',
    summary: 'The human sign-off on every month’s numbers.',
    steps: [
      'Import bank and processor statements for the month by the 3rd',
      'Categorize transactions using the statement’s own categories',
      'Reconcile against the income the agents recorded and chase every gap',
      'Confirm refunds and disputes are reflected in the venture totals',
      'Deliver the month-end P&L to Alex with three lines of commentary',
    ],
  },
  {
    id: 'sop-sasha', departmentId: 'dept-clients', assigneeKind: 'person', assigneeId: 'person-sasha',
    title: 'Own the client relationships',
    summary: 'The human accountable for every account.',
    steps: [
      'Run kickoff and quarterly business review calls',
      'Resolve escalations the same day they land',
      'Approve scope changes before work starts',
      'Review account health scores with Client Success monthly',
      'Sign off renewals and hand pricing changes to Sales',
    ],
  },
];

// The tool registry behind /reference and the graph. `status` is honest about
// what the host can actually reach: connected = credentials or binary present
// and working; available = implemented but waiting on a key or a running service.
const tools: Tool[] = [
  // Knowledge
  { id: 'tool-gbrain', name: 'G-Brain (gbrain CLI)', category: 'Knowledge', status: 'connected', color: GRAY.white, description: 'Markdown brain-store plus a hosted vector backend and local embeddings.' },
  { id: 'tool-brain-store', name: 'brain-store/', category: 'Knowledge', status: 'connected', color: GRAY.light, description: 'Local markdown knowledge base on disk.' },
  { id: 'tool-ollama', name: 'Ollama (bge-m3)', category: 'Knowledge', status: 'connected', color: GRAY.mid, description: 'Local 1024d embeddings behind gbrain hybrid search, plus the local rerank pass. No key, no vendor.' },
  { id: 'tool-supabase', name: 'Supabase (Second Brain)', category: 'Knowledge', status: 'available', color: GRAY.mid, description: 'Roughly a thousand pages of chunked knowledge. A free tier pauses on idle: unpause from the dashboard when queries fail.' },
  { id: 'tool-obsidian', name: 'Notes Vault', category: 'Knowledge', status: 'connected', color: GRAY.light, description: 'Local notes vault. Direct filesystem access.' },
  // Social & growth
  { id: 'tool-postly', name: 'Postly', category: 'Social', status: 'connected', color: GRAY.white, description: 'Six platforms behind one publishing account (IG, TikTok, X…). Key comes from the environment.' },
  { id: 'tool-dmflow', name: 'DMFlow', category: 'Social', status: 'connected', color: GRAY.white, description: 'DM automation, live via the standalone DMFlow MCP. Keyword flows are still authored in the DMFlow UI: the public API has no flow authoring.' },
  { id: 'tool-skool', name: 'Skool (via Playwright)', category: 'Social', status: 'connected', color: GRAY.mid, description: 'launchpad-cohort community, driven by the documented Playwright workflow.' },
  // CRM & revenue
  { id: 'tool-ledger', name: 'Ledger', category: 'CRM & Revenue', status: 'connected', color: GRAY.white, description: 'Vantage and Launchpad Cohort deals, read-scoped (query records, not lists).' },
  { id: 'tool-paykit', name: 'PayKit', category: 'CRM & Revenue', status: 'planned', color: GRAY.light, description: 'Offer/payment/customer context for Sales, including the Vantage PayKit lane.' },
  { id: 'tool-flexpay', name: 'FlexPay', category: 'CRM & Revenue', status: 'planned', color: GRAY.mid, description: 'Financing options for sales offers and payment-plan context.' },
  { id: 'tool-stripe', name: 'Stripe', category: 'CRM & Revenue', status: 'available', color: GRAY.light, description: 'Full client implemented — balance + charges live once STRIPE_SECRET_KEY is set.' },
  { id: 'tool-ghl', name: 'GoHighLevel', category: 'CRM & Revenue', status: 'planned', color: GRAY.dark, description: 'CLI wrapper scaffolded; no keys configured.' },
  { id: 'tool-recall', name: 'Recall', category: 'CRM & Revenue', status: 'available', color: GRAY.mid, description: 'AI meeting notetaker. Needs RECALL_API_KEY for API access.' },
  { id: 'tool-plaud', name: 'Plaud', category: 'CRM & Revenue', status: 'connected', color: GRAY.light, description: 'Pocket voice recorder for the room: in-person client meetings, site walks, memos. Transcripts + AI notes over its API; pairs with Recall on the Recordings tab.' },
  { id: 'tool-trakyo', name: 'Trakyo', category: 'CRM & Revenue', status: 'planned', color: GRAY.dim, description: 'Revenue attribution for Launchpad Cohort: content → booked calls → payments. Status-only until Trakyo ships a public API (TRAKYO_API_KEY).' },
  // Creative studio
  { id: 'tool-reelkit', name: 'Reelkit Pipeline', category: 'Creative', status: 'connected', color: GRAY.white, description: 'Local render pipeline with per-brand themes and a skill library.' },
  { id: 'tool-renderly', name: 'Renderly CLI', category: 'Creative', status: 'connected', color: GRAY.light, description: 'Authenticated CLI: generate / product-photoshoot / marketing-studio / soul-id.' },
  { id: 'tool-adsmith', name: 'Adsmith', category: 'Creative', status: 'connected', color: GRAY.mid, description: 'UGC ads for Vantage (Veo/Sora/Kling). Basic auth from env.' },
  { id: 'tool-whisper', name: 'Whisper (local)', category: 'Creative', status: 'connected', color: GRAY.dim, description: 'Local transcription CLI plus ffmpeg. Nothing leaves the host.' },
  { id: 'tool-miro', name: 'Miro', category: 'Creative', status: 'connected', color: GRAY.mid, description: 'REST API with a token from the environment. Architecture boards live here.' },
  { id: 'tool-canva-figma', name: 'Canva + Figma', category: 'Creative', status: 'available', color: GRAY.dark, description: 'Connected as session-scoped MCPs. A standalone API needs separate keys.' },
  // Comms
  { id: 'tool-imap', name: 'Email (4 IMAP slots)', category: 'Comms', status: 'available', color: GRAY.light, description: 'Client implemented for 4 inboxes — set INBOX_1..4_HOST/_USER/_PASS.' },
  { id: 'tool-slack', name: 'Slack', category: 'Comms', status: 'available', color: GRAY.mid, description: 'Client implemented. Needs a bot token with channels:read/history scopes.' },
  { id: 'tool-dictate', name: 'Dictate Flow', category: 'Comms', status: 'connected', color: GRAY.white, description: 'Voice dictation. Its local SQLite history is read live.' },
  { id: 'tool-whatsapp', name: 'WhatsApp', category: 'Comms', status: 'connected', color: GRAY.white, description: 'Desktop app local ChatStorage.sqlite, read-only: local team chats.' },
  // Orchestration & infra
  { id: 'tool-command-center', name: 'Command Center (:4000)', category: 'Orchestration', status: 'available', color: GRAY.light, description: 'Kanban, brand deals, sales calls, SOPs and dispatch. Start it with npm run dev.' },
  { id: 'tool-clawline', name: 'Clawline Gateway', category: 'Orchestration', status: 'available', color: GRAY.dim, description: 'Dormant: gateway offline and token missing. Needs a reinstall.' },
  { id: 'tool-tmux', name: 'tmux', category: 'Orchestration', status: 'connected', color: GRAY.mid, description: 'Multi-session orchestration. The dashboard reads the live session list.' },
  { id: 'tool-ollama', name: 'Ollama', category: 'Orchestration', status: 'available', color: GRAY.mid, description: 'Local LLM server :11434, no auth. Start it to enable free local inference.' },
  { id: 'tool-vercel', name: 'Vercel CLI', category: 'Orchestration', status: 'connected', color: GRAY.mid, description: 'Authenticated CLI. The deploy target for a public build.' },
  { id: 'tool-gh', name: 'GitHub CLI', category: 'Orchestration', status: 'connected', color: GRAY.dim, description: 'Authenticated CLI for repos, issues and releases.' },
  // Payments (registry awaiting keys)
  { id: 'tool-paypal', name: 'PayPal', category: 'Payments', status: 'planned', color: GRAY.mid, description: 'Registered in the processor registry; client lands when keys do.' },
  { id: 'tool-square', name: 'Square', category: 'Payments', status: 'planned', color: GRAY.dim, description: 'Registered in the processor registry; client lands when keys do.' },
  { id: 'tool-whop', name: 'Whop', category: 'Payments', status: 'planned', color: GRAY.dark, description: 'Registered in the processor registry; client lands when keys do.' },
];

// Every row names the phase it advances: the phase cards on /roadmap read
// their bar as done/total of the rows they own, so a row without a phase
// would quietly shrink a percentage instead of showing up in it.
const roadmap: RoadmapItem[] = [
  { id: 'rm-v1', title: 'FOUNDER OS v1 baseline', quarter: '2026-Q2', status: 'done', departmentId: 'dept-tech', description: 'Six views, SQLite repos, 32 tests.', phaseId: 'phase-2' },
  { id: 'rm-mono', title: 'Monochrome rebuild + real connectors', quarter: '2026-Q2', status: 'done', departmentId: 'dept-tech', description: 'Black & white theme; IMAP, Slack, Stripe, gbrain wired.', phaseId: 'phase-1' },
  { id: 'rm-gbrain', title: 'G-Brain provider live', quarter: '2026-Q2', status: 'done', departmentId: 'dept-tech', description: 'gbrain CLI doctor/query + brain-store local fallback.', phaseId: 'phase-1' },
  { id: 'rm-creds-email', title: 'Connect 4 email inboxes', quarter: '2026-Q2', status: 'done', departmentId: 'dept-comms', description: 'Four Gmail IMAP slots live on app passwords, feeding /comms.', phaseId: 'phase-1' },
  { id: 'rm-creds-slack', title: 'Connect Slack workspace', quarter: '2026-Q2', status: 'done', departmentId: 'dept-comms', description: 'Bot token reads channels + history for the per-client board.', phaseId: 'phase-1' },
  { id: 'rm-creds-payments', title: 'Connect payment processors', quarter: '2026-Q2', status: 'done', departmentId: 'dept-finance', description: 'Stripe live; PayKit, PayPal and Square in the registry.', phaseId: 'phase-1' },
  { id: 'rm-supabase', title: 'Revive Supabase Second Brain', quarter: '2026-Q2', status: 'done', departmentId: 'dept-tech', description: 'Free-tier project unpaused; gbrain hybrid queries resolve again.', phaseId: 'phase-1' },
  { id: 'rm-scheduler', title: 'Agent scheduler (cron runs)', quarter: '2026-Q3', status: 'done', departmentId: 'dept-tech', description: 'Seven schedules on a 60s tick with cron_runs history and catch-up.', phaseId: 'phase-3' },
  { id: 'rm-llm', title: 'LLM summarization layer', quarter: '2026-Q3', status: 'done', departmentId: 'dept-tech', description: 'Agent chat and digests through the AI Gateway, with model failover.', phaseId: 'phase-3' },
  { id: 'rm-host', title: 'Migrate to a dedicated host', quarter: '2026-Q3', status: 'done', departmentId: 'dept-tech', description: 'App, gbrain and agents run on the host; Supabase stays managed.', phaseId: 'phase-4' },
  { id: 'rm-embeddings', title: 'Own the embedding stack', quarter: '2026-Q3', status: 'done', departmentId: 'dept-tech', description: 'Brain moved onto local embeddings before the hosted vendor went away.', phaseId: 'phase-1' },
  { id: 'rm-call-archive', title: 'Archive every sales call', quarter: '2026-Q3', status: 'done', departmentId: 'dept-sales', description: 'CRM and notetaker transcripts exported into brain-store as one page each.', phaseId: 'phase-2' },
  { id: 'rm-recorders', title: 'Voice recorders into the brain', quarter: '2026-Q3', status: 'done', departmentId: 'dept-sales', description: 'Pocket recorder and Recall on /comms; transcripts file themselves into G-Brain.', phaseId: 'phase-2' },
  { id: 'rm-trading', title: 'Trading board', quarter: '2026-Q3', status: 'done', departmentId: 'dept-finance', description: 'Robinhood and Phantom sleeves, agent reasoning, orders and trade log.', phaseId: 'phase-2' },
  { id: 'rm-usage', title: 'Token burn board', quarter: '2026-Q3', status: 'done', departmentId: 'dept-tech', description: 'Live seat-by-seat spend after the August burn; other boxes push in.', phaseId: 'phase-2' },
  { id: 'rm-workers', title: 'Worker pool on the host', quarter: '2026-Q3', status: 'now', departmentId: 'dept-tech', description: 'Cheap model seats behind the Conductor. Hardening and gateway install left.', phaseId: 'phase-3' },
  { id: 'rm-statements', title: 'Statement ingestion', quarter: '2026-Q3', status: 'now', departmentId: 'dept-finance', description: 'Card and bank statements parsed into /finances instead of hand entry.', phaseId: 'phase-1' },
  { id: 'rm-railway', title: 'Move hosting to Railway', quarter: '2026-Q3', status: 'now', departmentId: 'dept-tech', description: 'Every app moving to one platform; the gated OS demo went first as the pilot.', phaseId: 'phase-4' },
  { id: 'rm-ui', title: 'Interaction rebrand', quarter: '2026-Q3', status: 'now', departmentId: 'dept-tech', description: 'Alex-led design pass over the whole OS now the integrations are live.', phaseId: 'phase-2' },
  { id: 'rm-auth', title: 'Auth + remote access', quarter: '2026-Q4', status: 'next', departmentId: 'dept-tech', description: 'Reach FOUNDER OS on the host from anywhere, safely.', phaseId: 'phase-4' },
  { id: 'rm-postiz', title: 'Replace Postly with Postiz', quarter: '2026-Q4', status: 'next', departmentId: 'dept-clients', description: 'Self-hosted scheduler with ungated post and channel analytics.', phaseId: 'phase-1' },
  { id: 'rm-board-embed', title: 'Board fully inside the OS', quarter: '2026-Q4', status: 'later', departmentId: 'dept-tech', description: 'Conductor and 40+ agents driven from the OS, SOPs running as real skills.', phaseId: 'phase-3' },
];

// Honest zeros — these flip to live numbers as connectors come online.
const metrics: Metric[] = [
  { id: 'metric-unread', key: 'unread_total', label: 'Unread (all inboxes)', value: 0, unit: 'emails', delta: 0, period: 'pending creds' },
  { id: 'metric-brain', key: 'brain_pages', label: 'Brain-store Pages', value: 0, unit: 'pages', delta: 0, period: 'run Data Agent' },
  { id: 'metric-balance', key: 'stripe_available', label: 'Stripe Available', value: 0, unit: 'usd', delta: 0, period: 'pending creds' },
  { id: 'metric-runs', key: 'agent_runs', label: 'Agent Runs Logged', value: 0, unit: 'runs', delta: 0, period: 'all time' },
];

const domains: Domain[] = [
  { id: 'brm-1', number: 1, title: 'Command & Memory', color: GRAY.white, items: ['G-Brain (gbrain CLI)', 'brain-store markdown', 'Agent run history', 'Operator dashboard'] },
  { id: 'brm-2', number: 2, title: 'Email Operations', color: GRAY.light, items: ['Four IMAP inboxes', 'Unread triage', 'Per-inbox health', 'Digest (planned)'] },
  { id: 'brm-3', number: 3, title: 'Team Comms', color: GRAY.light, items: ['Slack channels', 'Message digests', 'Mention tracking (planned)'] },
  { id: 'brm-4', number: 4, title: 'Payments & Revenue', color: GRAY.mid, items: ['Stripe balance + charges', 'PayPal / Square / Whop registry', 'Reconciliation (planned)'] },
  { id: 'brm-5', number: 5, title: 'Knowledge & Docs', color: GRAY.mid, items: ['Notes vault', 'Local embeddings', 'Supabase Second Brain'] },
  { id: 'brm-6', number: 6, title: 'Agent Runtime', color: GRAY.dim, items: ['Registry + run()', 'Persisted run log', 'Honest failure states'] },
  { id: 'brm-7', number: 7, title: 'Infrastructure', color: GRAY.dim, items: ['Current host', 'dedicated host (next)', 'SQLite local', 'Supabase managed'] },
  { id: 'brm-8', number: 8, title: 'Security', color: GRAY.dark, items: ['.env.local secrets (gitignored)', 'Read-only connector scopes', 'No keys in repo'] },
];

const phases: Phase[] = [
  { id: 'phase-1', number: 1, title: 'Real Connections', items: ['4 email inboxes', 'Slack', 'Payment processors', 'G-Brain'] },
  { id: 'phase-2', number: 2, title: 'Real Agents', items: ['Runtime + run log', 'Honest status board', 'On-demand runs'] },
  { id: 'phase-3', number: 3, title: 'Autonomy', items: ['Scheduled runs', 'LLM digests', 'Failure alerts'] },
  { id: 'phase-4', number: 4, title: 'Dedicated Host', items: ['Migrate compute', 'Remote access + auth', '24/7 uptime'] },
];

// The @founderos.ai footprint, handles straight from the Postly config.
const socialAccounts: SocialAccount[] = [
  { platform: 'instagram', handle: '@founderos.ai', url: 'https://instagram.com/founderos.ai', order: 1 },
  { platform: 'tiktok', handle: '@founderos.ai', url: 'https://tiktok.com/@founderos.ai', order: 2 },
  { platform: 'twitter', handle: '@Founderosai', url: 'https://x.com/Founderosai', order: 3 },
  { platform: 'youtube', handle: '@founderosai', url: 'https://youtube.com/@founderosai', order: 4 },
  { platform: 'linkedin', handle: 'Alex Rivera', url: null, order: 5 },
];

// Demo follower counts. LinkedIn has no baseline in this demo, so it gets
// honest nulls until scrapes land. Live syncs append from here.
// 91 days of DAILY snapshot dates ending on the final seeded capture, so
// the audience lines read densely at every 7/30/60/all-time window — which is
// also how the live daily Postly sync will fill them going forward.
const SERIES_END = '2026-06-12';
const SERIES_LEN = 91;
const SERIES_DATES: string[] = (() => {
  const end = new Date(`${SERIES_END}T00:00:00Z`);
  const out: string[] = [];
  for (let i = SERIES_LEN - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
})();

/**
 * Deterministic upward ramp from `start` to `end` across SERIES_DATES, with a
 * seeded organic wobble (two mixed frequencies + a slow drift) so daily history
 * reads like real growth rather than a straight line. The final point is forced
 * to `end` so the latest dummy value matches the seeded current value.
 */
function ramp(start: number, end: number, seed: number): number[] {
  const n = SERIES_DATES.length;
  const span = Math.abs(end - start);
  return SERIES_DATES.map((_, i) => {
    if (i === n - 1) return end;
    const t = i / (n - 1);
    // Smooth-ish accelerating trend (subtle S-curve) plus layered jitter.
    const trend = start + (end - start) * (0.7 * t + 0.3 * t * t);
    const wobble =
      (Math.sin(i * 0.7 + seed) * 0.6 + Math.sin(i * 0.27 + seed * 2) * 0.4) * span * 0.012;
    return Math.max(0, Math.round(trend + wobble));
  });
}

// Demo current follower counts; LinkedIn history is fully DUMMY. Each
// platform ramps up to its current value.
const FOLLOWER_TARGETS: { platform: SocialAccount['platform']; start: number; end: number }[] = [
  { platform: 'instagram', start: 30000, end: 42000 },
  { platform: 'tiktok', start: 6000, end: 12000 },
  { platform: 'twitter', start: 3000, end: 5200 },
  { platform: 'youtube', start: 300, end: 900 },
  { platform: 'linkedin', start: 800, end: 1500 },
];

const socialBaseline: SocialSnapshot[] = FOLLOWER_TARGETS.flatMap((t, ti) =>
  ramp(t.start, t.end, ti + 1).map((followers, i) => ({
    platform: t.platform,
    capturedAt: SERIES_DATES[i],
    followers,
    // the final seeded point keeps its source; history is seeded dummy
    source: i === SERIES_DATES.length - 1 && t.platform !== 'linkedin' ? 'postly-config' : 'seed-dummy',
  })),
);

// Email list — demo newsletter snapshot. The provider's stats endpoint exposes
// only current + all-time aggregates, not a daily series, so we seed the honest
// shape: the list exists from a single import date and sits essentially flat
// over the window. Once BEEHIIV_API_KEY lands, syncBeehiivEmail overwrites
// today's point with the live count.
const BEEHIIV_IMPORT_DATE = '2026-05-28';
const BEEHIIV_ACTIVE_SUBSCRIBERS = 1850;
const emailListDates = SERIES_DATES.filter((d) => d >= BEEHIIV_IMPORT_DATE);
const emailListBaseline: EmailListSnapshot[] = emailListDates.map((capturedAt, i) => ({
  capturedAt,
  // flat since the import; the final point is the seeded current value
  subscribers: i === emailListDates.length - 1 ? BEEHIIV_ACTIVE_SUBSCRIBERS : BEEHIIV_ACTIVE_SUBSCRIBERS - 1,
  source: 'seed-beehiiv',
}));

// DM counts — DUMMY until a DMFlow/Postly source is wired. Current totals…
const DM_TARGETS: { platform: SocialDm['platform']; start: number; end: number }[] = [
  { platform: 'instagram', start: 800, end: 1200 },
  { platform: 'tiktok', start: 200, end: 400 },
  { platform: 'twitter', start: 120, end: 200 },
  { platform: 'youtube', start: 25, end: 60 },
  { platform: 'linkedin', start: 45, end: 90 },
];
const socialDms: SocialDm[] = DM_TARGETS.map((t) => ({
  platform: t.platform,
  count: t.end,
  updatedAt: '2026-06-12',
}));

// Instagram DM inbox — realistic seeded conversations so the /social DM tab is
// alive on a fresh clone. DUMMY until the DMFlow webhook feeds it live
// (source 'seed-dummy'; real messages arrive as source 'dmflow'). Four
// threads, inbound + outbound, believable Vantage / FounderOS lead-gen tone.
const socialDmMessages: SocialDmMessage[] = [
  // Alex — agency owner off a reel
  ['ig-alex', 'Alex Rivera', 'alex.rivera', 'in', 'saw your reel on the 3-agent setup 🔥 do you actually work with agencies?', null, '2026-07-18T14:02:00.000Z'],
  ['ig-alex', 'Alex Rivera', 'alex.rivera', 'out', 'appreciate it! yeah — agencies are exactly who Vantage is built for. what are you running right now?', null, '2026-07-18T14:09:00.000Z'],
  ['ig-alex', 'Alex Rivera', 'alex.rivera', 'in', 'SMMA, ~12 clients, drowning in fulfillment tbh 😅', null, '2026-07-18T14:15:00.000Z'],
  // Jordan — keyword flow "SCALE"
  ['ig-jordan', 'Jordan Blake', 'jordanbuilds', 'in', 'SCALE', 'SCALE', '2026-07-18T12:41:00.000Z'],
  ['ig-jordan', 'Jordan Blake', 'jordanbuilds', 'out', 'boom 💥 here’s the free breakdown → founderos.ai/scale. want me to show how it maps to your funnel?', 'SCALE', '2026-07-18T12:41:20.000Z'],
  ['ig-jordan', 'Jordan Blake', 'jordanbuilds', 'in', 'yes pls', null, '2026-07-18T13:05:00.000Z'],
  // Priya — story reply
  ['ig-priya', 'Priya N', 'priya.builds', 'in', 'replied to your story — I want OUT of retainer hell 😩', null, '2026-07-17T21:12:00.000Z'],
  ['ig-priya', 'Priya N', 'priya.builds', 'out', 'lol felt. that’s the whole thesis. what’s your current model — retainers or projects?', null, '2026-07-17T21:30:00.000Z'],
  // Sam — pricing question (unreplied → shows as needing attention)
  ['ig-sam', 'Sam Ortiz', 'sam.ortiz.co', 'in', 'what does pricing look like for the done-for-you build?', null, '2026-07-18T15:48:00.000Z'],
].map(([subscriberId, name, handle, direction, text, tag, ts], i) => ({
  id: `dm-${subscriberId}-${i}`,
  platform: 'instagram' as const,
  subscriberId: subscriberId as string,
  name: name as string,
  handle: handle as string,
  text: text as string,
  direction: direction as SocialDmMessage['direction'],
  tag: tag as string | null,
  ts: ts as string,
  source: 'seed-dummy',
}));
// …and the per-day history behind them, so DM growth charts over every window.
const socialDmSnapshots: SocialDmSnapshot[] = DM_TARGETS.flatMap((t, ti) =>
  ramp(t.start, t.end, ti + 50).map((count, i) => ({
    platform: t.platform,
    capturedAt: SERIES_DATES[i],
    count,
    source: 'seed-dummy',
  })),
);

// One example queued post so the composer's queue isn't empty on first load.
const socialPosts: SocialPost[] = [
  {
    id: 'post-seed-1',
    caption: 'New Vantage case study — 3x pipeline in 60 days. Full breakdown dropping this week 🚀',
    mediaUrl: null,
    platforms: ['instagram', 'tiktok', 'twitter'],
    status: 'queued',
    scheduledFor: null,
    createdAt: '2026-06-12T18:00:00Z',
  },
];

// ── Funnel journeys — DUMMY clients from first touch to conversion ──────────
// Real-ready: `source` on every touch names where it will come from live —
// 'trakyo' (organic attribution), 'meta-ads' (Meta Ads MCP), 'manual' until
// then. Swapping seed for live pulls is a repo-level change; the shape stays.
// Touch dates are DAYS-AGO offsets resolved at seed time, so the space's
// stall coloring (quiet > 7 days pre-conversion → red) stays truthful no
// matter when the DB is re-seeded.
const funnelDay = (daysBack: number): string =>
  new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10);

type SeededTouch = [FunnelTouch['stage'], FunnelTouch['channel'], string, FunnelTouch['source'], number];
type SeededJourney = {
  id: string;
  name: string;
  venture: FunnelContact['venture'];
  relationship: FunnelContact['relationship'];
  likelihood: number; // 0–100 likelihood-to-buy (dummy; later CRM/Trakyo-scored)
  product?: string;
  amountUsd?: number;
  email?: string; // dummy contact channels so the demo shows outreach actions
  phone?: string;
  person?: string; // the human behind the deal — demo dossier identity
  company?: string;
  role?: string;
  linkedin?: string;
  touches: SeededTouch[]; // 4–5, chronological (last number = days ago)
};

const FUNNEL_JOURNEYS: SeededJourney[] = [
  // — Launchpad Cohort (mentorship) —
  {
    id: 'fc-jake-moreau', name: 'Jake Moreau', venture: 'launchpad-cohort',
    relationship: 'hot', likelihood: 100,
    product: 'Launchpad Cohort — mentorship (PIF)', amountUsd: 6800,
    touches: [
      ['first_touch', 'organic', 'IG reel: "3 AI offers that close themselves"', 'trakyo', 59],
      ['engaged', 'dm', 'Replied to story CTA — "wants out of retainer hell"', 'manual', 57],
      ['nurtured', 'email', 'Day-3 email: student case study (0→22k/mo)', 'manual', 54],
      ['opted_in', 'call', 'Booked strategy call via Trakyo link', 'trakyo', 51],
      ['converted', 'checkout', 'Paid in full — PayKit checkout', 'manual', 49],
    ],
  },
  {
    id: 'fc-priya-shah', name: 'Priya Shah', venture: 'launchpad-cohort',
    relationship: 'warm', likelihood: 95,
    product: 'Launchpad Cohort — mentorship (3-pay)', amountUsd: 2600,
    touches: [
      ['first_touch', 'ads', 'Meta ad: "Agency owners — install AI in 30 days"', 'meta-ads', 45],
      ['engaged', 'ads', 'Watched VSL to 80% — retarget pool', 'meta-ads', 45],
      ['opted_in', 'webinar', 'Registered + attended the live training', 'manual', 42],
      ['converted', 'checkout', 'First of 3 payments — PayKit', 'manual', 40],
    ],
  },
  {
    id: 'fc-danny-okafor', name: 'Danny Okafor', venture: 'launchpad-cohort',
    relationship: 'hot', likelihood: 100,
    product: 'Launchpad Cohort — mentorship (PIF)', amountUsd: 6800,
    touches: [
      ['first_touch', 'organic', 'TikTok: "day in the life running an AI agency"', 'trakyo', 38],
      ['engaged', 'organic', 'Binged 6 reels, followed, saved lead magnet post', 'trakyo', 36],
      ['nurtured', 'ads', 'Retargeting ad: student-wins carousel', 'meta-ads', 33],
      ['opted_in', 'call', 'Booked call from link-in-bio (Trakyo attributed)', 'trakyo', 30],
      ['converted', 'checkout', 'Paid in full — PayKit checkout', 'manual', 29],
    ],
  },
  {
    id: 'fc-sofia-reyes', name: 'Sofia Reyes', venture: 'launchpad-cohort',
    relationship: 'warm', likelihood: 95,
    product: 'Launchpad Cohort — mentorship (3-pay)', amountUsd: 2600,
    touches: [
      ['first_touch', 'organic', 'YT long-form: "how I\'d start an agency in 2026"', 'trakyo', 31],
      ['engaged', 'email', 'Joined newsletter from YT description', 'manual', 30],
      ['nurtured', 'email', 'Newsletter: pricing-psychology issue clicked', 'manual', 26],
      ['opted_in', 'webinar', 'Attended the live training, stayed for offer', 'manual', 23],
      ['converted', 'checkout', 'First of 3 payments — PayKit', 'manual', 22],
    ],
  },
  {
    // Ads ghost — three engaged touches, quiet for 3 weeks: the red node.
    id: 'fc-liam-carter', name: 'Liam Carter', venture: 'launchpad-cohort',
    relationship: 'cold', likelihood: 15,
    touches: [
      ['first_touch', 'ads', 'Meta ad: "stop selling hours" (cold traffic)', 'meta-ads', 27],
      ['engaged', 'ads', 'Clicked through, watched VSL 45%', 'meta-ads', 27],
      ['engaged', 'ads', 'Retarget click — opened application form, abandoned', 'meta-ads', 23],
      ['engaged', 'email', 'Abandoned-form email opened, no reply yet', 'manual', 21],
    ],
  },
  {
    // Warm but drifting — 10 quiet days in nurture: also red until re-touched.
    id: 'fc-marcus-webb', name: 'Marcus Webb', venture: 'launchpad-cohort',
    relationship: 'warm', likelihood: 42,
    touches: [
      ['first_touch', 'organic', 'IG carousel: "agency niches that print in 2026"', 'trakyo', 24],
      ['engaged', 'dm', 'DMFlow keyword "SCALE" → DM flow', 'manual', 24],
      ['nurtured', 'email', 'Lead magnet delivered, day-1 email opened', 'manual', 12],
      ['nurtured', 'email', 'Newsletter: student-win breakdown clicked', 'manual', 10],
    ],
  },
  {
    id: 'fc-tayla-nguyen', name: 'Tayla Nguyen', venture: 'launchpad-cohort',
    relationship: 'hot', likelihood: 84,
    email: 'tayla.nguyen@example.com', phone: '+15550100841',
    touches: [
      ['first_touch', 'organic', 'TikTok: "AI receptionist demo" went semi-viral', 'trakyo', 4],
      ['engaged', 'organic', 'Profile visit → followed + commented', 'trakyo', 4],
      ['nurtured', 'dm', 'DM convo — asked about payment plans', 'manual', 3],
      ['opted_in', 'call', 'Call booked for next week (Trakyo attributed)', 'trakyo', 2],
    ],
  },
  {
    // Mid-decay: 70 quiet days — visibly fading toward red, 20 days from the archive.
    id: 'fc-remy-cole', name: 'Remy Cole', venture: 'launchpad-cohort',
    relationship: 'cold', likelihood: 25,
    touches: [
      ['first_touch', 'organic', 'IG reel: "fire your lead-gen agency"', 'trakyo', 84],
      ['engaged', 'dm', 'Story-reply convo, asked for pricing', 'manual', 80],
      ['engaged', 'email', 'Pricing breakdown sent, opened twice', 'manual', 74],
      ['engaged', 'email', 'Follow-up: "circling back" — no reply since', 'manual', 70],
    ],
  },
  {
    // Went quiet in March — decayed past 90 days into the archive tab.
    id: 'fc-jordan-blake', name: 'Jordan Blake', venture: 'launchpad-cohort',
    relationship: 'cold', likelihood: 20,
    touches: [
      ['first_touch', 'ads', 'Meta ad: "quit your 9-5 with one client" (old campaign)', 'meta-ads', 118],
      ['engaged', 'ads', 'Clicked through, watched VSL 30%', 'meta-ads', 118],
      ['engaged', 'dm', 'One-word DM reply, then silence', 'manual', 112],
      ['engaged', 'email', 'Re-engagement email bounced-opened, no click', 'manual', 104],
    ],
  },
  // — Vantage (AI agency clients) —
  {
    id: 'fc-ava-stone', name: 'Ava Stone — Northwind Legal', venture: 'vantage',
    relationship: 'hot', likelihood: 100,
    product: 'Vantage — AI intake build (sprint)', amountUsd: 12000,
    touches: [
      ['first_touch', 'organic', 'LinkedIn post: legal-intake automation teardown', 'trakyo', 57],
      ['engaged', 'email', 'Replied to newsletter — "this is our exact bottleneck"', 'manual', 55],
      ['opted_in', 'call', 'Discovery call booked via site (Trakyo attributed)', 'trakyo', 50],
      ['nurtured', 'email', 'Proposal + Loom walkthrough sent, viewed 3×', 'manual', 47],
      ['converted', 'checkout', 'Signed — 50% deposit via Stripe invoice', 'manual', 43],
    ],
  },
  {
    id: 'fc-omar-haddad', name: 'Omar Haddad — Pulse Fitness Group', venture: 'vantage',
    relationship: 'warm', likelihood: 95,
    product: 'Vantage — AI ops retainer (monthly)', amountUsd: 4500,
    touches: [
      ['first_touch', 'ads', 'Meta ad: "your gym\'s front desk, automated"', 'meta-ads', 48],
      ['engaged', 'ads', 'Case-study page dwell 4m — retarget pool', 'meta-ads', 47],
      ['nurtured', 'email', 'ROI one-pager emailed after form fill', 'manual', 44],
      ['opted_in', 'call', 'Demo call — 3 locations scoped', 'manual', 41],
      ['converted', 'checkout', 'Retainer live — Stripe subscription', 'manual', 37],
    ],
  },
  {
    id: 'fc-elena-brooks', name: 'Elena Brooks — Harbor Dental', venture: 'vantage',
    relationship: 'hot', likelihood: 100,
    product: 'Vantage — AI intake build (sprint)', amountUsd: 9500,
    touches: [
      ['first_touch', 'organic', 'IG reel: missed-call → booked-patient demo', 'trakyo', 31],
      ['engaged', 'dm', 'DM: "does this work for dental?"', 'manual', 30],
      ['opted_in', 'call', 'Discovery call via link-in-bio (Trakyo attributed)', 'trakyo', 27],
      ['converted', 'checkout', 'Signed — deposit via Stripe invoice', 'manual', 23],
    ],
  },
  {
    id: 'fc-noah-fields', name: 'Noah Fields — Fields Roofing', venture: 'vantage',
    relationship: 'warm', likelihood: 66,
    touches: [
      ['first_touch', 'ads', 'Meta ad: "book 20 estimates/mo on autopilot"', 'meta-ads', 8],
      ['engaged', 'ads', 'Lead form opened, 60% VSL', 'meta-ads', 8],
      ['nurtured', 'email', 'Follow-up sequence day 2 — case study clicked', 'manual', 5],
      ['opted_in', 'call', 'Discovery call booked for Friday', 'manual', 2],
    ],
  },
  {
    id: 'fc-grace-lin', name: 'Grace Lin — Lin & Co Accounting', venture: 'vantage',
    relationship: 'warm', likelihood: 74,
    email: 'grace@linandco.example.com', phone: '+15550100742',
    person: 'Grace Lin', company: 'Lin & Co Accounting', role: 'Managing Partner',
    linkedin: 'https://linkedin.com/in/gracelin-example',
    touches: [
      ['first_touch', 'organic', 'X thread: client-onboarding agent breakdown', 'trakyo', 6],
      ['engaged', 'organic', 'Followed + bookmarked, visited site twice', 'trakyo', 5],
      ['nurtured', 'email', 'Newsletter signup — welcome sequence started', 'manual', 3],
      ['opted_in', 'call', 'Call request form submitted (Trakyo attributed)', 'trakyo', 1],
    ],
  },
];

const funnelContacts: FunnelContact[] = FUNNEL_JOURNEYS.map((j) => ({
  id: j.id,
  name: j.name,
  venture: j.venture,
  status: j.touches[j.touches.length - 1][0], // furthest stage reached
  product: j.product ?? null,
  amountUsd: j.amountUsd ?? null,
  relationship: j.relationship,
  likelihood: j.likelihood,
  url: null,
  email: j.email ?? null,
  phone: j.phone ?? null,
  person: j.person ?? null,
  company: j.company ?? null,
  role: j.role ?? null,
  linkedin: j.linkedin ?? null,
  createdAt: funnelDay(j.touches[0][4]), // journey starts at the first touch
}));

const funnelTouches: FunnelTouch[] = FUNNEL_JOURNEYS.flatMap((j) =>
  j.touches.map(([stage, channel, label, source, daysBack], i) => ({
    id: `${j.id}-t${i + 1}`,
    contactId: j.id,
    seq: i + 1,
    stage,
    channel,
    label,
    source,
    at: funnelDay(daysBack),
  })),
);

// The machine, mapped: each venture's process as an owned chain of steps.
// Real-ready — owners, weekly hours, tools, the bottlenecks that leak money,
// and the automations (live or suggested) that carry the load back.
const workflows: Workflow[] = [
  {
    id: 'wf-vantage-sales',
    name: 'Vantage sales machine',
    subtitle: 'Cold outbound to closed retainer.',
    revenueUsd: 120_000,
    order: 0,
    steps: [
      {
        id: 'wf-mer-1',
        title: 'Run outbound campaigns',
        detail: '',
        branch: null,
        ownerKind: 'agent',
        owner: 'Postly Publisher',
        hoursPerWeek: 6,
        tools: ['postly', 'adsmith'],
        edgeLabel: 'replies',
        leakUsd: null,
        automation: { title: 'Always-on content + DM outreach', state: 'live', recoveredUsd: 4200 },
      },
      {
        id: 'wf-mer-2',
        title: 'Qualify replies',
        detail: '',
        branch: null,
        ownerKind: 'agent',
        owner: 'Comms Agent',
        hoursPerWeek: 9,
        tools: ['dmflow', 'gmail'],
        edgeLabel: 'qualified',
        leakUsd: 14_000,
        automation: { title: 'Auto-qualify + book', state: 'suggested', recoveredUsd: 9000 },
      },
      {
        id: 'wf-mer-3',
        title: 'Book demos',
        detail: '',
        branch: null,
        ownerKind: 'human',
        owner: 'Alex · Founder',
        hoursPerWeek: 4,
        tools: ['calendar', 'ledger'],
        edgeLabel: 'demo',
        leakUsd: null,
        automation: null,
      },
      {
        id: 'wf-mer-4',
        title: 'Sales call',
        detail: '',
        branch: null,
        ownerKind: 'human',
        owner: 'Alex · Founder',
        hoursPerWeek: 10,
        tools: ['ledger'],
        edgeLabel: 'proposal',
        leakUsd: null,
        automation: null,
      },
      {
        id: 'wf-mer-5',
        title: 'Proposal & follow-up',
        detail: '',
        branch: null,
        ownerKind: 'human',
        owner: 'Alex · Founder',
        hoursPerWeek: 5,
        tools: ['proposal-gen', 'gmail'],
        edgeLabel: 'won',
        leakUsd: 6000,
        automation: { title: 'Proposal follow-up sequence', state: 'suggested', recoveredUsd: 6000 },
      },
      {
        id: 'wf-mer-6',
        title: 'Onboard & deliver',
        detail: '',
        branch: null,
        ownerKind: 'agent',
        owner: 'Onboarding Agent',
        hoursPerWeek: 3,
        tools: ['ledger', 'slack'],
        edgeLabel: null,
        leakUsd: null,
        automation: { title: 'Onboarding rails', state: 'live', recoveredUsd: 3000 },
      },
    ],
  },
  {
    id: 'wf-lc-delivery',
    name: 'Launchpad Cohort delivery',
    subtitle: 'Webinar lead to retained program member.',
    revenueUsd: 80_000,
    order: 1,
    steps: [
      {
        id: 'wf-lc-1',
        title: 'Capture webinar leads',
        detail: '',
        branch: null,
        ownerKind: 'agent',
        owner: 'GoHighLevel',
        hoursPerWeek: 2,
        tools: ['ghl'],
        edgeLabel: 'registered',
        leakUsd: null,
        automation: { title: 'Webinar to GHL sync', state: 'live', recoveredUsd: 2500 },
      },
      {
        id: 'wf-lc-2',
        title: 'Nurture in GHL',
        detail: '',
        branch: null,
        ownerKind: 'agent',
        owner: 'GoHighLevel',
        hoursPerWeek: 3,
        tools: ['ghl'],
        edgeLabel: 'booked',
        leakUsd: 8000,
        automation: { title: 'Nurture sequences', state: 'live', recoveredUsd: 5000 },
      },
      {
        id: 'wf-lc-3',
        title: 'Strategy call',
        detail: '',
        branch: null,
        ownerKind: 'human',
        owner: 'Alex · Founder',
        hoursPerWeek: 8,
        tools: ['ghl', 'calendar'],
        edgeLabel: 'closed',
        leakUsd: null,
        automation: null,
      },
      {
        id: 'wf-lc-4',
        title: 'Deliver program',
        detail: '',
        branch: null,
        ownerKind: 'human',
        owner: 'LC Team',
        hoursPerWeek: 12,
        tools: ['skool'],
        edgeLabel: 'retained',
        leakUsd: 5000,
        automation: { title: 'Skool community ops', state: 'suggested', recoveredUsd: 4000 },
      },
      {
        id: 'wf-lc-5',
        title: 'Track attribution',
        detail: '',
        branch: null,
        ownerKind: 'agent',
        owner: 'Trakyo',
        hoursPerWeek: 1,
        tools: ['trakyo'],
        edgeLabel: null,
        leakUsd: null,
        automation: { title: 'Revenue attribution', state: 'suggested', recoveredUsd: 0 },
      },
    ],
  },
];

// Agent task board — seeded across open/doing/done so the Kanban is alive on
// first load. Demo cards; user-added tasks coexist (we insert by id, never wipe).
const SEED_TS = '2026-07-21T12:00:00.000Z';
const agentTasks: AgentTask[] = [
  { id: 'task-seed-1', agentId: 'comms-agent', title: 'Triage overnight inbound across 4 inboxes', status: 'open', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-2', agentId: 'social-agent', title: 'Draft 3 IG hooks for the Vantage launch', status: 'open', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-3', agentId: 'gmail-worker', title: 'Follow up on 6 unreplied warm leads', status: 'open', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-4', agentId: 'adsmith-creative', title: 'Generate 5 UGC variants for the new offer', status: 'open', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-5', agentId: 'postly-publisher', title: "Schedule this week's cross-platform posts", status: 'doing', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-6', agentId: 'comms-agent', title: 'Qualify 12 new DMs from the campaign', status: 'doing', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-7', agentId: 'reelkit-editor', title: 'Cut the sales-call highlight reel', status: 'doing', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-8', agentId: 'gmail-worker', title: 'Send the Vantage proposal follow-up', status: 'done', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-9', agentId: 'slack-worker', title: 'Post the Monday standup digest', status: 'done', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-10', agentId: 'social-agent', title: 'Publish the Tuesday carousel', status: 'done', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-11', agentId: 'postly-publisher', title: 'Sync follower counts across 6 platforms', status: 'done', createdAt: SEED_TS, updatedAt: SEED_TS },
];

const SKILL_STATUS_NOTE: Record<string, string> = {
  live: 'Live in production. The owning agent runs this today.',
  learning: 'In training. Runs with a human in the loop while it calibrates.',
  planned: 'Planned. Scoped and queued, not yet wired.',
};

/** Compose a real-ready SKILL.md doc from a skill's fields (viewed from its card). */
function skillDoc(s: Omit<Skill, 'markdown'>): string {
  const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const toolLine = s.tools.length ? s.tools.map((t) => `\`${t}\``).join(', ') : 'no external tools';
  return `---
name: ${slug}
description: ${s.description}
category: ${s.category}
status: ${s.status}
---

# ${s.name}

${s.description}

## When to use
Reach for this when the ${s.category.toLowerCase()} flow needs to ${s.name.toLowerCase()}. It runs on ${toolLine}.

## Status
${SKILL_STATUS_NOTE[s.status] ?? s.status}
`;
}

// The capability library the agent workforce draws on.
const skills: Omit<Skill, 'markdown'>[] = [
  { id: 'skill-outbound', name: 'Cold outbound sequencing', category: 'Sales', description: 'Multi-touch DM + content cadence that opens conversations at scale.', ownerAgentId: 'postly-publisher', status: 'live', tools: ['postly', 'dmflow'], order: 0 },
  { id: 'skill-qualify', name: 'Reply qualification', category: 'Sales', description: 'Reads inbound replies, scores intent, and books the qualified ones.', ownerAgentId: 'comms-agent', status: 'live', tools: ['dmflow', 'gmail'], order: 1 },
  { id: 'skill-proposal', name: 'Proposal drafting', category: 'Sales', description: 'Turns a call transcript into a tailored, on-brand proposal.', ownerAgentId: null, status: 'learning', tools: ['proposal-gen', 'ledger'], order: 2 },
  { id: 'skill-hooks', name: 'Hook writing', category: 'Content', description: 'Short-form hooks and captions tuned to each platform.', ownerAgentId: 'social-agent', status: 'live', tools: ['postly'], order: 3 },
  { id: 'skill-ugc', name: 'UGC generation', category: 'Content', description: 'Generates ad-ready UGC variants (Veo / Sora / Kling).', ownerAgentId: 'adsmith-creative', status: 'live', tools: ['adsmith'], order: 4 },
  { id: 'skill-edit', name: 'Video editing', category: 'Content', description: 'Cuts reels and highlight clips programmatically.', ownerAgentId: 'reelkit-editor', status: 'live', tools: ['reelkit'], order: 5 },
  { id: 'skill-schedule', name: 'Cross-post scheduling', category: 'Content', description: 'Queues and publishes across every connected platform.', ownerAgentId: 'postly-publisher', status: 'live', tools: ['postly'], order: 6 },
  { id: 'skill-triage', name: 'Inbox triage', category: 'Ops', description: 'Sorts the four inboxes into work / personal / misc and flags priority.', ownerAgentId: 'gmail-worker', status: 'live', tools: ['gmail'], order: 7 },
  { id: 'skill-dm', name: 'DM management', category: 'Ops', description: 'Handles Instagram and WhatsApp DMs end to end.', ownerAgentId: 'comms-agent', status: 'live', tools: ['dmflow', 'whatsapp'], order: 8 },
  { id: 'skill-retrieval', name: 'Knowledge retrieval', category: 'Ops', description: 'Hybrid search over G-Brain so every agent shares one memory.', ownerAgentId: 'conductor', status: 'live', tools: ['gbrain'], order: 9 },
  { id: 'skill-reconcile', name: 'Payment reconciliation', category: 'Ops', description: 'Matches processor payouts to clients across Stripe and PayKit.', ownerAgentId: null, status: 'planned', tools: ['stripe', 'paykit'], order: 10 },
  { id: 'skill-attribution', name: 'Revenue attribution', category: 'Ops', description: 'Ties content and calls to closed revenue via Trakyo.', ownerAgentId: null, status: 'planned', tools: ['trakyo', 'ghl'], order: 11 },
];

// A deterministic xorshift stream seeded from a string (no Math.random), so the
// seeded run history is stable across re-seeds.
function seedRand(str: string): () => number {
  let h = 2166136261 >>> 0;
  for (const c of str) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    return (h >>> 0) / 4294967295;
  };
}

// Leads/specialists run on the bigger model, workers on the cheaper one, so the
// cost analysis has real spread. About a third of agents are pure-connector and
// carry no token cost.
const RUN_MODEL_BY_TIER: Record<string, string> = {
  lead: 'claude-sonnet-5',
  specialist: 'claude-sonnet-5',
  worker: 'claude-haiku-4.5',
};

/**
 * Seeded agent-run history so /agents shows live runtimes and estimated spend
 * out of the box (demo-first). Stable ids (`seed-run-*`) keep re-seeds
 * idempotent and let the operator's own real runs coexist. Real token usage
 * flows in through lib/agents/runtime as agents actually run.
 */
function seededAgentRuns(agentList: Agent[]): AgentRun[] {
  const now = Date.now();
  const runs: AgentRun[] = [];
  for (const a of agentList) {
    const rnd = seedRand(`runs:${a.id}`);
    const count = 5 + Math.floor(rnd() * 10); // 5..14 runs each
    const usesModel = rnd() > 0.3; // ~2/3 of agents bill an LLM
    const model = RUN_MODEL_BY_TIER[a.tier] ?? 'claude-sonnet-5';
    for (let i = 0; i < count; i++) {
      const startedAt = new Date(now - rnd() * 20 * 86_400_000).toISOString(); // within ~3 weeks
      const durMs = 400 + Math.floor(rnd() * 7000);
      const finishedAt = new Date(Date.parse(startedAt) + durMs).toISOString();
      const ok = rnd() > 0.08;
      let tokensIn: number | null = null;
      let tokensOut: number | null = null;
      let runModel: string | null = null;
      let costUsd: number | null = null;
      if (usesModel) {
        tokensIn = 800 + Math.floor(rnd() * 14000);
        tokensOut = 200 + Math.floor(rnd() * 4000);
        runModel = model;
        costUsd = Math.round(runCostUsd(tokensIn, tokensOut, runModel) * 1e6) / 1e6;
      }
      runs.push({
        id: `seed-run-${a.id}-${i}`,
        agentId: a.id,
        startedAt,
        finishedAt,
        ok,
        summary: ok ? `${a.name} completed a run.` : `${a.name} run failed and was retried.`,
        model: runModel,
        tokensIn,
        tokensOut,
        costUsd,
      });
    }
  }
  return runs;
}

// --- Trading (Robinhood agentic account) -------------------------------------
// Seeded snapshot so /trading is alive before a real agent feeds it. Source
// 'seed' marks it as dummy; a live push (source 'robinhood') supersedes it.
const TRADING_AT = '2026-08-13T15:00:00.000Z';
const INDIV = { accountId: 'individual', accountLabel: 'Individual' };
const AGENTIC = { accountId: 'agentic', accountLabel: 'Agentic' };

const tradingSnapshots: TradingAccountSnapshot[] = [
  { ...INDIV, capturedAt: TRADING_AT, accountValueUsd: 10250.0, buyingPowerUsd: 2960.0, cashUsd: 2960.0, dayPnlUsd: 130.0, totalPnlUsd: 250.0, source: 'seed' },
  { ...AGENTIC, capturedAt: TRADING_AT, accountValueUsd: 1040.0, buyingPowerUsd: 420.0, cashUsd: 420.0, dayPnlUsd: 12.0, totalPnlUsd: 40.0, source: 'seed' },
];
// A few hours of agentic account value so the graph has a shape before a real
// agent has fed anything. Source 'seed' marks the whole series as dummy.
const tradingHistory: TradingAccountSnapshot[] = [
  { ...AGENTIC, capturedAt: '2026-08-13T11:00:00.000Z', accountValueUsd: 1000.0, buyingPowerUsd: 1000.0, cashUsd: 1000.0, dayPnlUsd: 0, totalPnlUsd: 0, source: 'seed' },
  { ...AGENTIC, capturedAt: '2026-08-13T12:00:00.000Z', accountValueUsd: 1004.7, buyingPowerUsd: 604.7, cashUsd: 604.7, dayPnlUsd: 4.7, totalPnlUsd: 4.7, source: 'seed' },
  { ...AGENTIC, capturedAt: '2026-08-13T13:00:00.000Z', accountValueUsd: 1021.9, buyingPowerUsd: 418.5, cashUsd: 418.5, dayPnlUsd: 21.9, totalPnlUsd: 21.9, source: 'seed' },
  { ...AGENTIC, capturedAt: '2026-08-13T14:00:00.000Z', accountValueUsd: 1016.4, buyingPowerUsd: 418.5, cashUsd: 418.5, dayPnlUsd: 16.4, totalPnlUsd: 16.4, source: 'seed' },
];
const tradingPositions: TradingPosition[] = [
  { ...INDIV, capturedAt: TRADING_AT, symbol: 'NVDA', quantity: 4, avgCostUsd: 902.1, marketValueUsd: 3812.6, unrealizedPnlUsd: 204.2 },
  { ...INDIV, capturedAt: TRADING_AT, symbol: 'AAPL', quantity: 8, avgCostUsd: 214.35, marketValueUsd: 1760.4, unrealizedPnlUsd: 45.6 },
  { ...INDIV, capturedAt: TRADING_AT, symbol: 'MSFT', quantity: 3, avgCostUsd: 428.0, marketValueUsd: 1301.7, unrealizedPnlUsd: 17.7 },
  { ...INDIV, capturedAt: TRADING_AT, symbol: 'VOO', quantity: 5, avgCostUsd: 82.9, marketValueUsd: 413.79, unrealizedPnlUsd: -1.71 },
];
const agenticPositions: TradingPosition[] = [
  { ...AGENTIC, capturedAt: TRADING_AT, symbol: 'SPY', quantity: 1, avgCostUsd: 601.4, marketValueUsd: 624.7, unrealizedPnlUsd: 23.3 },
];
const tradingActivity: TradeActivity[] = [
  { id: 'tr-seed-5', at: '2026-08-13T14:58:00.000Z', ...AGENTIC, agent: 'Markets Agent', action: 'buy', symbol: 'SPY', quantity: 1, priceUsd: 601.4, rationale: 'Parking idle buying power in the index sleeve.', status: 'filled' },
  { id: 'tr-seed-4', at: '2026-08-13T13:20:00.000Z', ...AGENTIC, agent: 'Markets Agent', action: 'sell', symbol: 'TSLA', quantity: 2, priceUsd: 240.8, rationale: 'Trimming into strength; thesis played out, rotating to cash.', status: 'filled' },
  { id: 'tr-seed-3', at: '2026-08-12T18:05:00.000Z', ...INDIV, agent: 'Operator (manual)', action: 'buy', symbol: 'AAPL', quantity: 4, priceUsd: 213.9, rationale: 'Dollar-cost tranche into the core holding.', status: 'filled' },
  { id: 'tr-seed-2', at: '2026-08-12T15:41:00.000Z', ...AGENTIC, agent: 'Markets Agent', action: 'buy', symbol: 'VOO', quantity: 5, priceUsd: 83.02, rationale: 'Parking idle buying power in the index sleeve.', status: 'filled' },
  { id: 'tr-seed-1', at: '2026-08-11T16:12:00.000Z', ...INDIV, agent: 'Operator (manual)', action: 'buy', symbol: 'MSFT', quantity: 3, priceUsd: 428.0, rationale: 'Initiating position per the approved watchlist.', status: 'filled' },
];


// --- Proposals -----------------------------------------------------------
// Client proposals are the one table this demo ships EMPTY on purpose: a real
// row carries a client's name, the deal size, and the share code that opens
// the page. Create them from the OS instead (they land with origin 'os', which
// a re-seed leaves alone). The export and its type stay so every reader of the
// Deliverables folder keeps compiling.
export const SEEDED_PROPOSALS: Proposal[] = [];

/**
 * Proposals, re-applied on every boot rather than only when the table is empty.
 *
 * getDb()'s guard fires when a table has NO rows, which back-fills a new table
 * but never propagates an EDIT to an existing one. So correcting a client name
 * or adding a proposal would land on a fresh clone and silently never reach the
 * host, whose database already has the old rows. Re-syncing here is cheap (a
 * handful of rows) and safe: seeded rows are replaced by id, and anything
 * Alex adds through the OS carries origin 'os' and is left alone.
 */
export function syncSeededProposals(db: FounderDb): void {
  for (const p of SEEDED_PROPOSALS) db.proposals.insert(p);
  db.proposals.deleteSeededNotIn(SEEDED_PROPOSALS.map((p) => p.id));
}

/**
 * Scheduled jobs that ship with the OS, starting with a 9am sweep of every
 * inbox, WhatsApp and Slack that lands as one ranked report. Seeded rather than
 * hand-created so they survive a fresh database and appear on every install; the runner is the tick in
 * instrumentation.ts -> POST /api/cron/tick.
 */
export const seededCrons: AgentCron[] = [
  {
    id: 'cron-comms-digest-0900',
    agentId: 'comms-digest',
    schedule: '0 9 * * *',
    description: 'Morning comms report: 24h of email, WhatsApp and Slack, ranked by who needs a reply',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
  },
  {
    id: 'cron-plaud-ingest-30m',
    agentId: 'sales-calls-data',
    schedule: '*/30 * * * *',
    description: 'File every newly transcribed Plaud recording into G-Brain (summary + transcript) and its action items into the claim store; no LLM, pure code',
    enabled: true,
    createdAt: '2026-08-26T00:00:00.000Z',
  },
  // Every cron below maps onto an agent whose run genuinely does the described
  // check. Each description says what that agent ACTUALLY does, not the job it
  // was proposed for: a cron fires the agent, it does not carry its own
  // instructions. Jobs with no agent behind them (nightly green check, offsite
  // backup, model-usage posture) belong in the host's own routine runner, so
  // they are deliberately absent rather than seeded as rows that would never
  // work.
  {
    id: 'cron-stack-monitor-0700',
    agentId: 'stack-monitor',
    schedule: '0 7 * * *',
    description: 'Local stack check: the command center, the worker pool, G-Brain and the CLIs the OS shells out to',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
  },
  {
    id: 'cron-payments-pulse-0800',
    agentId: 'payments-pulse',
    schedule: '0 8 * * *',
    description: 'Payment processors reachable, plus Stripe balance and recent charges',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
  },
  {
    id: 'cron-client-onboarding-0830',
    agentId: 'client-onboarding',
    schedule: '30 8 * * *',
    description: 'Onboarding SOP readiness: the Ledger trigger and the Slack workspace it provisions',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
  },
  {
    id: 'cron-crm-pulse-0900',
    agentId: 'crm-pulse',
    schedule: '0 9 * * 1-5',
    description: 'Ledger deals pipeline across Vantage and Launchpad Cohort',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
  },
  {
    id: 'cron-social-agent-1800',
    agentId: 'social-agent',
    schedule: '0 18 * * *',
    description: 'Postly publishing and Adsmith ad generation, checked before the evening',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
  },
];

/**
 * Bump this whenever the seed's CONTENT changes in a way production must see,
 * above all a removal.
 *
 * getDb() otherwise only seeds when a table is empty, so on a long-lived
 * install — where every table has been full for months — the seed would never
 * run at all: rows deleted from this file went on being served in production
 * because nothing ever re-ran the seed. The stamp forces exactly one re-seed
 * per change.
 */
export const SEED_VERSION = '2026-09-18-ui-port';

export function seedDatabase(db: FounderDb): void {
  // INSERT OR REPLACE in every repo makes re-seeding idempotent by id.
  for (const c of seededCrons) db.agentCrons.insert(c);
  for (const d of departments) db.departments.insert(d);
  for (const a of agents) db.agents.insert(a);
  // The roster IS the runtime: rows that left the roster leave the DB too,
  // and departments that left the operating model go with them.
  db.agents.deleteWhereIdNotIn(agents.map((a) => a.id));
  db.departments.deleteWhereIdNotIn(departments.map((d) => d.id));
  for (const p of people) db.people.insert(p);
  db.people.deleteWhereIdNotIn(people.map((p) => p.id));
  for (const m of leadMagnets) db.leadMagnets.insert(m);
  db.leadMagnets.deleteWhereIdNotIn(leadMagnets.map((m) => m.id));
  for (const t of sopTasks) db.sopTasks.insert(t);
  db.sopTasks.deleteWhereIdNotIn(sopTasks.map((t) => t.id));
  db.tools.deleteWhereIdNotIn(tools.map((t) => t.id));
  for (const w of workflows) db.workflows.insert(w);
  db.workflows.deleteWhereIdNotIn(workflows.map((w) => w.id));
  for (const s of skills) db.skills.insert({ ...s, markdown: skillDoc(s) });
  db.skills.deleteWhereIdNotIn(skills.map((s) => s.id));
  for (const t of agentTasks) db.agentTasks.insert(t); // insert-by-id; user tasks coexist
  // Seeded run history (idempotent by id) so /agents shows runtimes + spend; the
  // operator's own real runs (uuid ids) coexist and add real token cost over time.
  for (const r of seededAgentRuns(agents)) db.agentRuns.insert(r);
  for (const t of tools) db.tools.insert(t);
  for (const r of roadmap) db.roadmap.insert(r);
  // A row that left the seed left the plan: prune it so retired work cannot
  // outlive its removal on a long-lived install.
  db.roadmap.deleteWhereIdNotIn(roadmap.map((r) => r.id));
  for (const m of metrics) db.metrics.insert(m);
  for (const d of domains) db.domains.insert(d);
  for (const p of PERSONAS) db.personas.insert(p);
  for (const p of phases) db.phases.insert(p);
  for (const a of socialAccounts) db.social.upsertAccount(a);
  for (const s of socialBaseline) db.social.insertSnapshot(s);
  for (const d of socialDms) db.social.upsertDm(d);
  for (const s of socialDmSnapshots) db.social.insertDmSnapshot(s);
  for (const m of socialDmMessages) db.social.upsertDmMessage(m);
  // Retired dummy email history leaves the DB on re-seed; the seeded
  // baseline is authoritative. Live-synced snapshots survive.
  db.emailList.deleteSeeded();
  for (const s of emailListBaseline) db.emailList.insertSnapshot(s);
  for (const p of socialPosts) db.socialPosts.enqueue(p);
  for (const c of funnelContacts) db.funnel.insertContact(c);
  for (const t of funnelTouches) db.funnel.insertTouch(t);
  syncSeededProposals(db);
  // Trading is the one seeded island that a re-seed must NOT touch once it is
  // real. /trading is fed by the Markets agent through
  // POST /api/trading/*, and the seeded placeholder trades were deliberately
  // evicted from that log. A SEED_VERSION bump re-runs this whole function, so
  // without this guard every retirement would drag the fake trades back in.
  // NB latestSnapshot() sorts by account VALUE, not recency, so it cannot
  // answer "is this real?" — ask whether ANY account has a non-seed source.
  const liveTrading = db.trading.latestSnapshots().some((t) => t.source !== 'seed');
  if (!liveTrading) {
    for (const h of tradingHistory) db.trading.recordSnapshot(h, []);
    db.trading.recordSnapshot(tradingSnapshots[0], tradingPositions);
    db.trading.recordSnapshot(tradingSnapshots[1], agenticPositions);
    for (const a of tradingActivity) db.trading.recordActivity(a);
  }

  // Last: a half-finished seed must not claim to be up to date.
  db.meta.set('seed_version', SEED_VERSION);
}
