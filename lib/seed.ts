import type { FounderDb } from '@/lib/db';
import { PERSONAS } from '@/lib/personas-seed';
import type {
  Agent,
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

// Alex's five operating pillars (2026-06-12 directive).
const departments: Department[] = [
  { id: 'dept-sales', name: 'Sales', slug: 'sales', tagline: 'Pipeline and deals.', color: GRAY.white, order: 1 },
  { id: 'dept-marketing-growth', name: 'Marketing/Growth', slug: 'marketing-growth', tagline: 'Publishing, content, attention.', color: GRAY.light, order: 2 },
  { id: 'dept-tech', name: 'TECH', slug: 'tech', tagline: 'AI & automations · G-Brain.', color: GRAY.mid, order: 3 },
  { id: 'dept-finance', name: 'Finances', slug: 'finances', tagline: 'Every processor, one view.', color: GRAY.dim, order: 4 },
  { id: 'dept-comms', name: 'Communications', slug: 'communications', tagline: 'Gmail, WhatsApp, Slack → one feed.', color: GRAY.dark, order: 5 },
  { id: 'dept-clients', name: 'Clients', slug: 'clients', tagline: 'Every client, onboarded and served.', color: GRAY.light, order: 6 },
];

// The roster IS the runtime — every row here maps 1:1 to a RuntimeAgent in
// lib/agents/real.ts (enforced by tests/seed.test.ts). No larp agents.
//
// Shape: top-level agents (parentId null) are INSTANCE slots — each one is
// what becomes its own OpenClaw Hermes / Claude Code process on the Mac mini
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
    description: 'Fans your message out to every agent at once and checks which instance hosts (OpenClaw, Ollama, tmux) are available for future bindings.',
    model: 'fan-out runtime',
    tools: ['broadcast', 'openclaw', 'tmux'],
    parentId: null,
    instance: 'builtin',
  },
  // ── Communications: one instance, three channel workers feeding /comms ────────
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
    description: 'Reads the local WhatsApp ChatStorage (600+ chats incl. LC + Vantage teams) into /comms. Works today.',
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
    description: 'Owns publishing and content production. Aggregates the Zernio and Arcads workers.',
    model: 'aggregate of workers',
    tools: ['zernio', 'arcads', 'remotion', 'higgsfield', 'manychat'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'zernio-publisher',
    departmentId: 'dept-marketing-growth',
    name: 'Zernio Publisher',
    role: 'Six-Platform Publishing',
    status: 'active',
    tier: 'worker',
    description: 'Publishes and monitors six platforms under @founderos.ai via Zernio. Key already on this machine — works today.',
    model: 'zernio api',
    tools: ['zernio'],
    parentId: 'social-agent',
    instance: 'builtin',
  },
  {
    id: 'arcads-creative',
    departmentId: 'dept-marketing-growth',
    name: 'Arcads Creative',
    role: 'UGC Ad Generation',
    status: 'active',
    tier: 'worker',
    description: 'Generates UGC ads for Vantage (Veo/Sora/Kling) via the Arcads API. Auth on this machine — works today.',
    model: 'arcads api',
    tools: ['arcads'],
    parentId: 'social-agent',
    instance: 'builtin',
  },
  {
    id: 'remotion-editor',
    departmentId: 'dept-marketing-growth',
    name: 'Remotion Editor',
    role: 'Social Editing Pipeline',
    status: 'active',
    tier: 'worker',
    description: 'Editing and rendering pipeline for social media clips, captions, and promotional cuts.',
    model: 'remotion pipeline',
    tools: ['remotion', 'whisper'],
    parentId: 'social-agent',
    instance: 'builtin',
  },
  {
    id: 'higgsfield-creative',
    departmentId: 'dept-marketing-growth',
    name: 'Higgsfield Creative',
    role: 'AI Creative Studio',
    status: 'active',
    tier: 'worker',
    description: 'Higgsfield creative generation for social assets, product shots, and campaign visuals.',
    model: 'higgsfield cli',
    tools: ['higgsfield'],
    parentId: 'social-agent',
    instance: 'builtin',
  },
  {
    id: 'manychat-mcp',
    departmentId: 'dept-marketing-growth',
    name: 'ManyChat MCP',
    role: 'DM Automation',
    status: 'planned',
    tier: 'worker',
    description: 'ManyChat MCP/API lane for social DM automations, keyword flows, and lead capture.',
    model: 'manychat api',
    tools: ['manychat'],
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
    description: 'Owns the sales pillar. Aggregates CRM Pulse and reports the live Attio deals pipeline.',
    model: 'aggregate of workers',
    tools: ['attio', 'fanbasis', 'stripe', 'pava', 'fathom'],
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
    tools: ['attio', 'stripe', 'fanbasis'],
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
    description: 'Vantage sales lane: account pipeline, FanBasis context, payment confirmation, and call data.',
    model: 'account lane',
    tools: ['attio', 'stripe', 'fanbasis'],
    parentId: 'sales-agent',
    instance: 'builtin',
  },
  {
    id: 'fanbasis-sales',
    departmentId: 'dept-finance',
    name: 'FanBasis',
    role: 'Offer & Payment Platform',
    status: 'planned',
    tier: 'worker',
    description: 'FanBasis sales platform connection for offers and customer/payment context.',
    model: 'fanbasis api',
    tools: ['fanbasis'],
    parentId: 'payments-pulse',
    instance: 'builtin',
  },
  {
    id: 'vantage-fanbasis',
    departmentId: 'dept-sales',
    name: 'Vantage FanBasis',
    role: 'Vantage FanBasis Lane',
    status: 'planned',
    tier: 'worker',
    description: 'FanBasis lane specifically under Vantage for offer, payment, and customer context.',
    model: 'fanbasis api',
    tools: ['fanbasis'],
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
    tools: ['stripe', 'paypal', 'square', 'whop', 'fanbasis'],
    parentId: 'payments-pulse',
    instance: 'builtin',
  },
  {
    id: 'pava-financing',
    departmentId: 'dept-finance',
    name: 'PAVA Financing',
    role: 'Financing Options',
    status: 'planned',
    tier: 'worker',
    description: 'PAVA financing options lane for sales offers and payment-plan context.',
    model: 'pava api',
    tools: ['pava'],
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
    description: 'Sales calls data lane for recordings, notes, outcomes, and follow-up context.',
    model: 'fathom + crm',
    tools: ['fathom', 'attio'],
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
    tools: ['gbrain', 'brain-store', 'zeroentropy', 'supabase'],
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
    description: 'Walks the markdown brain-store: page counts per folder, strays at the root, empty folders. Works today.',
    model: 'fs walk',
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
    tools: ['supabase', 'zeroentropy'],
    parentId: 'data-agent',
    instance: 'builtin',
  },
  {
    id: 'notion-sync',
    departmentId: 'dept-tech',
    name: 'Notion Sync',
    role: 'Workspace Reader',
    status: 'planned',
    tier: 'specialist',
    description: 'Recently edited pages shared with the integration. Needs NOTION_API_KEY.',
    model: '@notionhq/client',
    tools: ['notion'],
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
    name: 'Attio CRM',
    role: 'ATTO / Attio Deals Pipeline',
    status: 'active',
    tier: 'worker',
    description: 'Vantage + LC deals from Attio, key reused from the MCP config. Works today.',
    model: 'attio api',
    tools: ['attio'],
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
    description: 'Remotion, Ollama, command-center, OpenClaw, tmux, whisper, ffmpeg, higgsfield, gh + Wispr Flow stats.',
    model: 'local checks',
    tools: ['remotion', 'ollama', 'tmux', 'wispr'],
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
    description: 'The single source of truth for who is a client: reconciles Attio and FanBasis against the funnel and keeps the roster current.',
    model: 'funnel + Attio',
    tools: ['attio', 'fanbasis'],
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
    model: 'attio + slack + notion',
    tools: ['attio', 'slack', 'notion'],
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
    description: 'Keeps active clients served: check-in cadence, deliverable tracking from call notes, renewal and upsell flags.',
    model: 'fathom + slack',
    tools: ['fathom', 'slack'],
    parentId: 'client-roster',
    instance: 'builtin',
  },
];

// ── Humans in the process ─────────────────────────────────────────────────────
// Real heads (Marco, Nadia) plus larp-first seeds for the roles Alex will hire
// into (rename when the real person lands). Tools use the agents' slug
// namespace so the graph chain still ends in tools for humans too.
const people: Person[] = [
  { id: 'person-marco', departmentId: 'dept-sales', name: 'Marco', role: 'Head of Sales', tools: ['fathom', 'attio'] },
  { id: 'person-nadia', departmentId: 'dept-marketing-growth', name: 'Nadia', role: 'Head of Growth & Marketing', tools: ['zernio', 'manychat'] },
  { id: 'person-mia', departmentId: 'dept-comms', name: 'Mia Torres', role: 'Executive Assistant', tools: ['imap', 'slack'] },
  { id: 'person-dana', departmentId: 'dept-finance', name: 'Dana Whitfield', role: 'Bookkeeper', tools: ['stripe', 'fanbasis'] },
  { id: 'person-rae', departmentId: 'dept-clients', name: 'Rae Winters', role: 'Account Manager', tools: ['attio', 'fathom'] },
];

// ── SOP tasks — every department role's job, written out ─────────────────────
// One task per worker, one worker per task (monogamous; tests enforce it).
// The chain the /brain graph draws: department → task → worker → tools.
const sopTasks: SopTask[] = [
  // TECH
  {
    id: 'sop-conductor', departmentId: 'dept-tech', assigneeKind: 'agent', assigneeId: 'conductor',
    title: 'Broadcast directives across the fleet',
    summary: 'One message in, every agent briefed, replies collected.',
    steps: [
      'Receive the directive from the operator console',
      'Resolve the target list: the whole fleet, or the pillar the directive names',
      'Poll instance hosts (OpenClaw, Ollama, tmux) for availability before dispatch',
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
      'Trigger ZeroEntropy re-embeds for drifted documents and verify counts after',
    ],
  },
  {
    id: 'sop-notion-sync', departmentId: 'dept-tech', assigneeKind: 'agent', assigneeId: 'notion-sync',
    title: 'Mirror the Notion workspace',
    summary: 'Shared pages flow into the knowledge core.',
    steps: [
      'List pages shared with the integration token',
      'Diff each page against the last synced version',
      'Pull changed blocks and normalize to markdown',
      'Index the fresh content into the knowledge core',
      'Record the sync watermark so the next run only pulls deltas',
    ],
  },
  {
    id: 'sop-stack-monitor', departmentId: 'dept-tech', assigneeKind: 'agent', assigneeId: 'stack-monitor',
    title: 'Watch the local stack',
    summary: 'Honest status for every port, session and binary.',
    steps: [
      'Probe ports 4000 / 3789 / 11434 / 18789',
      'Check tmux sessions and required brew binaries',
      'Record honest ConnectorStatus, never fake connected',
      'Compare against the last sweep to catch flapping services',
      'Alert the console when something that was up goes down',
    ],
  },

  // COMMUNICATIONS
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
    summary: '600+ chats read locally, LC + Vantage teams surfaced.',
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

  // MARKETING / GROWTH
  {
    id: 'sop-social-agent', departmentId: 'dept-marketing-growth', assigneeKind: 'agent', assigneeId: 'social-agent',
    title: 'Run the daily content pipeline',
    summary: 'Calendar → briefs → assets → publish queue.',
    steps: [
      'Pull today’s slots from the content calendar',
      'Brief the creative workers (Arcads, Higgsfield, Remotion) with hooks and formats',
      'Collect finished assets and check them against the brief',
      'Reject anything off-brand with a one-line reason so the fix is fast',
      'Queue approved posts for the Zernio publisher with per-platform captions',
      'Log what shipped to the calendar so tomorrow’s brief starts warm',
    ],
  },
  {
    id: 'sop-zernio-publisher', departmentId: 'dept-marketing-growth', assigneeKind: 'agent', assigneeId: 'zernio-publisher',
    title: 'Publish to six platforms',
    summary: 'One queue out to every @founderos.ai surface.',
    steps: [
      'Take the next queued post from the pipeline',
      'Adapt the caption per platform (IG, TikTok, X, YouTube, LinkedIn, Facebook)',
      'Publish through the Zernio API',
      'Record post ids and verify each went live',
      'Retry failed platforms once, then flag them to the Social Agent',
    ],
  },
  {
    id: 'sop-arcads-creative', departmentId: 'dept-marketing-growth', assigneeKind: 'agent', assigneeId: 'arcads-creative',
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
    id: 'sop-remotion-editor', departmentId: 'dept-marketing-growth', assigneeKind: 'agent', assigneeId: 'remotion-editor',
    title: 'Cut short-form edits',
    summary: 'Raw footage to platform-ready crops.',
    steps: [
      'Transcribe the source clip locally with Whisper',
      'Pick the hook and strongest segments from the transcript',
      'Render through the Remotion pipeline with the right theme (LC / Vantage)',
      'Check captions land on beat before exporting anything',
      'Export platform crops and hand them to the pipeline',
    ],
  },
  {
    id: 'sop-higgsfield-creative', departmentId: 'dept-marketing-growth', assigneeKind: 'agent', assigneeId: 'higgsfield-creative',
    title: 'Produce AI visuals',
    summary: 'Stills and motion from the creative brief.',
    steps: [
      'Read the creative brief and pick the matching Higgsfield model',
      'Generate stills or motion to the spec in the brief',
      'Cull to the strongest takes before spending on upscales',
      'Upscale the picks to delivery resolution',
      'Hand finals to the editor for assembly with the brief attached',
    ],
  },
  {
    id: 'sop-manychat-mcp', departmentId: 'dept-marketing-growth', assigneeKind: 'agent', assigneeId: 'manychat-mcp',
    title: 'Automate DM funnels',
    summary: 'Keyword triggers to booked conversations.',
    steps: [
      'Watch configured trigger keywords across platforms',
      'Fire the matching ManyChat flow for each trigger',
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
      'Pull every open deal and its stage from Attio each morning',
      'Rank deals by value and days-in-stage; anything past 7 days is stalled',
      'Attach a concrete next action and owner to every stalled deal',
      'Prepare payment links across FanBasis, Stripe and PAVA before calls',
      'Brief Marco with the top five deals and their objections before each call',
      'Log stage changes back to Attio the same day they happen',
    ],
  },
  {
    id: 'sop-lc-lane', departmentId: 'dept-sales', assigneeKind: 'agent', assigneeId: 'launchpad-cohort-sales',
    title: 'Run the Launchpad Cohort lane',
    summary: 'Webinar registrants to closed LC deals.',
    steps: [
      'Track LC leads from webinar registration to booked call',
      'Chase no-shows with the rebooking sequence within 24 hours',
      'Sync every stage change back to Attio',
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
      'Sync stage changes back to Attio',
      'Reconcile payments across FanBasis and Stripe',
      'Report lane revenue to the pipeline brief',
    ],
  },
  {
    id: 'sop-vantage-fanbasis', departmentId: 'dept-sales', assigneeKind: 'agent', assigneeId: 'vantage-fanbasis',
    title: 'Reconcile the Vantage FanBasis lane',
    summary: 'FanBasis customers matched to CRM deals.',
    steps: [
      'Pull month-to-date customers from FanBasis',
      'Match each payment to its Attio deal',
      'Flag payments with no deal and deals with no payment',
      'Chase every mismatch to a resolution, not just a flag',
      'Post month-to-date totals to Finances',
    ],
  },
  {
    id: 'sop-sales-calls-data', departmentId: 'dept-sales', assigneeKind: 'agent', assigneeId: 'sales-calls-data',
    title: 'Mine sales-call recordings',
    summary: 'Every Fathom call becomes CRM intelligence.',
    steps: [
      'Ingest Fathom notes after each recorded call',
      'Extract objections, commitments and next steps',
      'Write the extract back to the Attio record',
      'Tag calls where pricing or competitors came up',
      'Feed recurring patterns into the pipeline brief',
    ],
  },
  {
    id: 'sop-crm-pulse', departmentId: 'dept-sales', assigneeKind: 'agent', assigneeId: 'crm-pulse',
    title: 'Keep Attio clean',
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
    id: 'sop-fanbasis', departmentId: 'dept-finance', assigneeKind: 'agent', assigneeId: 'fanbasis-sales',
    title: 'Track FanBasis income',
    summary: 'Month-to-date, split by venture, refunds flagged.',
    steps: [
      'Pull month-to-date customers from the FanBasis API',
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
      'Check the claimed processor’s API (Stripe / PayPal / Square / Whop / FanBasis)',
      'Confirm the charge or flag the mismatch loudly',
      'Write the confirmation onto the deal record',
      'Keep an audit trail of every confirmation for month-end close',
    ],
  },
  {
    id: 'sop-pava', departmentId: 'dept-finance', assigneeKind: 'agent', assigneeId: 'pava-financing',
    title: 'Quote financing options',
    summary: 'Payment plans attached to live offers.',
    steps: [
      'Take the deal size and buyer profile from the lane',
      'Pull matching plan options from PAVA',
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

  // CLIENTS
  {
    id: 'sop-client-roster', departmentId: 'dept-clients', assigneeKind: 'agent', assigneeId: 'client-roster',
    title: 'Keep the client roster live',
    summary: 'One list of every client, always current.',
    steps: [
      'Pull clients and deal states from Attio and FanBasis every morning',
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
      'Trigger when a deal moves to closed-won in Attio',
      'Verify payment landed with Processor Confirm before anything ships',
      'Send the welcome pack and countersigned agreement within 24 hours',
      'Create their Slack channel, invite the client team, pin the scope doc',
      'Spin up the Notion workspace from the client template',
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
      'Log Fathom call notes back to the client record the same day',
      'Score account health monthly: green, watch, or at risk with a reason',
      'Raise renewals and upsell openings 30 days out to Rae and Sales',
    ],
  },
  {
    id: 'sop-rae', departmentId: 'dept-clients', assigneeKind: 'person', assigneeId: 'person-rae',
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

// Curated from the 2026-06-11 full-filesystem discovery sweep (104 findings).
// status reflects what was VERIFIED on this machine: connected = creds/binary
// exist and worked; available = installed/configured but needs a key or start.
const tools: Tool[] = [
  // Knowledge
  { id: 'tool-gbrain', name: 'G-Brain (gbrain CLI)', category: 'Knowledge', status: 'connected', color: GRAY.white, description: 'v0.41 · brain-store markdown + Supabase + ZeroEntropy embeddings. Live, health 90/100.' },
  { id: 'tool-brain-store', name: 'brain-store/', category: 'Knowledge', status: 'connected', color: GRAY.light, description: 'Local markdown knowledge base at knowledge/brain-store.' },
  { id: 'tool-zeroentropy', name: 'ZeroEntropy', category: 'Knowledge', status: 'connected', color: GRAY.mid, description: 'Vector embeddings behind gbrain hybrid search. Key in ~/.config/knowledge/config.json.' },
  { id: 'tool-supabase', name: 'Supabase (Second Brain)', category: 'Knowledge', status: 'available', color: GRAY.mid, description: '918 pages / 11k chunks. Free tier pauses on idle — unpause from dashboard when queries fail.' },
  { id: 'tool-obsidian', name: 'Notes Vault', category: 'Knowledge', status: 'connected', color: GRAY.light, description: '~/Documents/Notes Vault incl. archived-conversation Chat Archive. Direct filesystem access.' },
  { id: 'tool-notion', name: 'Notion', category: 'Knowledge', status: 'available', color: GRAY.dim, description: 'Client implemented. Set NOTION_API_KEY and share pages with the integration.' },
  // Social & growth
  { id: 'tool-zernio', name: 'Zernio', category: 'Social', status: 'connected', color: GRAY.white, description: '6 platforms under @founderos.ai (IG, TikTok, X…). Key at ~/.config/social/.env — live.' },
  { id: 'tool-manychat', name: 'ManyChat', category: 'Social', status: 'available', color: GRAY.dim, description: 'DM automation. Endpoint map fully documented in shared-config; needs MANYCHAT_API_KEY.' },
  { id: 'tool-skool', name: 'Skool (via Playwright)', category: 'Social', status: 'connected', color: GRAY.mid, description: 'launchpad-cohort community, driven by the documented Playwright workflow.' },
  // CRM & revenue
  { id: 'tool-attio', name: 'Attio', category: 'CRM & Revenue', status: 'connected', color: GRAY.white, description: 'Vantage + LC deals. Key reused from MCP config (read-scoped: query records, not lists).' },
  { id: 'tool-fanbasis', name: 'FanBasis', category: 'CRM & Revenue', status: 'planned', color: GRAY.light, description: 'Offer/payment/customer context for Sales, including the Vantage FanBasis lane.' },
  { id: 'tool-pava', name: 'PAVA', category: 'CRM & Revenue', status: 'planned', color: GRAY.mid, description: 'Financing options for sales offers and payment-plan context.' },
  { id: 'tool-stripe', name: 'Stripe', category: 'CRM & Revenue', status: 'available', color: GRAY.light, description: 'Full client implemented — balance + charges live once STRIPE_SECRET_KEY is set.' },
  { id: 'tool-ghl', name: 'GoHighLevel', category: 'CRM & Revenue', status: 'planned', color: GRAY.dark, description: 'CLI wrapper scaffolded in knowledge/scripts; keys never added.' },
  { id: 'tool-fathom', name: 'Fathom', category: 'CRM & Revenue', status: 'available', color: GRAY.mid, description: 'AI meeting notetaker, used daily. Needs FATHOM_API_KEY from settings for API access.' },
  { id: 'tool-webinarjam', name: 'WebinarJam', category: 'CRM & Revenue', status: 'available', color: GRAY.light, description: 'Launchpad Cohort webinar funnel — registrants & attendees are leads. Client implemented; set WEBINARJAM_API_KEY (account-wide).' },
  { id: 'tool-trakyo', name: 'Trakyo', category: 'CRM & Revenue', status: 'planned', color: GRAY.dim, description: 'Revenue attribution for Launchpad Cohort: content → booked calls → payments. Status-only until Trakyo ships a public API (TRAKYO_API_KEY).' },
  // Creative studio
  { id: 'tool-remotion', name: 'Remotion Pipeline', category: 'Creative', status: 'connected', color: GRAY.white, description: '~/Projects/remotion-pipeline · studio :3789 · LC + Vantage themes · 7 skills. Active Jun 10.' },
  { id: 'tool-higgsfield', name: 'Higgsfield CLI', category: 'Creative', status: 'connected', color: GRAY.light, description: 'v0.1.40, auth in keychain. generate / product-photoshoot / marketing-studio / soul-id.' },
  { id: 'tool-arcads', name: 'Arcads', category: 'Creative', status: 'connected', color: GRAY.mid, description: 'UGC ads for Vantage (Veo/Sora/Kling). Basic auth at ~/Projects/arcads-agent-skills/.env.' },
  { id: 'tool-whisper', name: 'Whisper (local)', category: 'Creative', status: 'connected', color: GRAY.dim, description: 'whisper-cli + ffmpeg via brew. Local transcription, nothing leaves the machine.' },
  { id: 'tool-miro', name: 'Miro', category: 'Creative', status: 'connected', color: GRAY.mid, description: 'REST API with token from knowledge/.env.agents. GBrain architecture board exists.' },
  { id: 'tool-canva-figma', name: 'Canva + Figma', category: 'Creative', status: 'available', color: GRAY.dark, description: 'Connected as Claude MCPs (session-scoped). Standalone API needs separate keys.' },
  // Comms
  { id: 'tool-imap', name: 'Email (4 IMAP slots)', category: 'Comms', status: 'available', color: GRAY.light, description: 'Client implemented for 4 inboxes — set INBOX_1..4_HOST/_USER/_PASS.' },
  { id: 'tool-slack', name: 'Slack', category: 'Comms', status: 'available', color: GRAY.mid, description: 'Client implemented. Needs a bot token with channels:read/history scopes.' },
  { id: 'tool-wispr', name: 'Wispr Flow', category: 'Comms', status: 'connected', color: GRAY.white, description: 'Voice dictation — heaviest daily-use tool found. Local flow.sqlite read live.' },
  { id: 'tool-whatsapp', name: 'WhatsApp', category: 'Comms', status: 'connected', color: GRAY.white, description: 'Desktop app local ChatStorage.sqlite, read-only: 600+ chats incl. LC + Vantage teams.' },
  // Orchestration & infra
  { id: 'tool-command-center', name: 'Command Center (:4000)', category: 'Orchestration', status: 'available', color: GRAY.light, description: 'command-center: kanban, brand deals, sales calls, SOPs, dispatch. Start with npm run dev.' },
  { id: 'tool-openclaw', name: 'OpenClaw Gateway', category: 'Orchestration', status: 'available', color: GRAY.dim, description: 'Dormant — gateway :18789 down, token exists at ~/.openclaw/openclaw.json. Needs repair/reinstall.' },
  { id: 'tool-tmux', name: 'tmux', category: 'Orchestration', status: 'connected', color: GRAY.mid, description: 'Multi-Claude session orchestration. Dashboard reads live session list.' },
  { id: 'tool-ollama', name: 'Ollama', category: 'Orchestration', status: 'connected', color: GRAY.light, description: 'Local LLM server :11434, no auth. Pull a model to enable free local inference.' },
  { id: 'tool-vercel', name: 'Vercel CLI', category: 'Orchestration', status: 'connected', color: GRAY.mid, description: 'v50, authenticated. Deploy target when FOUNDER OS goes public.' },
  { id: 'tool-gh', name: 'GitHub CLI', category: 'Orchestration', status: 'connected', color: GRAY.dim, description: 'gh 2.89, authenticated.' },
  // Payments (registry awaiting keys)
  { id: 'tool-paypal', name: 'PayPal', category: 'Payments', status: 'planned', color: GRAY.mid, description: 'Registered in the processor registry; client lands when keys do.' },
  { id: 'tool-square', name: 'Square', category: 'Payments', status: 'planned', color: GRAY.dim, description: 'Registered in the processor registry; client lands when keys do.' },
  { id: 'tool-whop', name: 'Whop', category: 'Payments', status: 'planned', color: GRAY.dark, description: 'Registered in the processor registry; client lands when keys do.' },
];

const roadmap: RoadmapItem[] = [
  { id: 'rm-v1', title: 'FOUNDER OS v1 baseline', quarter: '2026-Q2', status: 'done', departmentId: 'dept-tech', description: 'Six views, SQLite repos, 32 tests.' },
  { id: 'rm-mono', title: 'Monochrome rebuild + real connectors', quarter: '2026-Q2', status: 'done', departmentId: 'dept-tech', description: 'Black & white theme; IMAP, Slack, Stripe, Notion, gbrain wired.' },
  { id: 'rm-gbrain', title: 'G-Brain provider live', quarter: '2026-Q2', status: 'done', departmentId: 'dept-tech', description: 'gbrain CLI doctor/query + brain-store local fallback.' },
  { id: 'rm-creds-email', title: 'Connect 4 email inboxes', quarter: '2026-Q2', status: 'now', departmentId: 'dept-comms', description: 'App passwords / IMAP creds into .env.local slots 1-4.' },
  { id: 'rm-creds-slack', title: 'Connect Slack workspace', quarter: '2026-Q2', status: 'now', departmentId: 'dept-comms', description: 'Bot token with channels:read, channels:history.' },
  { id: 'rm-creds-payments', title: 'Connect payment processors', quarter: '2026-Q2', status: 'now', departmentId: 'dept-finance', description: 'Stripe first; PayPal/Square/Whop as keys land.' },
  { id: 'rm-creds-notion', title: 'Connect Notion workspace', quarter: '2026-Q2', status: 'now', departmentId: 'dept-tech', description: 'Internal integration secret + page shares.' },
  { id: 'rm-supabase', title: 'Revive Supabase Second Brain', quarter: '2026-Q2', status: 'now', departmentId: 'dept-tech', description: 'Unpause free-tier project so gbrain hybrid queries resolve again.' },
  { id: 'rm-scheduler', title: 'Agent scheduler (cron runs)', quarter: '2026-Q3', status: 'next', departmentId: 'dept-tech', description: 'Recurring agent runs with run history and failure alerts.' },
  { id: 'rm-llm', title: 'LLM summarization layer', quarter: '2026-Q3', status: 'next', departmentId: 'dept-tech', description: 'Claude API digests over inbox/Slack/payments data.' },
  { id: 'rm-macmini', title: 'Migrate to Mac mini (M4 Pro 24GB)', quarter: '2026-Q3', status: 'next', departmentId: 'dept-tech', description: 'Host app + gbrain + agents on the mini; Supabase stays managed.' },
  { id: 'rm-ui', title: 'UI design pass', quarter: '2026-Q4', status: 'later', departmentId: 'dept-tech', description: 'Alex-led redesign once all integrations are live.' },
  { id: 'rm-auth', title: 'Auth + remote access', quarter: '2026-Q4', status: 'later', departmentId: 'dept-tech', description: 'Reach FOUNDER OS on the mini from anywhere, safely.' },
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
  { id: 'brm-5', number: 5, title: 'Knowledge & Docs', color: GRAY.mid, items: ['Notion workspace', 'ZeroEntropy embeddings', 'Supabase Second Brain'] },
  { id: 'brm-6', number: 6, title: 'Agent Runtime', color: GRAY.dim, items: ['Registry + run()', 'Persisted run log', 'Honest failure states'] },
  { id: 'brm-7', number: 7, title: 'Infrastructure', color: GRAY.dim, items: ['MacBook (now)', 'Mac mini M4 Pro 24GB (next)', 'SQLite local', 'Supabase managed'] },
  { id: 'brm-8', number: 8, title: 'Security', color: GRAY.dark, items: ['.env.local secrets (gitignored)', 'Read-only connector scopes', 'No keys in repo'] },
];

const phases: Phase[] = [
  { id: 'phase-1', number: 1, title: 'Real Connections', items: ['4 email inboxes', 'Slack', 'Payment processors', 'Notion', 'G-Brain'] },
  { id: 'phase-2', number: 2, title: 'Real Agents', items: ['Runtime + run log', 'Honest status board', 'On-demand runs'] },
  { id: 'phase-3', number: 3, title: 'Autonomy', items: ['Scheduled runs', 'LLM digests', 'Failure alerts'] },
  { id: 'phase-4', number: 4, title: 'Mac Mini', items: ['Migrate compute', 'Remote access + auth', '24/7 uptime'] },
];

// The @founderos.ai footprint, handles straight from the Zernio config.
const socialAccounts: SocialAccount[] = [
  { platform: 'instagram', handle: '@founderos.ai', url: 'https://instagram.com/founderos.ai', order: 1 },
  { platform: 'tiktok', handle: '@founderos.ai', url: 'https://tiktok.com/@founderos.ai', order: 2 },
  { platform: 'twitter', handle: '@Founderosai', url: 'https://x.com/Founderosai', order: 3 },
  { platform: 'youtube', handle: '@founderosai', url: 'https://youtube.com/@founderosai', order: 4 },
  { platform: 'linkedin', handle: 'Alex Rivera', url: null, order: 5 },
];

// Demo follower counts. LinkedIn has no baseline in this demo, so it gets
// honest nulls until scrapes land. Live syncs append from here.
// 91 days of DAILY snapshot dates ending on the real 2026-06-12 capture, so
// the audience lines read densely at every 7/30/60/all-time window — which is
// also how the live daily Zernio sync will fill them going forward.
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
 * to `end` so the latest dummy value matches the real current count.
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
    // the real final capture keeps its honest source; history is seeded dummy
    source: i === SERIES_DATES.length - 1 && t.platform !== 'linkedin' ? 'zernio-config' : 'seed-dummy',
  })),
);

// Email list — demo Beehiiv snapshot. Beehiiv's stats endpoint exposes only
// current + all-time aggregates, not a daily series, so we seed the honest
// shape: the list exists from a single import date and sits essentially flat
// over the window. Once BEEHIIV_API_KEY lands, syncBeehiivEmail overwrites
// today's point with the live count.
const BEEHIIV_IMPORT_DATE = '2026-05-28';
const BEEHIIV_ACTIVE_SUBSCRIBERS = 2141;
const emailListDates = SERIES_DATES.filter((d) => d >= BEEHIIV_IMPORT_DATE);
const emailListBaseline: EmailListSnapshot[] = emailListDates.map((capturedAt, i) => ({
  capturedAt,
  // flat since the import; the final point is the real current count
  subscribers: i === emailListDates.length - 1 ? BEEHIIV_ACTIVE_SUBSCRIBERS : BEEHIIV_ACTIVE_SUBSCRIBERS - 1,
  source: 'seed-beehiiv',
}));

// DM counts — DUMMY until a ManyChat/Zernio source is wired. Current totals…
const DM_TARGETS: { platform: SocialDm['platform']; start: number; end: number }[] = [
  { platform: 'instagram', start: 820, end: 1240 },
  { platform: 'tiktok', start: 210, end: 386 },
  { platform: 'twitter', start: 120, end: 214 },
  { platform: 'youtube', start: 26, end: 58 },
  { platform: 'linkedin', start: 44, end: 92 },
];
const socialDms: SocialDm[] = DM_TARGETS.map((t) => ({
  platform: t.platform,
  count: t.end,
  updatedAt: '2026-06-12',
}));

// Instagram DM inbox — realistic seeded conversations so the /social DM tab is
// alive on a fresh clone. DUMMY until the ManyChat webhook feeds it live
// (source 'seed-dummy'; real messages arrive as source 'manychat'). Four
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
      ['converted', 'checkout', 'Paid in full — FanBasis checkout', 'manual', 49],
    ],
  },
  {
    id: 'fc-priya-shah', name: 'Priya Shah', venture: 'launchpad-cohort',
    relationship: 'warm', likelihood: 95,
    product: 'Launchpad Cohort — mentorship (3-pay)', amountUsd: 2600,
    touches: [
      ['first_touch', 'ads', 'Meta ad: "Agency owners — install AI in 30 days"', 'meta-ads', 45],
      ['engaged', 'ads', 'Watched VSL to 80% — retarget pool', 'meta-ads', 45],
      ['opted_in', 'webinar', 'Registered + attended WebinarJam training', 'manual', 42],
      ['converted', 'checkout', 'First of 3 payments — FanBasis', 'manual', 40],
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
      ['converted', 'checkout', 'Paid in full — FanBasis checkout', 'manual', 29],
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
      ['opted_in', 'webinar', 'Attended WebinarJam training, stayed for offer', 'manual', 23],
      ['converted', 'checkout', 'First of 3 payments — FanBasis', 'manual', 22],
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
      ['engaged', 'dm', 'ManyChat keyword "SCALE" → DM flow', 'manual', 24],
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
        ownerKind: 'agent',
        owner: 'Zernio Publisher',
        hoursPerWeek: 6,
        tools: ['zernio', 'arcads'],
        edgeLabel: 'replies',
        leakUsd: null,
        automation: { title: 'Always-on content + DM outreach', state: 'live', recoveredUsd: 4200 },
      },
      {
        id: 'wf-mer-2',
        title: 'Qualify replies',
        ownerKind: 'agent',
        owner: 'Comms Agent',
        hoursPerWeek: 9,
        tools: ['manychat', 'gmail'],
        edgeLabel: 'qualified',
        leakUsd: 14_000,
        automation: { title: 'Auto-qualify + book', state: 'suggested', recoveredUsd: 9000 },
      },
      {
        id: 'wf-mer-3',
        title: 'Book demos',
        ownerKind: 'human',
        owner: 'Alex · Founder',
        hoursPerWeek: 4,
        tools: ['calendar', 'attio'],
        edgeLabel: 'demo',
        leakUsd: null,
        automation: null,
      },
      {
        id: 'wf-mer-4',
        title: 'Sales call',
        ownerKind: 'human',
        owner: 'Alex · Founder',
        hoursPerWeek: 10,
        tools: ['webinarjam', 'attio'],
        edgeLabel: 'proposal',
        leakUsd: null,
        automation: null,
      },
      {
        id: 'wf-mer-5',
        title: 'Proposal & follow-up',
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
        ownerKind: 'agent',
        owner: 'Onboarding Agent',
        hoursPerWeek: 3,
        tools: ['attio', 'slack', 'notion'],
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
        ownerKind: 'agent',
        owner: 'WebinarJam',
        hoursPerWeek: 2,
        tools: ['webinarjam', 'ghl'],
        edgeLabel: 'registered',
        leakUsd: null,
        automation: { title: 'Webinar to GHL sync', state: 'live', recoveredUsd: 2500 },
      },
      {
        id: 'wf-lc-2',
        title: 'Nurture in GHL',
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
        ownerKind: 'human',
        owner: 'LC Team',
        hoursPerWeek: 12,
        tools: ['skool', 'notion'],
        edgeLabel: 'retained',
        leakUsd: 5000,
        automation: { title: 'Skool community ops', state: 'suggested', recoveredUsd: 4000 },
      },
      {
        id: 'wf-lc-5',
        title: 'Track attribution',
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
  { id: 'task-seed-4', agentId: 'arcads-creative', title: 'Generate 5 UGC variants for the new offer', status: 'open', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-5', agentId: 'zernio-publisher', title: "Schedule this week's cross-platform posts", status: 'doing', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-6', agentId: 'comms-agent', title: 'Qualify 12 new DMs from the campaign', status: 'doing', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-7', agentId: 'remotion-editor', title: 'Cut the sales-call highlight reel', status: 'doing', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-8', agentId: 'gmail-worker', title: 'Send the Vantage proposal follow-up', status: 'done', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-9', agentId: 'slack-worker', title: 'Post the Monday standup digest', status: 'done', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-10', agentId: 'social-agent', title: 'Publish the Tuesday carousel', status: 'done', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-11', agentId: 'zernio-publisher', title: 'Sync follower counts across 6 platforms', status: 'done', createdAt: SEED_TS, updatedAt: SEED_TS },
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
  { id: 'skill-outbound', name: 'Cold outbound sequencing', category: 'Sales', description: 'Multi-touch DM + content cadence that opens conversations at scale.', ownerAgentId: 'zernio-publisher', status: 'live', tools: ['zernio', 'manychat'], order: 0 },
  { id: 'skill-qualify', name: 'Reply qualification', category: 'Sales', description: 'Reads inbound replies, scores intent, and books the qualified ones.', ownerAgentId: 'comms-agent', status: 'live', tools: ['manychat', 'gmail'], order: 1 },
  { id: 'skill-proposal', name: 'Proposal drafting', category: 'Sales', description: 'Turns a call transcript into a tailored, on-brand proposal.', ownerAgentId: null, status: 'learning', tools: ['proposal-gen', 'attio'], order: 2 },
  { id: 'skill-hooks', name: 'Hook writing', category: 'Content', description: 'Short-form hooks and captions tuned to each platform.', ownerAgentId: 'social-agent', status: 'live', tools: ['zernio'], order: 3 },
  { id: 'skill-ugc', name: 'UGC generation', category: 'Content', description: 'Generates ad-ready UGC variants (Veo / Sora / Kling).', ownerAgentId: 'arcads-creative', status: 'live', tools: ['arcads'], order: 4 },
  { id: 'skill-edit', name: 'Video editing', category: 'Content', description: 'Cuts reels and highlight clips programmatically.', ownerAgentId: 'remotion-editor', status: 'live', tools: ['remotion'], order: 5 },
  { id: 'skill-schedule', name: 'Cross-post scheduling', category: 'Content', description: 'Queues and publishes across every connected platform.', ownerAgentId: 'zernio-publisher', status: 'live', tools: ['zernio'], order: 6 },
  { id: 'skill-triage', name: 'Inbox triage', category: 'Ops', description: 'Sorts the four inboxes into work / personal / misc and flags priority.', ownerAgentId: 'gmail-worker', status: 'live', tools: ['gmail'], order: 7 },
  { id: 'skill-dm', name: 'DM management', category: 'Ops', description: 'Handles Instagram and WhatsApp DMs end to end.', ownerAgentId: 'comms-agent', status: 'live', tools: ['manychat', 'whatsapp'], order: 8 },
  { id: 'skill-retrieval', name: 'Knowledge retrieval', category: 'Ops', description: 'Hybrid search over G-Brain so every agent shares one memory.', ownerAgentId: 'conductor', status: 'live', tools: ['gbrain'], order: 9 },
  { id: 'skill-reconcile', name: 'Payment reconciliation', category: 'Ops', description: 'Matches processor payouts to clients across Stripe and FanBasis.', ownerAgentId: null, status: 'planned', tools: ['stripe', 'fanbasis'], order: 10 },
  { id: 'skill-attribution', name: 'Revenue attribution', category: 'Ops', description: 'Ties content and calls to closed revenue via Trakyo.', ownerAgentId: null, status: 'planned', tools: ['trakyo', 'ghl'], order: 11 },
];

export function seedDatabase(db: FounderDb): void {
  // INSERT OR REPLACE in every repo makes re-seeding idempotent by id.
  for (const d of departments) db.departments.insert(d);
  for (const a of agents) db.agents.insert(a);
  // The roster IS the runtime: rows that left the roster leave the DB too,
  // and departments that left the operating model go with them.
  db.agents.deleteWhereIdNotIn(agents.map((a) => a.id));
  db.departments.deleteWhereIdNotIn(departments.map((d) => d.id));
  for (const p of people) db.people.insert(p);
  db.people.deleteWhereIdNotIn(people.map((p) => p.id));
  for (const t of sopTasks) db.sopTasks.insert(t);
  db.sopTasks.deleteWhereIdNotIn(sopTasks.map((t) => t.id));
  for (const w of workflows) db.workflows.insert(w);
  db.workflows.deleteWhereIdNotIn(workflows.map((w) => w.id));
  for (const s of skills) db.skills.insert({ ...s, markdown: skillDoc(s) });
  db.skills.deleteWhereIdNotIn(skills.map((s) => s.id));
  for (const t of agentTasks) db.agentTasks.insert(t); // insert-by-id; user tasks coexist
  for (const t of tools) db.tools.insert(t);
  for (const r of roadmap) db.roadmap.insert(r);
  for (const m of metrics) db.metrics.insert(m);
  for (const d of domains) db.domains.insert(d);
  for (const p of PERSONAS) db.personas.insert(p);
  for (const p of phases) db.phases.insert(p);
  for (const a of socialAccounts) db.social.upsertAccount(a);
  for (const s of socialBaseline) db.social.insertSnapshot(s);
  for (const d of socialDms) db.social.upsertDm(d);
  for (const s of socialDmSnapshots) db.social.insertDmSnapshot(s);
  for (const m of socialDmMessages) db.social.upsertDmMessage(m);
  // Retired dummy email history leaves the DB on re-seed; the real Beehiiv
  // baseline is authoritative. Live-synced snapshots survive.
  db.emailList.deleteSeeded();
  for (const s of emailListBaseline) db.emailList.insertSnapshot(s);
  for (const p of socialPosts) db.socialPosts.enqueue(p);
  for (const c of funnelContacts) db.funnel.insertContact(c);
  for (const t of funnelTouches) db.funnel.insertTouch(t);
}
