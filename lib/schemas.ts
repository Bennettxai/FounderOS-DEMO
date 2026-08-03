import { z } from 'zod';

export const AgentStatusSchema = z.enum(['active', 'idle', 'training', 'planned']);
export const AgentTierSchema = z.enum(['lead', 'specialist', 'worker']);
export const ToolStatusSchema = z.enum(['connected', 'available', 'planned']);
export const RoadmapStatusSchema = z.enum(['done', 'now', 'next', 'later']);

export const DepartmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  tagline: z.string(),
  color: z.string().min(1),
  order: z.number().int(),
});

export const AgentSchema = z.object({
  id: z.string().min(1),
  departmentId: z.string().min(1),
  name: z.string().min(1),
  role: z.string(),
  status: AgentStatusSchema,
  tier: AgentTierSchema,
  description: z.string(),
  model: z.string(),
  tools: z.array(z.string()),
  // parentId nests sub-agents under the agent doing the delegating;
  // instance names the runtime that will host this agent ('builtin' today,
  // an OpenClaw/Claude Code instance name once the Mac mini is live).
  parentId: z.string().nullable().default(null),
  instance: z.string().min(1).default('builtin'),
});

export const ToolSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  status: ToolStatusSchema,
  color: z.string().min(1),
  description: z.string(),
});

// Integration = one entry in the connections marketplace: a brand, a one-line
// blurb, a category, and an optional link to a real connector that drives its
// live "connected" state. Logo comes from `slug` via lib/brand-logos.
export const INTEGRATION_CATEGORIES = [
  'Productivity',
  'Communication',
  'CRM & Sales',
  'Developer',
  'Scheduling',
  'Finance',
  'Marketing',
  'Storage',
  'Knowledge',
  'AI & Automation',
  'Creative',
] as const;
export const IntegrationCategorySchema = z.enum(INTEGRATION_CATEGORIES);
export const IntegrationSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  tagline: z.string().min(1),
  category: IntegrationCategorySchema,
  // when set, the catalog entry reflects this real connector's live state
  connectorId: z.string().min(1).optional(),
  popular: z.boolean().optional(),
  // env var names the connect flow may write to .env.local for this entry.
  // Omitted = a generic <SLUG>_API_KEY; [] = not key-connectable (guidance only).
  envKeys: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/)).optional(),
});
export type Integration = z.infer<typeof IntegrationSchema>;
export type IntegrationCategory = z.infer<typeof IntegrationCategorySchema>;

export const RoadmapItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/, 'quarter must look like 2026-Q2'),
  status: RoadmapStatusSchema,
  departmentId: z.string().nullable(),
  description: z.string(),
});

export const MetricSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.number(),
  unit: z.string(),
  delta: z.number(),
  period: z.string(),
});

export const DomainSchema = z.object({
  id: z.string().min(1),
  number: z.number().int(),
  title: z.string().min(1),
  color: z.string().min(1),
  items: z.array(z.string()),
});

// Persona = one variant of the platform configured for a different kind of
// operator. Same skeleton as the creator-founder: pillars (departments) → the
// agents that run them, the connectors they wire, the metrics they track, and
// how they use the shared G-Brain.
export const PersonaPillarSchema = z.object({
  name: z.string().min(1),
  focus: z.string().min(1),
  agents: z.array(z.string()).min(1),
});

export const PersonaSchema = z.object({
  id: z.string().min(1),
  order: z.number().int(),
  name: z.string().min(1),
  archetype: z.string().min(1),
  tagline: z.string().min(1),
  summary: z.string().min(1),
  accent: z.string().min(1),
  northStar: z.string().min(1),
  pillars: z.array(PersonaPillarSchema).min(1),
  connectors: z.array(z.string()).min(1),
  metrics: z.array(z.string()).min(1),
  brainUse: z.string().min(1),
  signaturePlay: z.string().min(1),
});

export const AgentRunSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  ok: z.boolean(),
  summary: z.string(),
  // LLM cost tracking (real-ready). Null on connector-only runs and legacy rows;
  // populated from the gateway's token usage when an agent calls the model.
  model: z.string().nullable().optional(),
  tokensIn: z.number().nullable().optional(),
  tokensOut: z.number().nullable().optional(),
  costUsd: z.number().nullable().optional(),
});

export const BroadcastReplySchema = z.object({
  id: z.string().min(1),
  broadcastId: z.string().min(1),
  agentId: z.string().min(1),
  ok: z.boolean(),
  reply: z.string(),
  finishedAt: z.string().min(1),
});

export const BroadcastSchema = z.object({
  id: z.string().min(1),
  message: z.string().min(1),
  createdAt: z.string().min(1),
  replies: z.array(BroadcastReplySchema),
});

export const AgentMessageRoleSchema = z.enum(['user', 'assistant', 'tool']);

export const AgentToolCallSchema = z.object({
  name: z.string().min(1),
  args: z.unknown(),
  result: z.unknown(),
});

export const AgentMessageSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  role: AgentMessageRoleSchema,
  content: z.string(),
  toolCalls: z.array(AgentToolCallSchema).default([]),
  createdAt: z.string().min(1),
});

export const ActivityEventSchema = z.object({
  kind: z.enum(['run', 'message', 'broadcast']),
  agentId: z.string().min(1),
  at: z.string().min(1),
  summary: z.string(),
  ok: z.boolean().optional(),
});

export const BrainOverviewSchema = z.object({
  store: z.object({
    path: z.string().min(1),
    totalFiles: z.number().int().nonnegative(),
    folders: z.array(z.object({ name: z.string().min(1), files: z.number().int().positive() })),
  }),
  doctor: z.object({
    connected: z.boolean(),
    status: z.string().min(1),
    healthScore: z.number().nullable(),
    checks: z.array(z.object({ name: z.string(), status: z.string(), message: z.string() })),
    detail: z.string(),
  }),
});

export const BrainGraphNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['folder', 'page']),
  label: z.string().min(1),
  folder: z.string().min(1),
  kind: z.string().min(1), // color-key for future per-type/per-person color coding
  excerpt: z.string(),
  wordCount: z.number().int().nonnegative(),
  tags: z.array(z.string()),
  agents: z.array(z.string()),
  vx: z.number().min(-1).max(1), // embedding projection coords
  vy: z.number().min(-1).max(1),
  vector: z.array(z.number()), // 64-dim lexical embedding fingerprint
  chunks: z.number().int().nonnegative(), // embedding-pipeline chunk count
});

export const BrainGraphEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.enum(['member', 'wikilink', 'similar']),
});

export const BrainGraphSchema = z.object({
  nodes: z.array(BrainGraphNodeSchema),
  edges: z.array(BrainGraphEdgeSchema),
  // PCA basis of the store's embedding space, so the client can project
  // a live query vector into the same 2D plane the nodes occupy.
  space: z.object({
    dim: z.number().int().positive(),
    mean: z.array(z.number()),
    components: z.array(z.array(z.number())).length(2),
    scale: z.number(),
  }),
});

export const PhaseSchema = z.object({
  id: z.string().min(1),
  number: z.number().int(),
  title: z.string().min(1),
  items: z.array(z.string()),
});

export const LifeMapNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['center', 'area', 'module', 'tier']),
  label: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  parent: z.string().nullable(),
  detail: z.string(),
  agents: z.array(z.string()),
  brainFolders: z.array(z.string()),
});

export const LifeMapSchema = z.object({
  nodes: z.array(LifeMapNodeSchema),
  edges: z.array(z.object({ source: z.string().min(1), target: z.string().min(1) })),
});

export const AgentTaskSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(['open', 'doing', 'done']),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const AgentCronSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  schedule: z.string().min(1), // 5-field cron, validated at the repo boundary
  description: z.string().min(1),
  enabled: z.boolean(),
  createdAt: z.string().min(1),
});

export const SocialPlatformSchema = z.enum(['instagram', 'tiktok', 'twitter', 'youtube', 'linkedin']);

export const SocialAccountSchema = z.object({
  platform: SocialPlatformSchema,
  handle: z.string().min(1),
  url: z.string().nullable(),
  order: z.number().int(),
});

// One row per platform per day. History accrues from the Zernio config on
// every dashboard read; Alex's own scrapes can insert richer rows later.
export const SocialSnapshotSchema = z.object({
  platform: SocialPlatformSchema,
  capturedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'capturedAt must look like 2026-06-13'),
  followers: z.number().int().nonnegative(),
  source: z.string().min(1),
});

// null = not enough history yet (honest, never a fake zero)
export const SocialGrowthSchema = z.object({
  d7: z.number().nullable(),
  d30: z.number().nullable(),
  d60: z.number().nullable(),
  allTime: z.number().nullable(),
});

export const SocialPlatformStatsSchema = z.object({
  platform: SocialPlatformSchema,
  handle: z.string().min(1),
  url: z.string().nullable(),
  followers: z.number().int().nonnegative().nullable(),
  growth: SocialGrowthSchema,
  series: z.array(z.object({ date: z.string().min(1), followers: z.number().int().nonnegative() })),
});

export const SocialDashboardSchema = z.object({
  totalFollowers: z.number().int().nonnegative(),
  asOf: z.string().nullable(),
  platforms: z.array(SocialPlatformStatsSchema),
});

export const SocialPlatformDetailSchema = z.object({
  account: SocialAccountSchema,
  followers: z.number().int().nonnegative().nullable(),
  growth: SocialGrowthSchema,
  snapshots: z.array(SocialSnapshotSchema),
});

// Email-list audience tracked alongside the social platforms. One row per day.
// Seeded from the real Beehiiv account; syncBeehiivEmail appends live snapshots
// once BEEHIIV_API_KEY is set (same shape).
export const EmailListSnapshotSchema = z.object({
  capturedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'capturedAt must look like 2026-06-13'),
  subscribers: z.number().int().nonnegative(),
  source: z.string().min(1),
});

// Per-platform DM counts. Seeded dummy until a ManyChat/Zernio source lands.
export const SocialDmSchema = z.object({
  platform: SocialPlatformSchema,
  count: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
});

// Per-platform DM count history — one row per platform per day, so DM growth
// can be charted over 7/30/60/all windows. Seeded dummy until a real source.
export const SocialDmSnapshotSchema = z.object({
  platform: SocialPlatformSchema,
  capturedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'capturedAt must look like 2026-06-13'),
  count: z.number().int().nonnegative(),
  source: z.string().min(1),
});

// A single DM message in the /social inbox (Instagram-first). Seeded dummy
// until the ManyChat webhook (POST /api/webhooks/manychat) feeds it live —
// ManyChat's API cannot list DMs, so the inbound stream is push, not poll.
export const DmDirectionSchema = z.enum(['in', 'out']); // in = from the subscriber, out = from us
export const SocialDmMessageSchema = z.object({
  id: z.string().min(1),
  platform: SocialPlatformSchema,
  subscriberId: z.string().min(1),
  name: z.string().min(1),
  handle: z.string().nullable(),
  text: z.string(),
  direction: DmDirectionSchema,
  tag: z.string().nullable(),
  ts: z.string().min(1),
  source: z.string().min(1),
});

export const SocialPostStatusSchema = z.enum(['queued', 'published', 'failed']);

// A post composed on the Social tab and queued for the Zernio-publishing agent.
export const SocialPostSchema = z.object({
  id: z.string().min(1),
  caption: z.string().min(1),
  mediaUrl: z.string().nullable(),
  platforms: z.array(SocialPlatformSchema).min(1, 'pick at least one platform'),
  status: SocialPostStatusSchema,
  scheduledFor: z.string().nullable(),
  createdAt: z.string().min(1),
});

export const ContactTagSchema = z.object({
  person: z.string().min(1),
  channel: z.string().min(1), // whatsapp · email · slack · imessage …
  tag: z.string().min(1), // client · student · friend …
  tier: z.number().int().min(1).max(3), // 1 red · 2 yellow · 3 green
});

// ── People + SOP tasks — the humans in the process and the written-out jobs ──
// A person is a human employee on the org graph (distinct from agents). A SOP
// task is one written-out job owned by exactly ONE worker — an agent or a
// person, never both, never shared (the "monogamy" rule; enforced by tests).
export const PersonSchema = z.object({
  id: z.string().min(1),
  departmentId: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  tools: z.array(z.string().min(1)).min(1), // same slug namespace agents use
});

export const SopAssigneeKindSchema = z.enum(['agent', 'person']);

export const SopTaskSchema = z.object({
  id: z.string().min(1),
  departmentId: z.string().min(1),
  title: z.string().min(1), // the job, stated as work ("Triage the four inboxes")
  summary: z.string(),
  steps: z.array(z.string().min(1)).min(3), // the written-out SOP checklist
  assigneeKind: SopAssigneeKindSchema,
  assigneeId: z.string().min(1),
});

// ── Workflows — the machine, mapped as a chain of owned process steps ───────
// Each step is owned by a human or an agent, costs weekly hours, may leak money
// (a bottleneck), and may carry a live/suggested automation that recovers it.
export const WorkflowOwnerKindSchema = z.enum(['human', 'agent']);
export const WorkflowAutomationStateSchema = z.enum(['live', 'suggested']);

export const WorkflowStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  ownerKind: WorkflowOwnerKindSchema,
  owner: z.string().min(1), // "Alex · Founder" / "SDR Agent"
  hoursPerWeek: z.number().nonnegative(),
  tools: z.array(z.string()), // tool slugs (same namespace as agents)
  edgeLabel: z.string().nullable(), // label on the edge INTO the next step
  leakUsd: z.number().nonnegative().nullable(), // $/mo bleeding here when it's a bottleneck
  automation: z
    .object({
      title: z.string().min(1),
      state: WorkflowAutomationStateSchema,
      recoveredUsd: z.number().nonnegative(), // $/mo the automation carries
    })
    .nullable(),
});

export const WorkflowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1), // "Vantage sales machine"
  subtitle: z.string(),
  revenueUsd: z.number().nonnegative(), // $/mo this machine drives (context for leaks)
  order: z.number().int(),
  steps: z.array(WorkflowStepSchema),
});

// ── Skills — the agent workforce's capability library ───────────────────────
export const SkillStatusSchema = z.enum(['live', 'learning', 'planned']);
export const SkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1), // "Sales", "Content", "Ops"…
  description: z.string(),
  ownerAgentId: z.string().nullable(), // the agent that primarily wields it
  status: SkillStatusSchema,
  tools: z.array(z.string()),
  markdown: z.string(), // the skill's SKILL.md doc, viewable from the card
  order: z.number().int(),
});

// ── Client roster — one row per client, whatever the source ─────────────────
// The Clients pillar serves Attio deals when the connector is live and the
// seeded funnel otherwise; `source` keeps the card honest about which.
export const RosterClientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  venture: z.string(),
  status: z.string().min(1),
  amountUsd: z.number().nullable(),
  source: z.enum(['attio', 'funnel']),
});

// ── Funnel — client journeys from first touch to conversion ─────────────────
// Canonical stages; `nurtured` is optional so a journey renders as 4–5 touches.
export const FunnelStageSchema = z.enum(['first_touch', 'engaged', 'nurtured', 'opted_in', 'converted']);
export const FunnelVentureSchema = z.enum(['vantage', 'launchpad-cohort']);
export const FunnelChannelSchema = z.enum(['organic', 'ads', 'dm', 'email', 'webinar', 'call', 'checkout', 'crm']);
// Where each touch comes from: Trakyo (organic attribution), Meta Ads MCP
// (paid), Attio (live CRM pipeline), manual otherwise. Seeded rows carry the
// intended source so the live swap is a repo-level change.
export const FunnelSourceSchema = z.enum(['trakyo', 'meta-ads', 'attio', 'ghl', 'manual']);

// Relationship temperature with Alex — with likelihood-to-buy (0–100) it
// drives how a client node renders in the funnel space. Seeded dummy; later
// computed from CRM (Attio) + Trakyo engagement.
export const FunnelRelationshipSchema = z.enum(['cold', 'warm', 'hot']);

export const FunnelContactSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  venture: FunnelVentureSchema,
  status: FunnelStageSchema, // furthest stage reached
  product: z.string().nullable(), // what they opted in to buy, once converted
  amountUsd: z.number().nonnegative().nullable(),
  relationship: FunnelRelationshipSchema,
  likelihood: z.number().int().min(0).max(100),
  /** Deep link to the source record (Attio web_url / GHL contact page). */
  url: z.string().nullable().default(null),
  /** Contact channels for outreach — GHL carries both; Attio joins them from
   * the deal's associated person record (fetchAttioContacts). */
  email: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  /** The human behind the deal — joined from the CRM person/company records
   * so the dossier says WHO this is, not just the deal title. */
  person: z.string().nullable().default(null),
  company: z.string().nullable().default(null),
  role: z.string().nullable().default(null),
  linkedin: z.string().nullable().default(null),
  createdAt: z.string().min(1),
});

export const FunnelTouchSchema = z.object({
  id: z.string().min(1),
  contactId: z.string().min(1),
  seq: z.number().int().positive(), // 1..n position in the journey
  stage: FunnelStageSchema,
  channel: FunnelChannelSchema,
  label: z.string().min(1), // e.g. "IG reel: 3 offers that close themselves"
  source: FunnelSourceSchema,
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'at must look like 2026-06-13'),
});

export const FunnelJourneySchema = FunnelContactSchema.extend({
  touches: z.array(FunnelTouchSchema),
});

// One bar of the funnel: journeys that progressed at least this far, split by
// how they entered (first-touch organic vs ads).
export const FunnelStageRowSchema = z.object({
  stage: FunnelStageSchema,
  total: z.number().int().nonnegative(),
  organic: z.number().int().nonnegative(),
  ads: z.number().int().nonnegative(),
  conversionFromPrev: z.number().min(0).max(100).nullable(),
});

export const FunnelSummarySchema = z.object({
  clients: z.number().int().nonnegative(),
  converted: z.number().int().nonnegative(),
  revenueUsd: z.number().nonnegative(),
  stages: z.array(FunnelStageRowSchema),
});

export type Department = z.infer<typeof DepartmentSchema>;
export type Agent = z.infer<typeof AgentSchema>;
export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type Tool = z.infer<typeof ToolSchema>;
export type RoadmapItem = z.infer<typeof RoadmapItemSchema>;
export type RoadmapStatus = z.infer<typeof RoadmapStatusSchema>;
export type Metric = z.infer<typeof MetricSchema>;
export type Domain = z.infer<typeof DomainSchema>;
export type Phase = z.infer<typeof PhaseSchema>;
export type BrainOverview = z.infer<typeof BrainOverviewSchema>;
export type AgentTier = z.infer<typeof AgentTierSchema>;
export type Broadcast = z.infer<typeof BroadcastSchema>;
export type BroadcastReply = z.infer<typeof BroadcastReplySchema>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type AgentToolCall = z.infer<typeof AgentToolCallSchema>;
export type AgentMessageRole = z.infer<typeof AgentMessageRoleSchema>;
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;
export type BrainGraphNode = z.infer<typeof BrainGraphNodeSchema>;
export type BrainGraphEdge = z.infer<typeof BrainGraphEdgeSchema>;
export type BrainGraph = z.infer<typeof BrainGraphSchema>;
export type LifeMapNode = z.infer<typeof LifeMapNodeSchema>;
export type LifeMap = z.infer<typeof LifeMapSchema>;
export type ContactTag = z.infer<typeof ContactTagSchema>;
export type SocialPlatform = z.infer<typeof SocialPlatformSchema>;
export type SocialAccount = z.infer<typeof SocialAccountSchema>;
export type SocialSnapshot = z.infer<typeof SocialSnapshotSchema>;
export type SocialGrowth = z.infer<typeof SocialGrowthSchema>;
export type SocialPlatformStats = z.infer<typeof SocialPlatformStatsSchema>;
export type SocialDashboard = z.infer<typeof SocialDashboardSchema>;
export type SocialPlatformDetail = z.infer<typeof SocialPlatformDetailSchema>;
export type EmailListSnapshot = z.infer<typeof EmailListSnapshotSchema>;
export type SocialDm = z.infer<typeof SocialDmSchema>;
export type SocialDmSnapshot = z.infer<typeof SocialDmSnapshotSchema>;
export type SocialDmMessage = z.infer<typeof SocialDmMessageSchema>;
export type DmDirection = z.infer<typeof DmDirectionSchema>;
export type SocialPostStatus = z.infer<typeof SocialPostStatusSchema>;
export type SocialPost = z.infer<typeof SocialPostSchema>;
export type AgentTask = z.infer<typeof AgentTaskSchema>;
export type AgentCron = z.infer<typeof AgentCronSchema>;
export type PersonaPillar = z.infer<typeof PersonaPillarSchema>;
export type Persona = z.infer<typeof PersonaSchema>;
export type Person = z.infer<typeof PersonSchema>;
export type SopAssigneeKind = z.infer<typeof SopAssigneeKindSchema>;
export type SopTask = z.infer<typeof SopTaskSchema>;
export type RosterClient = z.infer<typeof RosterClientSchema>;
export type FunnelStage = z.infer<typeof FunnelStageSchema>;
export type FunnelRelationship = z.infer<typeof FunnelRelationshipSchema>;
export type FunnelVenture = z.infer<typeof FunnelVentureSchema>;
export type FunnelChannel = z.infer<typeof FunnelChannelSchema>;
export type FunnelSource = z.infer<typeof FunnelSourceSchema>;
export type FunnelContact = z.infer<typeof FunnelContactSchema>;
export type FunnelTouch = z.infer<typeof FunnelTouchSchema>;
export type FunnelJourney = z.infer<typeof FunnelJourneySchema>;
export type FunnelStageRow = z.infer<typeof FunnelStageRowSchema>;
export type FunnelSummary = z.infer<typeof FunnelSummarySchema>;
export type WorkflowOwnerKind = z.infer<typeof WorkflowOwnerKindSchema>;
export type WorkflowAutomationState = z.infer<typeof WorkflowAutomationStateSchema>;
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type SkillStatus = z.infer<typeof SkillStatusSchema>;
export type Skill = z.infer<typeof SkillSchema>;
