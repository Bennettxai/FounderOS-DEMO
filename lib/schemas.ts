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
  // an OpenClaw/Claude Code instance name once the dedicated host is live).
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


export const AgentRunSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  ok: z.boolean(),
  summary: z.string(),
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



// ── People + SOP tasks — the humans in the process and the written-out jobs ──
// A person is a human employee on the org graph (distinct from agents). A SOP
// task is one written-out job owned by exactly ONE worker — an agent or a
// person, never both, never shared (the "monogamy" rule; enforced by tests).

export const SopAssigneeKindSchema = z.enum(['agent', 'person']);

// ── Lead magnets — every landing page we ship, as a register ───────────────
export const LeadMagnetStatusSchema = z.enum(['live', 'draft', 'paused', 'archived']);
export type LeadMagnetStatus = z.infer<typeof LeadMagnetStatusSchema>;



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
export type AgentTask = z.infer<typeof AgentTaskSchema>;
export type AgentCron = z.infer<typeof AgentCronSchema>;
export type SopAssigneeKind = z.infer<typeof SopAssigneeKindSchema>;
export type RosterClient = z.infer<typeof RosterClientSchema>;
export type WorkflowOwnerKind = z.infer<typeof WorkflowOwnerKindSchema>;
export type WorkflowAutomationState = z.infer<typeof WorkflowAutomationStateSchema>;
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type SkillStatus = z.infer<typeof SkillStatusSchema>;
export type Skill = z.infer<typeof SkillSchema>;
