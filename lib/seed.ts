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
  LeadMagnet,
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
  { id: 'dept-diagmaps', name: 'Diagnostic Maps', slug: 'diagnostic-maps', tagline: 'The canonical TL-DM fleet — every model, one map.', color: GRAY.white, order: 1 },
  { id: 'dept-fieldops', name: 'Field Ops', slug: 'field-ops', tagline: 'OpenFieldPro: work orders, dispatch, invoicing.', color: GRAY.light, order: 2 },
  { id: 'dept-dev', name: 'Development', slug: 'development', tagline: 'Code, tests, and repo health.', color: GRAY.mid, order: 3 },
  { id: 'dept-research', name: 'Research', slug: 'research', tagline: 'Bounties, SurfSense, and the knowledge base.', color: GRAY.dim, order: 4 },
  { id: 'dept-models', name: 'Models', slug: 'models', tagline: 'Local inference, eval, and training.', color: GRAY.dark, order: 5 },
  { id: 'dept-picks', name: 'Picks', slug: 'picks', tagline: 'Brainz pick bots: sports, trading, sysbot.', color: GRAY.light, order: 6 },
  { id: 'dept-ops', name: 'Operations', slug: 'operations', tagline: 'Cron health, GitHub, drift, orchestrator.', color: GRAY.white, order: 7 },
];
// The roster IS the runtime — every row here maps 1:1 to a RuntimeAgent in
// lib/agents/real.ts (enforced by tests/seed.test.ts). No larp agents.
//
// Shape: top-level agents (parentId null) are INSTANCE slots — each one is
// what becomes its own Clawline / Claude Code process on a dedicated host
// (`instance` records that binding; everything is 'builtin' until then).
// Worker rows underneath them do one specific task each and sit at the
// bottom of the hierarchy.
const agents: Agent[] = [
  // ── Orchestrator ──────────────────────────────────────────────────────────
  {
    id: 'conductor',
    departmentId: 'dept-ops',
    name: 'Conductor',
    role: 'Orchestrator',
    status: 'active',
    tier: 'lead',
    description: 'Fans broadcasts out to every agent and reports which local instance hosts are up.',
    model: 'fan-out runtime',
    tools: ['hermes', 'ollama'],
    parentId: null,
    instance: 'builtin',
  },
  // ── Diagnostic Maps ───────────────────────────────────────────────────────
  {
    id: 'map-builder',
    departmentId: 'dept-diagmaps',
    name: 'Map Builder',
    role: 'Canonical Fleet Lead',
    status: 'active',
    tier: 'lead',
    description: 'Owns the canonical fleet: maps per family, dashboard freshness, release state.',
    model: 'fleet inventory',
    tools: ['diagmap', 'fleet'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'guided-qa',
    departmentId: 'dept-diagmaps',
    name: 'Guided-Walk QA',
    role: 'Guided-Walk Auditor',
    status: 'active',
    tier: 'worker',
    description: 'Runs the guided-walk audit across canonical maps: duplication, no-narrow, loops, dead-ends.',
    model: 'guided-walk-audit.cjs',
    tools: ['diagmap', 'fleet'],
    parentId: 'map-builder',
    instance: 'builtin',
  },
  {
    id: 'fleet-coverage',
    departmentId: 'dept-diagmaps',
    name: 'Fleet Coverage',
    role: 'Fleet Gate Keeper',
    status: 'active',
    tier: 'worker',
    description: 'Runs the deterministic fleet gate so the dashboard never drifts from the canonical fleet.',
    model: 'generate-fleet-coverage.cjs',
    tools: ['fleet'],
    parentId: 'map-builder',
    instance: 'builtin',
  },
  // ── Field Ops ─────────────────────────────────────────────────────────────
  {
    id: 'fieldops-agent',
    departmentId: 'dept-fieldops',
    name: 'Field Ops Agent',
    role: 'Field Operations Lead',
    status: 'active',
    tier: 'lead',
    description: 'Aggregates the OpenFieldPro release gate and ops-data workers.',
    model: 'aggregate of workers',
    tools: ['git'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'release-gate',
    departmentId: 'dept-fieldops',
    name: 'Release Gate',
    role: 'OpenFieldPro Release',
    status: 'active',
    tier: 'worker',
    description: 'Tracks open items on the OpenFieldPro release checklist.',
    model: 'RELEASE_CHECKLIST.md',
    tools: ['git'],
    parentId: 'fieldops-agent',
    instance: 'builtin',
  },
  {
    id: 'ops-data',
    departmentId: 'dept-fieldops',
    name: 'Ops Data',
    role: 'Live Field Data',
    status: 'planned',
    tier: 'worker',
    description: 'Live field-ops data from the OpenFieldPro stack (customers, work orders, invoices).',
    model: 'postgres + fastify',
    tools: ['git'],
    parentId: 'fieldops-agent',
    instance: 'builtin',
  },
  // ── Development ───────────────────────────────────────────────────────────
  {
    id: 'dev-agent',
    departmentId: 'dept-dev',
    name: 'Dev Agent',
    role: 'Development Lead',
    status: 'active',
    tier: 'lead',
    description: 'Aggregates the code and test workers.',
    model: 'aggregate of workers',
    tools: ['git', 'ollama'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'code-worker',
    departmentId: 'dept-dev',
    name: 'Code Worker',
    role: 'Repo Health',
    status: 'active',
    tier: 'worker',
    description: 'Repo health: branch, uncommitted changes, last commit date on the home repo.',
    model: 'git status',
    tools: ['git'],
    parentId: 'dev-agent',
    instance: 'builtin',
  },
  {
    id: 'test-worker',
    departmentId: 'dept-dev',
    name: 'Test Worker',
    role: 'Test Suite',
    status: 'active',
    tier: 'worker',
    description: 'Test-suite inventory and the npm test entry point.',
    model: 'vitest',
    tools: ['ollama'],
    parentId: 'dev-agent',
    instance: 'builtin',
  },
  // ── Research ──────────────────────────────────────────────────────────────
  {
    id: 'research-agent',
    departmentId: 'dept-research',
    name: 'Research Agent',
    role: 'Research Lead',
    status: 'active',
    tier: 'lead',
    description: 'Aggregates bounty radar and SurfSense research workers.',
    model: 'aggregate of workers',
    tools: ['gh', 'gbrain'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'bounty-radar',
    departmentId: 'dept-research',
    name: 'Bounty Radar',
    role: 'Bounty Scanner',
    status: 'active',
    tier: 'worker',
    description: 'GitHub bounty scanner readiness (script + gh auth).',
    model: 'bounty_radar.py',
    tools: ['gh'],
    parentId: 'research-agent',
    instance: 'builtin',
  },
  {
    id: 'surf-research',
    departmentId: 'dept-research',
    name: 'Surf Research',
    role: 'RAG Research',
    status: 'active',
    tier: 'worker',
    description: 'SurfSense self-hosted research agent (RAG over personal sources).',
    model: 'surfsense',
    tools: ['gbrain'],
    parentId: 'research-agent',
    instance: 'builtin',
  },
  {
    id: 'data-agent',
    departmentId: 'dept-research',
    name: 'Data Agent',
    role: 'Knowledge Base',
    status: 'active',
    tier: 'lead',
    description: 'Answers questions from the knowledge base: canonical diagnostic maps, docs, and the knowledge graph.',
    model: 'nikos brain',
    tools: ['gbrain', 'brain-store', 'supabase'],
    parentId: null,
    instance: 'builtin',
  },
  // ── Models ────────────────────────────────────────────────────────────────
  {
    id: 'models-agent',
    departmentId: 'dept-models',
    name: 'Models Agent',
    role: 'Model Stack Lead',
    status: 'active',
    tier: 'lead',
    description: 'Aggregates the eval and training workers for the local model stack.',
    model: 'aggregate of workers',
    tools: ['ollama'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'eval-runner',
    departmentId: 'dept-models',
    name: 'Eval Runner',
    role: 'Local Evals',
    status: 'active',
    tier: 'worker',
    description: 'Local inference + eval toolchain (llama.cpp build, model files).',
    model: 'llama.cpp',
    tools: ['ollama'],
    parentId: 'models-agent',
    instance: 'builtin',
  },
  {
    id: 'training-run',
    departmentId: 'dept-models',
    name: 'Training Run',
    role: 'Fine-Tuning',
    status: 'active',
    tier: 'worker',
    description: 'OneTrainer training workspace status.',
    model: 'onetrainer',
    tools: ['ollama'],
    parentId: 'models-agent',
    instance: 'builtin',
  },
  // ── Picks ─────────────────────────────────────────────────────────────────
  {
    id: 'picks-agent',
    departmentId: 'dept-picks',
    name: 'Picks Agent',
    role: 'Brainz Picks Lead',
    status: 'active',
    tier: 'lead',
    description: 'Aggregates the Brainz pick bots (sports, trading, sysbot).',
    model: 'aggregate of bots',
    tools: ['brainz'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'sportsclaw',
    departmentId: 'dept-picks',
    name: 'SportsClaw',
    role: 'Sports Picks Bot',
    status: 'active',
    tier: 'worker',
    description: 'Sports pick bot — reads its Brainz run-record.',
    model: 'brainz pick.v1',
    tools: ['brainz'],
    parentId: 'picks-agent',
    instance: 'builtin',
  },
  {
    id: 'tradingdesk',
    departmentId: 'dept-picks',
    name: 'TradingDesk',
    role: 'Trading Picks Bot',
    status: 'active',
    tier: 'worker',
    description: 'Trading pick bot — reads its Brainz run-record.',
    model: 'brainz pick.v1',
    tools: ['brainz'],
    parentId: 'picks-agent',
    instance: 'builtin',
  },
  {
    id: 'sysbot',
    departmentId: 'dept-picks',
    name: 'SysBot',
    role: 'Ecosystem Health',
    status: 'active',
    tier: 'worker',
    description: 'Brainz ecosystem health: tally of all bot run-records.',
    model: 'brainz bot-status.v1',
    tools: ['brainz'],
    parentId: 'picks-agent',
    instance: 'builtin',
  },
  // ── Operations ────────────────────────────────────────────────────────────
  {
    id: 'ops-agent',
    departmentId: 'dept-ops',
    name: 'Ops Agent',
    role: 'Operations Lead',
    status: 'active',
    tier: 'lead',
    description: 'Aggregates cron health, GitHub auth, and drift sentinel.',
    model: 'aggregate of workers',
    tools: ['hermes', 'gh'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'cron-health',
    departmentId: 'dept-ops',
    name: 'Cron Health',
    role: 'Scheduler Watch',
    status: 'active',
    tier: 'worker',
    description: 'Hermes scheduled-job health from jobs.json.',
    model: 'hermes cron',
    tools: ['hermes'],
    parentId: 'ops-agent',
    instance: 'builtin',
  },
  {
    id: 'github-agent',
    departmentId: 'dept-ops',
    name: 'GitHub Agent',
    role: 'GitHub Access',
    status: 'active',
    tier: 'worker',
    description: 'GitHub CLI auth and the home repo remote.',
    model: 'gh cli',
    tools: ['gh'],
    parentId: 'ops-agent',
    instance: 'builtin',
  },
  {
    id: 'drift-sentinel',
    departmentId: 'dept-ops',
    name: 'Drift Sentinel',
    role: 'Drift Watch',
    status: 'active',
    tier: 'worker',
    description: 'Uncommitted drift on the home repo.',
    model: 'git status',
    tools: ['git'],
    parentId: 'ops-agent',
    instance: 'builtin',
  },
];
// ── Humans in the process ─────────────────────────────────────────────────────
// Real heads (Marco, Nadia) plus larp-first seeds for the roles Alex will hire
// into (rename when the real person lands). Tools use the agents' slug
// namespace so the graph chain still ends in tools for humans too.
const people: Person[] = [
  { id: 'person-nik', departmentId: 'dept-diagmaps', name: 'Nik', role: 'Operator', tools: ['diagmap'] },
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
  { id: 'sop-conductor', departmentId: 'dept-ops', title: 'Orchestrate broadcasts', summary: 'Fan operator messages out to every agent and collect the replies into one digest.', steps: ['Open the conductor workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'conductor' },
  { id: 'sop-map-builder', departmentId: 'dept-diagmaps', title: 'Maintain the canonical fleet', summary: 'Keep every model family inventoried and the release dashboard current.', steps: ['Open the map-builder workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'map-builder' },
  { id: 'sop-guided-qa', departmentId: 'dept-diagmaps', title: 'Audit guided walks', summary: 'Scan canonical maps for duplication, no-narrow steps, loops, and dead-ends.', steps: ['Open the guided-qa workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'guided-qa' },
  { id: 'sop-fleet-coverage', departmentId: 'dept-diagmaps', title: 'Regenerate fleet coverage', summary: 'Keep the release dashboard byte-identical to the canonical fleet.', steps: ['Open the fleet-coverage workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'fleet-coverage' },
  { id: 'sop-fieldops-agent', departmentId: 'dept-fieldops', title: 'Run field operations', summary: 'Aggregate the release gate and ops-data lanes into one field-ops view.', steps: ['Open the fieldops-agent workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'fieldops-agent' },
  { id: 'sop-release-gate', departmentId: 'dept-fieldops', title: 'Close the release checklist', summary: 'Drive OpenFieldPro to release-candidate clear, one checklist item at a time.', steps: ['Open the release-gate workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'release-gate' },
  { id: 'sop-ops-data', departmentId: 'dept-fieldops', title: 'Load live ops data', summary: 'Surface customers, work orders, and invoices from the running stack.', steps: ['Open the ops-data workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'ops-data' },
  { id: 'sop-dev-agent', departmentId: 'dept-dev', title: 'Lead development', summary: 'Coordinate the code and test workers and keep the build green.', steps: ['Open the dev-agent workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'dev-agent' },
  { id: 'sop-code-worker', departmentId: 'dept-dev', title: 'Keep repos clean', summary: 'Monitor branch, uncommitted changes, and commit cadence on the home repo.', steps: ['Open the code-worker workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'code-worker' },
  { id: 'sop-test-worker', departmentId: 'dept-dev', title: 'Verify the suite', summary: 'Keep the test suite green before any change ships.', steps: ['Open the test-worker workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'test-worker' },
  { id: 'sop-research-agent', departmentId: 'dept-research', title: 'Run research', summary: 'Coordinate bounty scanning and SurfSense queries into one research feed.', steps: ['Open the research-agent workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'research-agent' },
  { id: 'sop-bounty-radar', departmentId: 'dept-research', title: 'Scan bounties daily', summary: 'Find real, payable GitHub bounties and quarantine the scams and honeypots.', steps: ['Open the bounty-radar workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'bounty-radar' },
  { id: 'sop-surf-research', departmentId: 'dept-research', title: 'Run research queries', summary: 'Answer questions against the personal knowledge base with citations.', steps: ['Open the surf-research workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'surf-research' },
  { id: 'sop-data-agent', departmentId: 'dept-research', title: 'Index the knowledge base', summary: 'Keep the brain searchable across the fleet index, docs, and knowledge graph.', steps: ['Open the data-agent workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'data-agent' },
  { id: 'sop-models-agent', departmentId: 'dept-models', title: 'Run the model stack', summary: 'Coordinate the eval and training workers for local inference.', steps: ['Open the models-agent workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'models-agent' },
  { id: 'sop-eval-runner', departmentId: 'dept-models', title: 'Run local evals', summary: 'Benchmark local models with fixed budgets and record results.', steps: ['Open the eval-runner workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'eval-runner' },
  { id: 'sop-training-run', departmentId: 'dept-models', title: 'Run training jobs', summary: 'Manage OneTrainer workspaces and checkpoints end to end.', steps: ['Open the training-run workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'training-run' },
  { id: 'sop-picks-agent', departmentId: 'dept-picks', title: 'Run the picks desk', summary: 'Coordinate the Brainz pick bots and their shared run-record health.', steps: ['Open the picks-agent workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'picks-agent' },
  { id: 'sop-sportsclaw', departmentId: 'dept-picks', title: 'Generate sports picks', summary: 'Produce vetted sports picks from the Brainz research pipeline.', steps: ['Open the sportsclaw workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'sportsclaw' },
  { id: 'sop-tradingdesk', departmentId: 'dept-picks', title: 'Generate trading picks', summary: 'Produce vetted trading picks from the Brainz research pipeline.', steps: ['Open the tradingdesk workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'tradingdesk' },
  { id: 'sop-sysbot', departmentId: 'dept-picks', title: 'Report ecosystem health', summary: 'Tally every Brainz bot run-record and surface the summary.', steps: ['Open the sysbot workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'sysbot' },
  { id: 'sop-ops-agent', departmentId: 'dept-ops', title: 'Run operations', summary: 'Aggregate cron health, GitHub auth, and drift into one ops view.', steps: ['Open the ops-agent workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'ops-agent' },
  { id: 'sop-cron-health', departmentId: 'dept-ops', title: 'Watch the scheduler', summary: 'Keep Hermes cron honest: ok, degraded, skipped, failed, never.', steps: ['Open the cron-health workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'cron-health' },
  { id: 'sop-github-agent', departmentId: 'dept-ops', title: 'Keep gh authenticated', summary: 'Ensure GitHub CLI access for the ops and research lanes.', steps: ['Open the github-agent workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'github-agent' },
  { id: 'sop-drift-sentinel', departmentId: 'dept-ops', title: 'Hold the line on drift', summary: 'Flag uncommitted drift before it grows past the threshold.', steps: ['Open the drift-sentinel workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'agent', assigneeId: 'drift-sentinel' },
  { id: 'sop-nik', departmentId: 'dept-diagmaps', title: 'Review the fleet', summary: 'Final human sign-off on canonical maps and the changelog.', steps: ['Open the person-nik workspace and check the current state of the backlog', 'Review what changed since the last run and prioritize the open items', 'Execute the pending work against the live source, recording the outcomes', 'Verify the result holds and flag anything that needs a human decision', 'Write the summary back to the run record and close out the task'], assigneeKind: 'person', assigneeId: 'person-nik' },
];
const tools: Tool[] = [
  // NikOS local sources
  { id: 'tool-diagmap', name: 'The-Diagnostic-Map', category: 'Knowledge', status: 'connected', color: GRAY.white, description: 'Canonical TL-DM fleet: 47 maps across 5 families + Reference docs.' },
  { id: 'tool-fleet', name: 'Fleet Gate', category: 'Knowledge', status: 'connected', color: GRAY.light, description: 'generate-fleet-coverage --check · deterministic release gate.' },
  { id: 'tool-brainz', name: 'Brainz', category: 'Operations', status: 'connected', color: GRAY.mid, description: 'Schema-driven bot ecosystem — run-records per bot.' },
  { id: 'tool-hermes', name: 'Hermes Cron', category: 'Operations', status: 'connected', color: GRAY.dim, description: 'Scheduled job grid with honest per-job status.' },
  { id: 'tool-git', name: 'Git', category: 'Development', status: 'connected', color: GRAY.dark, description: 'Repo health and drift checks on the home repo.' },
  { id: 'tool-gh', name: 'GitHub CLI', category: 'Development', status: 'connected', color: GRAY.white, description: 'gh auth + remote access for bounty and repo work.' },
  { id: 'tool-ollama', name: 'Local LLM', category: 'Development', status: 'connected', color: GRAY.light, description: 'Ollama / llama.cpp local inference for agents.' },
  // Knowledge
  // Knowledge
  { id: 'tool-gbrain', name: 'G-Brain (gbrain CLI)', category: 'Knowledge', status: 'connected', color: GRAY.white, description: 'v0.41 · brain-store markdown + Supabase + ZeroEntropy embeddings. Live.' },
  { id: 'tool-brain-store', name: 'brain-store/', category: 'Knowledge', status: 'connected', color: GRAY.light, description: 'Local markdown knowledge base at knowledge/brain-store.' },
  { id: 'tool-zeroentropy', name: 'ZeroEntropy', category: 'Knowledge', status: 'connected', color: GRAY.mid, description: 'Vector embeddings behind gbrain hybrid search. Key in ~/.config/knowledge/config.json.' },
  { id: 'tool-supabase', name: 'Supabase (Second Brain)', category: 'Knowledge', status: 'available', color: GRAY.mid, description: '1240 pages / 15k chunks. Free tier pauses on idle — unpause from dashboard when queries fail.' },
  { id: 'tool-obsidian', name: 'Notes Vault', category: 'Knowledge', status: 'connected', color: GRAY.light, description: 'Local notes vault. Direct filesystem access.' },
  { id: 'tool-notion', name: 'Notion', category: 'Knowledge', status: 'available', color: GRAY.dim, description: 'Client implemented. Set NOTION_API_KEY and share pages with the integration.' },
  // Social & growth
  { id: 'tool-postly', name: 'Postly', category: 'Social', status: 'connected', color: GRAY.white, description: '6 platforms under @founderos.ai (IG, TikTok, X…). Key at ~/.config/social/.env — live.' },
  { id: 'tool-dmflow', name: 'DMFlow', category: 'Social', status: 'available', color: GRAY.dim, description: 'DM automation. Endpoint map fully documented in shared-config; needs DMFLOW_API_KEY.' },
  { id: 'tool-skool', name: 'Skool (via Playwright)', category: 'Social', status: 'connected', color: GRAY.mid, description: 'launchpad-cohort community, driven by the documented Playwright workflow.' },
  // CRM & revenue
  { id: 'tool-ledger', name: 'Ledger', category: 'CRM & Revenue', status: 'connected', color: GRAY.white, description: 'Vantage + LC deals. Key reused from MCP config (read-scoped: query records, not lists).' },
  { id: 'tool-paykit', name: 'PayKit', category: 'CRM & Revenue', status: 'planned', color: GRAY.light, description: 'Offer/payment/customer context for Sales, including the Vantage PayKit lane.' },
  { id: 'tool-flexpay', name: 'FlexPay', category: 'CRM & Revenue', status: 'planned', color: GRAY.mid, description: 'Financing options for sales offers and payment-plan context.' },
  { id: 'tool-stripe', name: 'Stripe', category: 'CRM & Revenue', status: 'available', color: GRAY.light, description: 'Full client implemented — balance + charges live once STRIPE_SECRET_KEY is set.' },
  { id: 'tool-ghl', name: 'GoHighLevel', category: 'CRM & Revenue', status: 'planned', color: GRAY.dark, description: 'CLI wrapper scaffolded in knowledge/scripts; keys never added.' },
  { id: 'tool-recall', name: 'Recall', category: 'CRM & Revenue', status: 'available', color: GRAY.mid, description: 'AI meeting notetaker, used daily. Needs RECALL_API_KEY from settings for API access.' },
  { id: 'tool-webinarjam', name: 'WebinarJam', category: 'CRM & Revenue', status: 'available', color: GRAY.light, description: 'Launchpad Cohort webinar funnel — registrants & attendees are leads. Client implemented; set WEBINARJAM_API_KEY (account-wide).' },
  { id: 'tool-trakyo', name: 'Trakyo', category: 'CRM & Revenue', status: 'planned', color: GRAY.dim, description: 'Revenue attribution for Launchpad Cohort: content → booked calls → payments. Status-only until Trakyo ships a public API (TRAKYO_API_KEY).' },
  // Creative studio
  { id: 'tool-reelkit', name: 'Reelkit Pipeline', category: 'Creative', status: 'connected', color: GRAY.white, description: 'Local reelkit pipeline · LC + Vantage themes · 7 skills.' },
  { id: 'tool-renderly', name: 'Renderly CLI', category: 'Creative', status: 'connected', color: GRAY.light, description: 'v0.1.40, auth in keychain. generate / product-photoshoot / marketing-studio / soul-id.' },
  { id: 'tool-adsmith', name: 'Adsmith', category: 'Creative', status: 'connected', color: GRAY.mid, description: 'UGC ads for Vantage (Veo/Sora/Kling). Basic auth from env.' },
  { id: 'tool-whisper', name: 'Whisper (local)', category: 'Creative', status: 'connected', color: GRAY.dim, description: 'whisper-cli + ffmpeg via brew. Local transcription, nothing leaves the machine.' },
  { id: 'tool-miro', name: 'Miro', category: 'Creative', status: 'connected', color: GRAY.mid, description: 'REST API with token from knowledge/.env.agents. GBrain architecture board exists.' },
  { id: 'tool-canva-figma', name: 'Canva + Figma', category: 'Creative', status: 'available', color: GRAY.dark, description: 'Connected as Claude MCPs (session-scoped). Standalone API needs separate keys.' },
  // Comms
  { id: 'tool-imap', name: 'Email (4 IMAP slots)', category: 'Comms', status: 'available', color: GRAY.light, description: 'Client implemented for 4 inboxes — set INBOX_1..4_HOST/_USER/_PASS.' },
  { id: 'tool-slack', name: 'Slack', category: 'Comms', status: 'available', color: GRAY.mid, description: 'Client implemented. Needs a bot token with channels:read/history scopes.' },
  { id: 'tool-dictate', name: 'Dictate Flow', category: 'Comms', status: 'connected', color: GRAY.white, description: 'Voice dictation — heaviest daily-use tool found. Local flow.sqlite read live.' },
  { id: 'tool-whatsapp', name: 'WhatsApp', category: 'Comms', status: 'connected', color: GRAY.white, description: 'Desktop app local ChatStorage.sqlite, read-only: local team chats.' },
  // Orchestration & infra
  { id: 'tool-command-center', name: 'Command Center (:4000)', category: 'Orchestration', status: 'available', color: GRAY.light, description: 'command-center: kanban, brand deals, sales calls, SOPs, dispatch. Start with npm run dev.' },
  { id: 'tool-clawline', name: 'Clawline Gateway', category: 'Orchestration', status: 'available', color: GRAY.dim, description: 'Dormant — gateway offline, token missing. Needs repair/reinstall.' },
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
  { id: 'rm-v1', title: 'FOUNDER OS v1 baseline', quarter: '2026-Q2', status: 'done', departmentId: 'dept-dev', description: 'Six views, SQLite repos, 32 tests.' },
  { id: 'rm-mono', title: 'Monochrome rebuild + real connectors', quarter: '2026-Q2', status: 'done', departmentId: 'dept-dev', description: 'Black & white theme; IMAP, Slack, Stripe, Notion, gbrain wired.' },
  { id: 'rm-gbrain', title: 'G-Brain provider live', quarter: '2026-Q2', status: 'done', departmentId: 'dept-dev', description: 'gbrain CLI doctor/query + brain-store local fallback.' },
  { id: 'rm-creds-email', title: 'Connect 4 email inboxes', quarter: '2026-Q2', status: 'now', departmentId: 'dept-ops', description: 'App passwords / IMAP creds into .env.local slots 1-4.' },
  { id: 'rm-creds-slack', title: 'Connect Slack workspace', quarter: '2026-Q2', status: 'now', departmentId: 'dept-ops', description: 'Bot token with channels:read, channels:history.' },
  { id: 'rm-creds-payments', title: 'Connect payment processors', quarter: '2026-Q2', status: 'now', departmentId: 'dept-ops', description: 'Stripe first; PayPal/Square/Whop as keys land.' },
  { id: 'rm-creds-notion', title: 'Connect Notion workspace', quarter: '2026-Q2', status: 'now', departmentId: 'dept-dev', description: 'Internal integration secret + page shares.' },
  { id: 'rm-supabase', title: 'Revive Supabase Second Brain', quarter: '2026-Q2', status: 'now', departmentId: 'dept-dev', description: 'Unpause free-tier project so gbrain hybrid queries resolve again.' },
  { id: 'rm-scheduler', title: 'Agent scheduler (cron runs)', quarter: '2026-Q3', status: 'next', departmentId: 'dept-dev', description: 'Recurring agent runs with run history and failure alerts.' },
  { id: 'rm-llm', title: 'LLM summarization layer', quarter: '2026-Q3', status: 'next', departmentId: 'dept-dev', description: 'Claude API digests over inbox/Slack/payments data.' },
  { id: 'rm-host', title: 'Migrate to a dedicated host', quarter: '2026-Q3', status: 'next', departmentId: 'dept-dev', description: 'Host app + gbrain + agents on the host; Supabase stays managed.' },
  { id: 'rm-ui', title: 'UI design pass', quarter: '2026-Q4', status: 'later', departmentId: 'dept-dev', description: 'Alex-led redesign once all integrations are live.' },
  { id: 'rm-auth', title: 'Auth + remote access', quarter: '2026-Q4', status: 'later', departmentId: 'dept-dev', description: 'Reach FOUNDER OS on the host from anywhere, safely.' },
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
  { id: 'brm-7', number: 7, title: 'Infrastructure', color: GRAY.dim, items: ['Current host', 'dedicated host (next)', 'SQLite local', 'Supabase managed'] },
  { id: 'brm-8', number: 8, title: 'Security', color: GRAY.dark, items: ['.env.local secrets (gitignored)', 'Read-only connector scopes', 'No keys in repo'] },
];

const phases: Phase[] = [
  { id: 'phase-1', number: 1, title: 'Real Connections', items: ['4 email inboxes', 'Slack', 'Payment processors', 'Notion', 'G-Brain'] },
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

// Email list — demo Beehiiv snapshot. Beehiiv's stats endpoint exposes only
// current + all-time aggregates, not a daily series, so we seed the honest
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
      ['opted_in', 'webinar', 'Registered + attended WebinarJam training', 'manual', 42],
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
      ['opted_in', 'webinar', 'Attended WebinarJam training, stayed for offer', 'manual', 23],
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
        ownerKind: 'human',
        owner: 'Alex · Founder',
        hoursPerWeek: 10,
        tools: ['webinarjam', 'ledger'],
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
        tools: ['ledger', 'slack', 'notion'],
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
  { id: 'task-seed-1', agentId: 'cron-health', title: 'Investigate the degraded Hermes cron jobs', status: 'open', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-2', agentId: 'drift-sentinel', title: 'Snapshot the home repo — drift over threshold', status: 'open', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-3', agentId: 'bounty-radar', title: 'Quarantine the new prompt-injection honeypots', status: 'open', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-4', agentId: 'map-builder', title: 'Add the new URSO dual-fuel canonical map', status: 'doing', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-5', agentId: 'guided-qa', title: 'Audit the Bis guided walks for no-narrow steps', status: 'doing', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-6', agentId: 'fleet-coverage', title: 'Regenerate the fleet dashboard after the URSO port', status: 'doing', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-7', agentId: 'release-gate', title: 'Finish the device-testing checklist item', status: 'doing', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-8', agentId: 'eval-runner', title: 'Benchmark the new Qwen GGUF on local-eval', status: 'done', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-9', agentId: 'data-agent', title: 'Index the Reference theory docs into the brain', status: 'done', createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'task-seed-10', agentId: 'sysbot', title: 'Tally Brainz bot health after the daemon update', status: 'done', createdAt: SEED_TS, updatedAt: SEED_TS },
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
  { id: 'skill-outbound', name: 'Cold outbound sequencing', category: 'Sales', description: 'Multi-touch DM + content cadence that opens conversations at scale.', ownerAgentId: 'bounty-radar', status: 'live', tools: ['postly', 'dmflow'], order: 0 },
  { id: 'skill-qualify', name: 'Reply qualification', category: 'Sales', description: 'Reads inbound replies, scores intent, and books the qualified ones.', ownerAgentId: 'cron-health', status: 'live', tools: ['dmflow', 'gmail'], order: 1 },
  { id: 'skill-proposal', name: 'Proposal drafting', category: 'Sales', description: 'Turns a call transcript into a tailored, on-brand proposal.', ownerAgentId: null, status: 'learning', tools: ['proposal-gen', 'ledger'], order: 2 },
  { id: 'skill-hooks', name: 'Hook writing', category: 'Content', description: 'Short-form hooks and captions tuned to each platform.', ownerAgentId: 'research-agent', status: 'live', tools: ['postly'], order: 3 },
  { id: 'skill-ugc', name: 'UGC generation', category: 'Content', description: 'Generates ad-ready UGC variants (Veo / Sora / Kling).', ownerAgentId: 'surf-research', status: 'live', tools: ['adsmith'], order: 4 },
  { id: 'skill-edit', name: 'Video editing', category: 'Content', description: 'Cuts reels and highlight clips programmatically.', ownerAgentId: 'eval-runner', status: 'live', tools: ['reelkit'], order: 5 },
  { id: 'skill-schedule', name: 'Cross-post scheduling', category: 'Content', description: 'Queues and publishes across every connected platform.', ownerAgentId: 'bounty-radar', status: 'live', tools: ['postly'], order: 6 },
  { id: 'skill-triage', name: 'Inbox triage', category: 'Ops', description: 'Sorts the four inboxes into work / personal / misc and flags priority.', ownerAgentId: 'github-agent', status: 'live', tools: ['gmail'], order: 7 },
  { id: 'skill-dm', name: 'DM management', category: 'Ops', description: 'Handles Instagram and WhatsApp DMs end to end.', ownerAgentId: 'cron-health', status: 'live', tools: ['dmflow', 'whatsapp'], order: 8 },
  { id: 'skill-retrieval', name: 'Knowledge retrieval', category: 'Ops', description: 'Hybrid search over G-Brain so every agent shares one memory.', ownerAgentId: 'conductor', status: 'live', tools: ['gbrain'], order: 9 },
  { id: 'skill-reconcile', name: 'Payment reconciliation', category: 'Ops', description: 'Matches processor payouts to clients across Stripe and PayKit.', ownerAgentId: null, status: 'planned', tools: ['stripe', 'paykit'], order: 10 },
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
  for (const m of leadMagnets) db.leadMagnets.insert(m);
  db.leadMagnets.deleteWhereIdNotIn(leadMagnets.map((m) => m.id));
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
