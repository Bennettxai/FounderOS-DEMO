import { UsageSnapshotSchema, type SeatUsage } from '@/lib/usage';
import Database from 'better-sqlite3';
import { isValidCron } from '@/lib/cron';
import {
  AgentCronSchema,
  PlaudIngestSchema,
  CronRunSchema,
  AgentMessageSchema,
  AgentRunSchema,
  AgentSchema,
  AgentTaskSchema,
  BroadcastReplySchema,
  BroadcastSchema,
  ContactTagSchema,
  DepartmentSchema,
  DomainSchema,
  MetricSchema,
  PersonaSchema,
  PhaseSchema,
  RoadmapItemSchema,
  SocialAccountSchema,
  SocialSnapshotSchema,
  MetricSnapshotSchema,
  EmailListSnapshotSchema,
  TradingAccountSnapshotSchema,
  TradingPositionSchema,
  TradeActivitySchema,
  TradingLimitsSchema,
  TradeAnalysisSchema,
  TradingOrderSchema,
  ProposalSchema,
  SocialDmSchema,
  SocialDmSnapshotSchema,
  SocialDmMessageSchema,
  SocialPostSchema,
  FunnelContactSchema,
  FunnelTouchSchema,
  FunnelJourneySchema,
  PersonSchema,
  SopTaskSchema,
  WorkflowSchema,
  SkillSchema,
  ToolSchema,
  type Agent,
  type AgentCron,
  type PlaudIngest,
  type CronRun,
  type AgentMessage,
  type AgentRun,
  type AgentTask,
  type Broadcast,
  type BroadcastReply,
  type ContactTag,
  type Department,
  type Domain,
  type Metric,
  type Persona,
  type Phase,
  type RoadmapItem,
  type SocialAccount,
  type SocialPlatform,
  type SocialSnapshot,
  type EmailListSnapshot,
  type TradingAccountSnapshot,
  type TradingPosition,
  type TradeActivity,
  type TradingLimits,
  type TradeAnalysis,
  type TradingOrder,
  type Proposal,
  type SocialDm,
  type SocialDmSnapshot,
  type SocialDmMessage,
  type SocialPost,
  type FunnelContact,
  type FunnelTouch,
  type FunnelJourney,
  type FunnelVenture,
  type Person,
  type SopTask,
  type Workflow,
  type Skill,
  type Tool,
  LeadMagnetSchema,
  type LeadMagnet,
  BrandDealSchema,
  BrandDeal,
  DeliverableDecisionSchema,
  type DeliverableDecision,
} from '@/lib/schemas';

const DDL = `
CREATE TABLE IF NOT EXISTS seed_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  tagline TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  "order" INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  tier TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  tools TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS roadmap_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  quarter TEXT NOT NULL,
  status TEXT NOT NULL,
  department_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  phase_id TEXT
);
CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  delta REAL NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  color TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY,
  ord INTEGER NOT NULL,
  name TEXT NOT NULL,
  archetype TEXT NOT NULL,
  tagline TEXT NOT NULL,
  summary TEXT NOT NULL,
  accent TEXT NOT NULL,
  north_star TEXT NOT NULL,
  pillars TEXT NOT NULL DEFAULT '[]',
  connectors TEXT NOT NULL DEFAULT '[]',
  metrics TEXT NOT NULL DEFAULT '[]',
  brain_use TEXT NOT NULL,
  signature_play TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS phases (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  summary TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tool_calls TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trading_snapshots (
  account_id TEXT NOT NULL DEFAULT 'individual',
  account_label TEXT NOT NULL DEFAULT 'Individual',
  captured_at TEXT NOT NULL,
  account_value_usd REAL NOT NULL,
  buying_power_usd REAL NOT NULL,
  cash_usd REAL NOT NULL,
  day_pnl_usd REAL NOT NULL,
  total_pnl_usd REAL NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (account_id, captured_at)
);
CREATE TABLE IF NOT EXISTS trading_positions (
  account_id TEXT NOT NULL DEFAULT 'individual',
  captured_at TEXT NOT NULL,
  symbol TEXT NOT NULL,
  quantity REAL NOT NULL,
  avg_cost_usd REAL NOT NULL,
  market_value_usd REAL NOT NULL,
  unrealized_pnl_usd REAL NOT NULL,
  PRIMARY KEY (account_id, captured_at, symbol)
);
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  client TEXT NOT NULL,
  brand TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_usd REAL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'seed',
  access_code TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS deliverable_decisions (
  id TEXT PRIMARY KEY,
  decision TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  decided_revision TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS brand_deals (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  status TEXT NOT NULL,
  tier TEXT,
  deal_value_usd REAL,
  budget_usd REAL,
  amount_agreed_usd REAL,
  suggested_rate_usd REAL,
  paid_in_full INTEGER NOT NULL DEFAULT 0,
  deadline TEXT,
  follow_up_date TEXT,
  contact_name TEXT,
  contact_email TEXT,
  main_channel TEXT,
  video_type TEXT,
  source TEXT,
  icp_fit TEXT,
  notion_url TEXT NOT NULL,
  last_edited TEXT NOT NULL,
  seeded INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS trading_orders (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL DEFAULT 'agentic',
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  type TEXT NOT NULL,
  state TEXT NOT NULL,
  quantity REAL NOT NULL,
  filled_quantity REAL NOT NULL DEFAULT 0,
  dollar_amount_usd REAL,
  limit_price_usd REAL,
  placed_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trading_analysis (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  account_id TEXT NOT NULL DEFAULT 'agentic',
  agent TEXT NOT NULL,
  examined INTEGER NOT NULL DEFAULT 0,
  signals INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  rows TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS trading_activity (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  account_id TEXT NOT NULL DEFAULT 'individual',
  agent TEXT NOT NULL,
  action TEXT NOT NULL,
  symbol TEXT NOT NULL,
  quantity REAL NOT NULL,
  price_usd REAL NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL
);
-- The Markets Agent's guardrail limits, edited from /trading. Single row by
-- construction (the CHECK makes a second row impossible), so the agent can
-- never read one of two competing sets.
CREATE TABLE IF NOT EXISTS trading_limits (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  max_notional_per_trade_usd REAL NOT NULL,
  max_position_pct_of_sleeve REAL NOT NULL,
  max_risk_pct_per_trade REAL NOT NULL,
  max_concurrent_positions INTEGER NOT NULL,
  max_trades_per_day INTEGER NOT NULL,
  min_sleeve_value_usd REAL NOT NULL,
  max_deployed_capital_usd REAL NOT NULL,
  autopilot INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usage_snapshots (
  id TEXT PRIMARY KEY,
  captured_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS broadcasts (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_crons (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  schedule TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cron_runs (
  id TEXT PRIMARY KEY,
  cron_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  ok INTEGER NOT NULL,
  summary TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cron_runs_cron ON cron_runs (cron_id, started_at DESC);
CREATE TABLE IF NOT EXISTS digest_reads (
  key TEXT PRIMARY KEY,
  read_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS comms_digests (
  id TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plaud_ingests (
  file_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  via TEXT NOT NULL,
  slug TEXT NOT NULL,
  claims INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS contact_tags (
  person TEXT NOT NULL,
  channel TEXT NOT NULL,
  tag TEXT NOT NULL,
  tier INTEGER NOT NULL,
  PRIMARY KEY (person, channel)
);
CREATE TABLE IF NOT EXISTS social_accounts (
  platform TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  url TEXT,
  "order" INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS social_snapshots (
  platform TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  followers INTEGER NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (platform, captured_at)
);
CREATE TABLE IF NOT EXISTS broadcast_replies (
  id TEXT PRIMARY KEY,
  broadcast_id TEXT NOT NULL REFERENCES broadcasts(id),
  agent_id TEXT NOT NULL,
  ok INTEGER NOT NULL,
  reply TEXT NOT NULL DEFAULT '',
  finished_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_list_snapshots (
  captured_at TEXT PRIMARY KEY,
  subscribers INTEGER NOT NULL,
  source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS metric_snapshots (
  metric_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY (metric_id, captured_at)
);
CREATE TABLE IF NOT EXISTS social_dms (
  platform TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS social_dm_snapshots (
  platform TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  count INTEGER NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (platform, captured_at)
);
CREATE TABLE IF NOT EXISTS social_dm_messages (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  name TEXT NOT NULL,
  handle TEXT,
  text TEXT NOT NULL,
  direction TEXT NOT NULL,
  tag TEXT,
  ts TEXT NOT NULL,
  source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_dm_messages_ts ON social_dm_messages (ts);
CREATE TABLE IF NOT EXISTS social_posts (
  id TEXT PRIMARY KEY,
  caption TEXT NOT NULL,
  media_url TEXT,
  platforms TEXT NOT NULL,
  status TEXT NOT NULL,
  scheduled_for TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  tools TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS sop_tasks (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]',
  assignee_kind TEXT NOT NULL,
  assignee_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lead_magnets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  offer TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  captures TEXT NOT NULL,
  destination TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  launched_at TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT 'seed'
);
CREATE TABLE IF NOT EXISTS funnel_contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  venture TEXT NOT NULL,
  status TEXT NOT NULL,
  product TEXT,
  amount_usd REAL,
  relationship TEXT NOT NULL DEFAULT 'warm',
  likelihood INTEGER NOT NULL DEFAULT 50,
  email TEXT,
  phone TEXT,
  person TEXT,
  company TEXT,
  role TEXT,
  linkedin TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS funnel_touches (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES funnel_contacts(id),
  seq INTEGER NOT NULL,
  stage TEXT NOT NULL,
  channel TEXT NOT NULL,
  label TEXT NOT NULL,
  source TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  revenue_usd INTEGER NOT NULL DEFAULT 0,
  ord INTEGER NOT NULL DEFAULT 0,
  steps TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_agent_id TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  tools TEXT NOT NULL DEFAULT '[]',
  markdown TEXT NOT NULL DEFAULT '',
  ord INTEGER NOT NULL DEFAULT 0
);
`;

/** Databases created before the hierarchy build lack these columns. */
/** lead_magnets gained `origin` when the operator started creating them from the
 *  OS; older databases predate the column. */
function migrateLeadMagnetsTable(db: InstanceType<typeof Database>): void {
  const columns = new Set(
    (db.prepare('PRAGMA table_info(lead_magnets)').all() as { name: string }[]).map((c) => c.name),
  );
  if (!columns.has('origin')) db.exec("ALTER TABLE lead_magnets ADD COLUMN origin TEXT NOT NULL DEFAULT 'seed'");
}

/** proposals gained `access_code` once each client's gate code needed to
 *  show beside their name; databases created before that predate the column. */
export function migrateProposalsTable(db: InstanceType<typeof Database>): void {
  const columns = new Set(
    (db.prepare('PRAGMA table_info(proposals)').all() as { name: string }[]).map((c) => c.name),
  );
  if (!columns.has('access_code')) {
    db.exec("ALTER TABLE proposals ADD COLUMN access_code TEXT NOT NULL DEFAULT ''");
  }
}

function migrateAgentsTable(db: InstanceType<typeof Database>): void {
  const columns = new Set(
    (db.pragma('table_info(agents)') as { name: string }[]).map((c) => c.name),
  );
  if (!columns.has('parent_id')) db.exec('ALTER TABLE agents ADD COLUMN parent_id TEXT');
  if (!columns.has('instance')) db.exec("ALTER TABLE agents ADD COLUMN instance TEXT NOT NULL DEFAULT 'builtin'");
}

/** Databases created before the funnel-space build lack these columns. */
function migrateFunnelContactsTable(db: InstanceType<typeof Database>): void {
  const columns = new Set(
    (db.pragma('table_info(funnel_contacts)') as { name: string }[]).map((c) => c.name),
  );
  if (!columns.has('relationship')) db.exec("ALTER TABLE funnel_contacts ADD COLUMN relationship TEXT NOT NULL DEFAULT 'warm'");
  if (!columns.has('likelihood')) db.exec('ALTER TABLE funnel_contacts ADD COLUMN likelihood INTEGER NOT NULL DEFAULT 50');
  if (!columns.has('email')) db.exec('ALTER TABLE funnel_contacts ADD COLUMN email TEXT');
  if (!columns.has('phone')) db.exec('ALTER TABLE funnel_contacts ADD COLUMN phone TEXT');
  // dossier identity (Round 15) — the human behind the deal
  for (const col of ['person', 'company', 'role', 'linkedin']) {
    if (!columns.has(col)) db.exec(`ALTER TABLE funnel_contacts ADD COLUMN ${col} TEXT`);
  }
}

// Skills gained a `markdown` (SKILL.md) column after first ship. Add it, and
// clear the stale rows so the re-seed backfills each skill's doc.
// roadmap_items gained `phase_id` when the phase cards on /roadmap started
// reading their progress bar off the real rows a phase owns; databases created
// before that predate the column.
function migrateRoadmapTable(db: InstanceType<typeof Database>): void {
  const columns = new Set(
    (db.prepare('PRAGMA table_info(roadmap_items)').all() as { name: string }[]).map((c) => c.name),
  );
  if (!columns.has('phase_id')) db.exec('ALTER TABLE roadmap_items ADD COLUMN phase_id TEXT');
}

function migrateSkillsTable(db: InstanceType<typeof Database>): void {
  const columns = new Set((db.pragma('table_info(skills)') as { name: string }[]).map((c) => c.name));
  if (columns.size > 0 && !columns.has('markdown')) {
    db.exec("ALTER TABLE skills ADD COLUMN markdown TEXT NOT NULL DEFAULT ''");
    db.exec('DELETE FROM skills');
  }
}

// agent_runs gained LLM cost columns after first ship: the model used and the
// token usage + estimated cost, so /agents can show runtime and spend.
function migrateAgentRunsTable(db: InstanceType<typeof Database>): void {
  const columns = new Set(
    (db.pragma('table_info(agent_runs)') as { name: string }[]).map((c) => c.name),
  );
  if (!columns.has('model')) db.exec('ALTER TABLE agent_runs ADD COLUMN model TEXT');
  if (!columns.has('tokens_in')) db.exec('ALTER TABLE agent_runs ADD COLUMN tokens_in INTEGER');
  if (!columns.has('tokens_out')) db.exec('ALTER TABLE agent_runs ADD COLUMN tokens_out INTEGER');
  if (!columns.has('cost_usd')) db.exec('ALTER TABLE agent_runs ADD COLUMN cost_usd REAL');
}

// The trading tables shipped single-account (captured_at was the whole key).
// The operator watches two accounts now, so every row carries the account it came
// from. The primary keys change, which SQLite cannot ALTER — rebuild in place
// and adopt the existing rows as the individual account (they all were).
function migrateTradingTables(db: InstanceType<typeof Database>): void {
  const cols = (t: string) => new Set((db.pragma(`table_info(${t})`) as { name: string }[]).map((c) => c.name));

  // Adds the Autopilot switch. An existing limits row keeps its
  // numbers and starts with the switch OFF.
  if (!cols('trading_limits').has('autopilot')) {
    db.exec('ALTER TABLE trading_limits ADD COLUMN autopilot INTEGER NOT NULL DEFAULT 0');
  }

  if (!cols('trading_snapshots').has('account_id')) {
    db.exec(`
      CREATE TABLE trading_snapshots_v2 (
        account_id TEXT NOT NULL DEFAULT 'individual',
        account_label TEXT NOT NULL DEFAULT 'Individual',
        captured_at TEXT NOT NULL,
        account_value_usd REAL NOT NULL, buying_power_usd REAL NOT NULL, cash_usd REAL NOT NULL,
        day_pnl_usd REAL NOT NULL, total_pnl_usd REAL NOT NULL, source TEXT NOT NULL,
        PRIMARY KEY (account_id, captured_at)
      );
      INSERT INTO trading_snapshots_v2
        SELECT 'individual', 'Individual', captured_at, account_value_usd, buying_power_usd,
               cash_usd, day_pnl_usd, total_pnl_usd, source FROM trading_snapshots;
      DROP TABLE trading_snapshots;
      ALTER TABLE trading_snapshots_v2 RENAME TO trading_snapshots;
    `);
  }
  if (!cols('trading_positions').has('account_id')) {
    db.exec(`
      CREATE TABLE trading_positions_v2 (
        account_id TEXT NOT NULL DEFAULT 'individual',
        captured_at TEXT NOT NULL, symbol TEXT NOT NULL, quantity REAL NOT NULL,
        avg_cost_usd REAL NOT NULL, market_value_usd REAL NOT NULL, unrealized_pnl_usd REAL NOT NULL,
        PRIMARY KEY (account_id, captured_at, symbol)
      );
      INSERT INTO trading_positions_v2
        SELECT 'individual', captured_at, symbol, quantity, avg_cost_usd,
               market_value_usd, unrealized_pnl_usd FROM trading_positions;
      DROP TABLE trading_positions;
      ALTER TABLE trading_positions_v2 RENAME TO trading_positions;
    `);
  }
  if (!cols('trading_activity').has('account_id')) {
    db.exec("ALTER TABLE trading_activity ADD COLUMN account_id TEXT NOT NULL DEFAULT 'individual'");
  }
}

type AgentRow = {
  id: string;
  department_id: string;
  name: string;
  role: string;
  status: string;
  tier: string;
  description: string;
  model: string;
  tools: string;
  parent_id: string | null;
  instance: string;
};

function rowToAgent(row: AgentRow): Agent {
  return AgentSchema.parse({
    id: row.id,
    departmentId: row.department_id,
    name: row.name,
    role: row.role,
    status: row.status,
    tier: row.tier,
    description: row.description,
    model: row.model,
    tools: JSON.parse(row.tools),
    parentId: row.parent_id,
    instance: row.instance,
  });
}

export function openDb(path: string) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(DDL);
  migrateAgentsTable(db);
  migrateFunnelContactsTable(db);
  migrateSkillsTable(db);
  migrateAgentRunsTable(db);
  migrateTradingTables(db);
  migrateLeadMagnetsTable(db);
  migrateProposalsTable(db);
  migrateRoadmapTable(db);

  const departments = {
    all(): Department[] {
      return db
        .prepare('SELECT * FROM departments ORDER BY "order"')
        .all()
        .map((r) => DepartmentSchema.parse(r));
    },
    insert(d: Department): void {
      db.prepare(
        'INSERT OR REPLACE INTO departments (id, name, slug, tagline, color, "order") VALUES (?, ?, ?, ?, ?, ?)',
      ).run(d.id, d.name, d.slug, d.tagline, d.color, d.order);
    },
    deleteWhereIdNotIn(ids: string[]): void {
      const placeholders = ids.map(() => '?').join(', ');
      db.prepare(`DELETE FROM departments WHERE id NOT IN (${placeholders})`).run(...ids);
    },
  };

  const agents = {
    all(): Agent[] {
      return (db.prepare('SELECT * FROM agents ORDER BY tier, name').all() as AgentRow[]).map(rowToAgent);
    },
    byDepartment(departmentId: string): Agent[] {
      return (
        db
          .prepare('SELECT * FROM agents WHERE department_id = ? ORDER BY tier, name')
          .all(departmentId) as AgentRow[]
      ).map(rowToAgent);
    },
    insert(a: Agent): void {
      db.prepare(
        'INSERT OR REPLACE INTO agents (id, department_id, name, role, status, tier, description, model, tools, parent_id, instance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        a.id, a.departmentId, a.name, a.role, a.status, a.tier, a.description, a.model,
        JSON.stringify(a.tools), a.parentId, a.instance,
      );
    },
    deleteWhereIdNotIn(ids: string[]): void {
      const placeholders = ids.map(() => '?').join(', ');
      db.prepare(`DELETE FROM agents WHERE id NOT IN (${placeholders})`).run(...ids);
    },
  };

  const tools = {
    all(): Tool[] {
      return db
        .prepare('SELECT * FROM tools ORDER BY category, name')
        .all()
        .map((r) => ToolSchema.parse(r));
    },
    insert(t: Tool): void {
      db.prepare(
        'INSERT OR REPLACE INTO tools (id, name, category, status, color, description) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(t.id, t.name, t.category, t.status, t.color, t.description);
    },
    // Without this a tool retired from the seed lived forever in any database
    // that already existed: INSERT OR REPLACE adds and updates, it never
    // removes a row that has LEFT the seed.
    deleteWhereIdNotIn(ids: string[]): void {
      const placeholders = ids.map(() => '?').join(', ');
      db.prepare(`DELETE FROM tools WHERE id NOT IN (${placeholders})`).run(...ids);
    },
  };

  /** Key/value stamps about the database itself, e.g. which seed built it. */
  const meta = {
    get(key: string): string | null {
      const row = db.prepare('SELECT value FROM seed_meta WHERE key = ?').get(key) as
        | { value: string }
        | undefined;
      return row?.value ?? null;
    },
    set(key: string, value: string): void {
      db.prepare('INSERT OR REPLACE INTO seed_meta (key, value) VALUES (?, ?)').run(key, value);
    },
  };

  const rowToRoadmapItem = (r: any): RoadmapItem =>
    RoadmapItemSchema.parse({
      id: r.id,
      title: r.title,
      quarter: r.quarter,
      status: r.status,
      departmentId: r.department_id,
      description: r.description,
      phaseId: r.phase_id ?? null,
    });

  const roadmap = {
    all(): RoadmapItem[] {
      return db.prepare('SELECT * FROM roadmap_items ORDER BY quarter, title').all().map(rowToRoadmapItem);
    },
    insert(item: RoadmapItem): void {
      db.prepare(
        'INSERT OR REPLACE INTO roadmap_items (id, title, quarter, status, department_id, description, phase_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(
        item.id,
        item.title,
        item.quarter,
        item.status,
        item.departmentId,
        item.description,
        item.phaseId ?? null,
      );
    },
    /**
     * Mark a row done (or push it back to now/next/later) from the board. The
     * phase percentages are done/total of these rows, so this write is what
     * moves a phase bar; null means the id is not on the board.
     */
    setStatus(id: string, status: RoadmapItem['status']): RoadmapItem | null {
      const changed = db.prepare('UPDATE roadmap_items SET status = ? WHERE id = ?').run(status, id).changes;
      if (changed === 0) return null;
      const row = db.prepare('SELECT * FROM roadmap_items WHERE id = ?').get(id);
      return row ? rowToRoadmapItem(row) : null;
    },
    /** The seed is the roadmap: a row that left lib/seed.ts leaves the board. */
    deleteWhereIdNotIn(ids: string[]): void {
      if (ids.length === 0) {
        db.prepare('DELETE FROM roadmap_items').run();
        return;
      }
      db.prepare(`DELETE FROM roadmap_items WHERE id NOT IN (${ids.map(() => '?').join(',')})`).run(...ids);
    },
  };

  const metrics = {
    all(): Metric[] {
      return db
        .prepare('SELECT * FROM metrics ORDER BY label')
        .all()
        .map((r) => MetricSchema.parse(r));
    },
    insert(m: Metric): void {
      db.prepare(
        'INSERT OR REPLACE INTO metrics (id, key, label, value, unit, delta, period) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(m.id, m.key, m.label, m.value, m.unit, m.delta, m.period);
    },
  };

  const domains = {
    all(): Domain[] {
      return db
        .prepare('SELECT * FROM domains ORDER BY number')
        .all()
        .map((r: any) => DomainSchema.parse({ ...r, items: JSON.parse(r.items) }));
    },
    insert(d: Domain): void {
      db.prepare('INSERT OR REPLACE INTO domains (id, number, title, color, items) VALUES (?, ?, ?, ?, ?)').run(
        d.id,
        d.number,
        d.title,
        d.color,
        JSON.stringify(d.items),
      );
    },
  };

  const personas = {
    all(): Persona[] {
      return db
        .prepare('SELECT * FROM personas ORDER BY ord')
        .all()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) =>
          PersonaSchema.parse({
            id: r.id,
            order: r.ord,
            name: r.name,
            archetype: r.archetype,
            tagline: r.tagline,
            summary: r.summary,
            accent: r.accent,
            northStar: r.north_star,
            pillars: JSON.parse(r.pillars),
            connectors: JSON.parse(r.connectors),
            metrics: JSON.parse(r.metrics),
            brainUse: r.brain_use,
            signaturePlay: r.signature_play,
          }),
        );
    },
    insert(p: Persona): void {
      db.prepare(
        `INSERT OR REPLACE INTO personas
          (id, ord, name, archetype, tagline, summary, accent, north_star, pillars, connectors, metrics, brain_use, signature_play)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        p.id,
        p.order,
        p.name,
        p.archetype,
        p.tagline,
        p.summary,
        p.accent,
        p.northStar,
        JSON.stringify(p.pillars),
        JSON.stringify(p.connectors),
        JSON.stringify(p.metrics),
        p.brainUse,
        p.signaturePlay,
      );
    },
  };

  const phases = {
    all(): Phase[] {
      return db
        .prepare('SELECT * FROM phases ORDER BY number')
        .all()
        .map((r: any) => PhaseSchema.parse({ ...r, items: JSON.parse(r.items) }));
    },
    insert(p: Phase): void {
      db.prepare('INSERT OR REPLACE INTO phases (id, number, title, items) VALUES (?, ?, ?, ?)').run(
        p.id,
        p.number,
        p.title,
        JSON.stringify(p.items),
      );
    },
  };

  const rowToRun = (r: any): AgentRun =>
    AgentRunSchema.parse({
      id: r.id,
      agentId: r.agent_id,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      ok: Boolean(r.ok),
      summary: r.summary,
      model: r.model ?? null,
      tokensIn: r.tokens_in ?? null,
      tokensOut: r.tokens_out ?? null,
      costUsd: r.cost_usd ?? null,
    });

  const agentRuns = {
    count(): number {
      const row = db.prepare('SELECT COUNT(*) AS count FROM agent_runs').get() as { count: number };
      return row.count;
    },
    countReal(): number {
      const row = db
        .prepare("SELECT COUNT(*) AS count FROM agent_runs WHERE id NOT LIKE 'seed-run-%'")
        .get() as { count: number };
      return row.count;
    },
    byAgent(agentId: string): AgentRun[] {
      return db
        .prepare('SELECT * FROM agent_runs WHERE agent_id = ? ORDER BY started_at DESC')
        .all(agentId)
        .map(rowToRun);
    },
    recent(limit: number): AgentRun[] {
      return db
        .prepare('SELECT * FROM agent_runs ORDER BY started_at DESC, rowid DESC LIMIT ?')
        .all(limit)
        .map(rowToRun);
    },
    insert(run: AgentRun): void {
      db.prepare(
        'INSERT OR REPLACE INTO agent_runs (id, agent_id, started_at, finished_at, ok, summary, model, tokens_in, tokens_out, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        run.id, run.agentId, run.startedAt, run.finishedAt, run.ok ? 1 : 0, run.summary,
        run.model ?? null, run.tokensIn ?? null, run.tokensOut ?? null, run.costUsd ?? null,
      );
    },
  };

  const rowToMessage = (r: any): AgentMessage =>
    AgentMessageSchema.parse({
      id: r.id,
      agentId: r.agent_id,
      role: r.role,
      content: r.content,
      toolCalls: JSON.parse(r.tool_calls || '[]'),
      createdAt: r.created_at,
    });

  const agentMessages = {
    insert(m: AgentMessage): void {
      const parsed = AgentMessageSchema.parse(m);
      db.prepare(
        'INSERT OR REPLACE INTO agent_messages (id, agent_id, role, content, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(parsed.id, parsed.agentId, parsed.role, parsed.content, JSON.stringify(parsed.toolCalls), parsed.createdAt);
    },
    /** Full conversation for one agent, oldest → newest (ready to replay). */
    byAgent(agentId: string): AgentMessage[] {
      return db
        .prepare('SELECT * FROM agent_messages WHERE agent_id = ? ORDER BY created_at ASC, rowid ASC')
        .all(agentId)
        .map(rowToMessage);
    },
    recent(limit: number): AgentMessage[] {
      return db
        .prepare('SELECT * FROM agent_messages ORDER BY created_at DESC, rowid DESC LIMIT ?')
        .all(limit)
        .map(rowToMessage);
    },
  };

  const rowToReply = (r: any): BroadcastReply =>
    BroadcastReplySchema.parse({
      id: r.id,
      broadcastId: r.broadcast_id,
      agentId: r.agent_id,
      ok: Boolean(r.ok),
      reply: r.reply,
      finishedAt: r.finished_at,
    });

  const broadcasts = {
    insert(b: { id: string; message: string; createdAt: string }): void {
      db.prepare('INSERT OR REPLACE INTO broadcasts (id, message, created_at) VALUES (?, ?, ?)').run(
        b.id, b.message, b.createdAt,
      );
    },
    insertReply(r: BroadcastReply): void {
      db.prepare(
        'INSERT OR REPLACE INTO broadcast_replies (id, broadcast_id, agent_id, ok, reply, finished_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(r.id, r.broadcastId, r.agentId, r.ok ? 1 : 0, r.reply, r.finishedAt);
    },
    recent(limit: number): Broadcast[] {
      const rows = db
        .prepare('SELECT * FROM broadcasts ORDER BY created_at DESC, rowid DESC LIMIT ?')
        .all(limit) as { id: string; message: string; created_at: string }[];
      const replyStmt = db.prepare('SELECT * FROM broadcast_replies WHERE broadcast_id = ? ORDER BY agent_id');
      return rows.map((b) =>
        BroadcastSchema.parse({
          id: b.id,
          message: b.message,
          createdAt: b.created_at,
          replies: replyStmt.all(b.id).map(rowToReply),
        }),
      );
    },
  };

  const rowToTask = (r: any): AgentTask =>
    AgentTaskSchema.parse({
      id: r.id, agentId: r.agent_id, title: r.title, status: r.status,
      createdAt: r.created_at, updatedAt: r.updated_at,
    });

  const agentTasks = {
    insert(t: AgentTask): void {
      AgentTaskSchema.parse(t);
      db.prepare(
        'INSERT OR REPLACE INTO agent_tasks (id, agent_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(t.id, t.agentId, t.title, t.status, t.createdAt, t.updatedAt);
    },
    byAgent(agentId: string): AgentTask[] {
      return db
        .prepare('SELECT * FROM agent_tasks WHERE agent_id = ? ORDER BY created_at DESC, rowid DESC')
        .all(agentId)
        .map(rowToTask);
    },
    all(): AgentTask[] {
      return db.prepare('SELECT * FROM agent_tasks ORDER BY created_at DESC, rowid DESC').all().map(rowToTask);
    },
    setStatus(id: string, status: AgentTask['status'], updatedAt: string): void {
      AgentTaskSchema.shape.status.parse(status);
      db.prepare('UPDATE agent_tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, updatedAt, id);
    },
    remove(id: string): void {
      db.prepare('DELETE FROM agent_tasks WHERE id = ?').run(id);
    },
  };

  const rowToCron = (r: any): AgentCron =>
    AgentCronSchema.parse({
      id: r.id, agentId: r.agent_id, schedule: r.schedule, description: r.description,
      enabled: Boolean(r.enabled), createdAt: r.created_at,
    });

  const rowToCronRun = (r: any): CronRun =>
    CronRunSchema.parse({
      id: r.id, cronId: r.cron_id, agentId: r.agent_id, startedAt: r.started_at,
      finishedAt: r.finished_at ?? null, ok: Boolean(r.ok), summary: r.summary,
    });

  const cronRuns = {
    insert(r: CronRun): void {
      CronRunSchema.parse(r);
      db.prepare(
        'INSERT OR REPLACE INTO cron_runs (id, cron_id, agent_id, started_at, finished_at, ok, summary) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(r.id, r.cronId, r.agentId, r.startedAt, r.finishedAt, r.ok ? 1 : 0, r.summary);
    },
    byCron(cronId: string, limit = 20): CronRun[] {
      return db
        .prepare('SELECT * FROM cron_runs WHERE cron_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?')
        .all(cronId, limit)
        .map(rowToCronRun);
    },
    recent(limit = 50): CronRun[] {
      return db
        .prepare('SELECT * FROM cron_runs ORDER BY started_at DESC, rowid DESC LIMIT ?')
        .all(limit)
        .map(rowToCronRun);
    },
    /** run counts + last outcome per cron — the stats worth keeping per job. */
    statsByCron(): Record<string, { runs: number; ok: number; lastRunAt: string | null; lastOk: boolean | null }> {
      const rows = db
        .prepare(
          `SELECT cron_id AS cronId, COUNT(*) AS runs, SUM(ok) AS okCount, MAX(started_at) AS lastRunAt
           FROM cron_runs GROUP BY cron_id`,
        )
        .all() as { cronId: string; runs: number; okCount: number; lastRunAt: string }[];
      const out: Record<string, { runs: number; ok: number; lastRunAt: string | null; lastOk: boolean | null }> = {};
      for (const r of rows) {
        const last = db
          .prepare('SELECT ok FROM cron_runs WHERE cron_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1')
          .get(r.cronId) as { ok: number } | undefined;
        out[r.cronId] = {
          runs: r.runs,
          ok: r.okCount ?? 0,
          lastRunAt: r.lastRunAt ?? null,
          lastOk: last ? last.ok === 1 : null,
        };
      }
      return out;
    },
  };

  const digestReads = {
    mark(key: string, at = new Date().toISOString()): void {
      db.prepare('INSERT OR REPLACE INTO digest_reads (key, read_at) VALUES (?, ?)').run(key, at);
    },
    unmark(key: string): void {
      db.prepare('DELETE FROM digest_reads WHERE key = ?').run(key);
    },
    keys(): string[] {
      return (db.prepare('SELECT key FROM digest_reads ORDER BY read_at DESC').all() as { key: string }[]).map(
        (r) => r.key,
      );
    },
    /** Housekeeping: a key for a message older than the window can never match
     *  again, so the table stays small instead of growing forever. */
    prune(before: string): void {
      db.prepare('DELETE FROM digest_reads WHERE read_at < ?').run(before);
    },
  };

  const commsDigests = {
    insert(d: { id: string; generatedAt: string; payload: string }): void {
      db.prepare('INSERT OR REPLACE INTO comms_digests (id, generated_at, payload) VALUES (?, ?, ?)').run(
        d.id,
        d.generatedAt,
        d.payload,
      );
    },
    latest(): { id: string; generatedAt: string; payload: string } | null {
      const row = db
        .prepare('SELECT id, generated_at AS generatedAt, payload FROM comms_digests ORDER BY generated_at DESC, rowid DESC LIMIT 1')
        .get() as { id: string; generatedAt: string; payload: string } | undefined;
      return row ?? null;
    },
    recent(limit = 14): { id: string; generatedAt: string; payload: string }[] {
      return db
        .prepare('SELECT id, generated_at AS generatedAt, payload FROM comms_digests ORDER BY generated_at DESC, rowid DESC LIMIT ?')
        .all(limit) as { id: string; generatedAt: string; payload: string }[];
    },
  };

  // Plaud recordings already filed into the brain (lib/plaud-ingest.ts). The
  // file id is the idempotency key: one page per recording, ever.
  const plaudIngests = {
    insert(r: PlaudIngest): void {
      const v = PlaudIngestSchema.parse(r);
      db.prepare(
        'INSERT OR REPLACE INTO plaud_ingests (file_id, title, recorded_at, ingested_at, via, slug, claims) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(v.fileId, v.title, v.recordedAt, v.ingestedAt, v.via, v.slug, v.claims);
    },
    has(fileId: string): boolean {
      return !!db.prepare('SELECT 1 FROM plaud_ingests WHERE file_id = ?').get(fileId);
    },
    all(): PlaudIngest[] {
      return (
        db
          .prepare(
            'SELECT file_id AS fileId, title, recorded_at AS recordedAt, ingested_at AS ingestedAt, via, slug, claims FROM plaud_ingests ORDER BY ingested_at DESC',
          )
          .all() as unknown[]
      ).map((row) => PlaudIngestSchema.parse(row));
    },
  };

  const agentCrons = {
    insert(c: AgentCron): void {
      AgentCronSchema.parse(c);
      if (!isValidCron(c.schedule)) throw new Error(`invalid cron schedule: ${c.schedule}`);
      db.prepare(
        'INSERT OR REPLACE INTO agent_crons (id, agent_id, schedule, description, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(c.id, c.agentId, c.schedule, c.description, c.enabled ? 1 : 0, c.createdAt);
    },
    byAgent(agentId: string): AgentCron[] {
      return db
        .prepare('SELECT * FROM agent_crons WHERE agent_id = ? ORDER BY created_at DESC, rowid DESC')
        .all(agentId)
        .map(rowToCron);
    },
    all(): AgentCron[] {
      return db.prepare('SELECT * FROM agent_crons ORDER BY created_at DESC, rowid DESC').all().map(rowToCron);
    },
    setEnabled(id: string, enabled: boolean): void {
      db.prepare('UPDATE agent_crons SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
    },
    remove(id: string): void {
      db.prepare('DELETE FROM agent_crons WHERE id = ?').run(id);
    },
  };

  const contactTags = {
    upsert(t: ContactTag): void {
      ContactTagSchema.parse(t);
      db.prepare(
        'INSERT INTO contact_tags (person, channel, tag, tier) VALUES (?, ?, ?, ?) ON CONFLICT(person, channel) DO UPDATE SET tag = excluded.tag, tier = excluded.tier',
      ).run(t.person, t.channel, t.tag, t.tier);
    },
    all(): ContactTag[] {
      return (db.prepare('SELECT * FROM contact_tags ORDER BY tier, person').all() as ContactTag[]).map(
        (r) => ContactTagSchema.parse(r),
      );
    },
    byTier(tier: number): ContactTag[] {
      return (
        db.prepare('SELECT * FROM contact_tags WHERE tier = ? ORDER BY person').all(tier) as ContactTag[]
      ).map((r) => ContactTagSchema.parse(r));
    },
    remove(person: string, channel: string): void {
      db.prepare('DELETE FROM contact_tags WHERE person = ? AND channel = ?').run(person, channel);
    },
  };

  const rowToSnapshot = (r: any): SocialSnapshot =>
    SocialSnapshotSchema.parse({
      platform: r.platform,
      capturedAt: r.captured_at,
      followers: r.followers,
      source: r.source,
    });

  const social = {
    upsertAccount(a: SocialAccount): void {
      SocialAccountSchema.parse(a);
      db.prepare(
        'INSERT OR REPLACE INTO social_accounts (platform, handle, url, "order") VALUES (?, ?, ?, ?)',
      ).run(a.platform, a.handle, a.url, a.order);
    },
    accounts(): SocialAccount[] {
      return db
        .prepare('SELECT * FROM social_accounts ORDER BY "order"')
        .all()
        .map((r) => SocialAccountSchema.parse(r));
    },
    insertSnapshot(s: SocialSnapshot): void {
      SocialSnapshotSchema.parse(s);
      db.prepare(
        'INSERT OR REPLACE INTO social_snapshots (platform, captured_at, followers, source) VALUES (?, ?, ?, ?)',
      ).run(s.platform, s.capturedAt, s.followers, s.source);
    },
    snapshots(platform: SocialPlatform): SocialSnapshot[] {
      return db
        .prepare('SELECT * FROM social_snapshots WHERE platform = ? ORDER BY captured_at')
        .all(platform)
        .map(rowToSnapshot);
    },
    latest(): SocialSnapshot[] {
      return db
        .prepare(
          `SELECT * FROM social_snapshots s
           WHERE captured_at = (SELECT MAX(captured_at) FROM social_snapshots WHERE platform = s.platform)
           ORDER BY platform`,
        )
        .all()
        .map(rowToSnapshot);
    },
    upsertDm(d: SocialDm): void {
      SocialDmSchema.parse(d);
      db.prepare(
        'INSERT OR REPLACE INTO social_dms (platform, count, updated_at) VALUES (?, ?, ?)',
      ).run(d.platform, d.count, d.updatedAt);
    },
    dms(): SocialDm[] {
      return db
        .prepare(
          `SELECT d.platform, d.count, d.updated_at AS updatedAt FROM social_dms d
           LEFT JOIN social_accounts a ON a.platform = d.platform
           ORDER BY a."order"`,
        )
        .all()
        .map((r) => SocialDmSchema.parse(r));
    },
    insertDmSnapshot(s: SocialDmSnapshot): void {
      SocialDmSnapshotSchema.parse(s);
      db.prepare(
        'INSERT OR REPLACE INTO social_dm_snapshots (platform, captured_at, count, source) VALUES (?, ?, ?, ?)',
      ).run(s.platform, s.capturedAt, s.count, s.source);
    },
    dmSnapshots(platform?: SocialPlatform): SocialDmSnapshot[] {
      const rows = platform
        ? db
            .prepare('SELECT platform, captured_at AS capturedAt, count, source FROM social_dm_snapshots WHERE platform = ? ORDER BY captured_at')
            .all(platform)
        : db
            .prepare('SELECT platform, captured_at AS capturedAt, count, source FROM social_dm_snapshots ORDER BY platform, captured_at')
            .all();
      return rows.map((r) => SocialDmSnapshotSchema.parse(r));
    },
    // Individual DM messages (the inbox). Fed live by POST /api/webhooks/manychat;
    // seeded until then. Upsert by id so replayed webhooks don't duplicate.
    upsertDmMessage(m: SocialDmMessage): void {
      SocialDmMessageSchema.parse(m);
      db.prepare(
        `INSERT OR REPLACE INTO social_dm_messages
           (id, platform, subscriber_id, name, handle, text, direction, tag, ts, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(m.id, m.platform, m.subscriberId, m.name, m.handle, m.text, m.direction, m.tag, m.ts, m.source);
    },
    dmMessages(platform?: SocialPlatform): SocialDmMessage[] {
      const cols =
        'id, platform, subscriber_id AS subscriberId, name, handle, text, direction, tag, ts, source';
      const rows = platform
        ? db.prepare(`SELECT ${cols} FROM social_dm_messages WHERE platform = ? ORDER BY ts DESC`).all(platform)
        : db.prepare(`SELECT ${cols} FROM social_dm_messages ORDER BY ts DESC`).all();
      return rows.map((r) => SocialDmMessageSchema.parse(r));
    },
  };

  const emailList = {
    insertSnapshot(s: EmailListSnapshot): void {
      EmailListSnapshotSchema.parse(s);
      db.prepare(
        'INSERT OR REPLACE INTO email_list_snapshots (captured_at, subscribers, source) VALUES (?, ?, ?)',
      ).run(s.capturedAt, s.subscribers, s.source);
    },
    // Drop seed-sourced rows so a re-seed is authoritative — the real Beehiiv
    // baseline replaces any retired dummy history. Live-synced snapshots
    // (source 'beehiiv') are preserved.
    deleteSeeded(): void {
      db.prepare("DELETE FROM email_list_snapshots WHERE source LIKE 'seed%'").run();
    },
    snapshots(): EmailListSnapshot[] {
      return db
        .prepare('SELECT captured_at AS capturedAt, subscribers, source FROM email_list_snapshots ORDER BY captured_at')
        .all()
        .map((r) => EmailListSnapshotSchema.parse(r));
    },
    latest(): EmailListSnapshot | null {
      const row = db
        .prepare('SELECT captured_at AS capturedAt, subscribers, source FROM email_list_snapshots ORDER BY captured_at DESC LIMIT 1')
        .get();
      return row ? EmailListSnapshotSchema.parse(row) : null;
    },
  };

  /** Robinhood agentic account, agent-fed. The trading agent pushes snapshots
   *  (account + positions) and individual trades via /api/trading/*; the
   *  /trading dashboard reads them back. Never queried from a page directly. */
  const trading = {
    recordSnapshot(s: TradingAccountSnapshot, positions: TradingPosition[]): void {
      TradingAccountSnapshotSchema.parse(s);
      db.prepare(
        `INSERT OR REPLACE INTO trading_snapshots
           (account_id, account_label, captured_at, account_value_usd, buying_power_usd, cash_usd,
            day_pnl_usd, total_pnl_usd, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        s.accountId, s.accountLabel, s.capturedAt, s.accountValueUsd,
        s.buyingPowerUsd, s.cashUsd, s.dayPnlUsd, s.totalPnlUsd, s.source,
      );
      const ins = db.prepare(
        `INSERT OR REPLACE INTO trading_positions
           (account_id, captured_at, symbol, quantity, avg_cost_usd, market_value_usd, unrealized_pnl_usd)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const p of positions) {
        TradingPositionSchema.parse(p);
        ins.run(p.accountId, p.capturedAt, p.symbol, p.quantity, p.avgCostUsd, p.marketValueUsd, p.unrealizedPnlUsd);
      }
    },
    /**
 * Drop the demo rows the moment real data exists. Seeded snapshots carry
 * source 'seed' (their positions share the captured_at), seeded trades
 * carry ids 'tr-seed-*'. Left in place they sit in FRONT of the real
 * series and draw a fake cliff on the sleeve graph (the host).
 */
    evictSeeded(): { snapshots: number; positions: number; activity: number } {
      const run = db.transaction(() => {
        const positions = db
          .prepare(
            `DELETE FROM trading_positions
              WHERE (account_id, captured_at) IN
                    (SELECT account_id, captured_at FROM trading_snapshots WHERE source = 'seed')`,
          )
          .run().changes;
        const snapshots = db.prepare(`DELETE FROM trading_snapshots WHERE source = 'seed'`).run().changes;
        const activity = db.prepare(`DELETE FROM trading_activity WHERE id LIKE 'tr-seed-%'`).run().changes;
        return { snapshots, positions, activity };
      });
      return run();
    },
    /** The largest account's latest snapshot — what the connector card reports. */
    latestSnapshot(): TradingAccountSnapshot | null {
      return trading.latestSnapshots()[0] ?? null;
    },
    /** The newest snapshot of every account, richest first. */
    latestSnapshots(): TradingAccountSnapshot[] {
      return db
        .prepare(
          `SELECT account_id AS accountId, account_label AS accountLabel, captured_at AS capturedAt,
                  account_value_usd AS accountValueUsd, buying_power_usd AS buyingPowerUsd,
                  cash_usd AS cashUsd, day_pnl_usd AS dayPnlUsd, total_pnl_usd AS totalPnlUsd, source
             FROM trading_snapshots
            WHERE (account_id, captured_at) IN
                  (SELECT account_id, MAX(captured_at) FROM trading_snapshots GROUP BY account_id)
            ORDER BY account_value_usd DESC`,
        )
        .all()
        .map((r) => TradingAccountSnapshotSchema.parse(r));
    },
    /** One account's snapshots oldest-first — the series behind the graph. */
    history(accountId: string, limit = 500): TradingAccountSnapshot[] {
      return db
        .prepare(
          `SELECT account_id AS accountId, account_label AS accountLabel, captured_at AS capturedAt,
                  account_value_usd AS accountValueUsd, buying_power_usd AS buyingPowerUsd,
                  cash_usd AS cashUsd, day_pnl_usd AS dayPnlUsd, total_pnl_usd AS totalPnlUsd, source
             FROM trading_snapshots WHERE account_id = ?
            ORDER BY captured_at ASC LIMIT ?`,
        )
        .all(accountId, limit)
        .map((r) => TradingAccountSnapshotSchema.parse(r));
    },
    /** Positions from each account's latest snapshot (all accounts by default). */
    positions(accountId?: string): TradingPosition[] {
      const rows = db
        .prepare(
          `SELECT p.account_id AS accountId, p.captured_at AS capturedAt, p.symbol, p.quantity,
                  p.avg_cost_usd AS avgCostUsd, p.market_value_usd AS marketValueUsd,
                  p.unrealized_pnl_usd AS unrealizedPnlUsd
             FROM trading_positions p
            WHERE (p.account_id, p.captured_at) IN
                  (SELECT account_id, MAX(captured_at) FROM trading_snapshots GROUP BY account_id)
              AND (? IS NULL OR p.account_id = ?)
            ORDER BY p.market_value_usd DESC`,
        )
        .all(accountId ?? null, accountId ?? null);
      return rows.map((r) => TradingPositionSchema.parse(r));
    },
    /**
     * Replace one account's live orders wholesale. Deliberately NOT an upsert:
     * an order that filled or was cancelled has to disappear, and a stale
     * "queued" row on screen is worse than showing nothing.
     */
    recordOpenOrders(accountId: string, orders: TradingOrder[]): void {
      const write = db.transaction(() => {
        db.prepare('DELETE FROM trading_orders WHERE account_id = ?').run(accountId);
        const ins = db.prepare(
          `INSERT OR REPLACE INTO trading_orders
             (id, account_id, symbol, side, type, state, quantity, filled_quantity,
              dollar_amount_usd, limit_price_usd, placed_agent, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const o of orders) {
          TradingOrderSchema.parse(o);
          ins.run(o.id, accountId, o.symbol, o.side, o.type, o.state, o.quantity,
            o.filledQuantity, o.dollarAmountUsd, o.limitPriceUsd, o.placedAgent, o.createdAt);
        }
      });
      write();
    },
    openOrders(accountId?: string): TradingOrder[] {
      return db
        .prepare(
          `SELECT id, account_id AS accountId, symbol, side, type, state, quantity,
                  filled_quantity AS filledQuantity, dollar_amount_usd AS dollarAmountUsd,
                  limit_price_usd AS limitPriceUsd, placed_agent AS placedAgent, created_at AS createdAt
             FROM trading_orders WHERE (? IS NULL OR account_id = ?)
            ORDER BY created_at DESC`,
        )
        .all(accountId ?? null, accountId ?? null)
        .map((r) => TradingOrderSchema.parse(r));
    },
    /** One run's reasoning. Idempotent on id so a retried push cannot duplicate. */
    recordAnalysis(a: TradeAnalysis): void {
      TradeAnalysisSchema.parse(a);
      db.prepare(
        `INSERT OR REPLACE INTO trading_analysis
           (id, at, account_id, agent, examined, signals, notes, rows)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(a.id, a.at, a.accountId, a.agent, a.examined, a.signals, a.notes, JSON.stringify(a.rows));
    },
    analyses(accountId?: string, limit = 30): TradeAnalysis[] {
      return db
        .prepare(
          `SELECT id, at, account_id AS accountId, agent, examined, signals, notes, rows
             FROM trading_analysis WHERE (? IS NULL OR account_id = ?)
            ORDER BY at DESC LIMIT ?`,
        )
        .all(accountId ?? null, accountId ?? null, limit)
        .map((r) => {
          const row = r as { rows: string } & Record<string, unknown>;
          return TradeAnalysisSchema.parse({ ...row, rows: JSON.parse(row.rows) });
        });
    },
    latestAnalysis(accountId?: string): TradeAnalysis | null {
      return trading.analyses(accountId, 1)[0] ?? null;
    },
    recordActivity(a: TradeActivity): void {
      TradeActivitySchema.parse(a);
      db.prepare(
        `INSERT OR REPLACE INTO trading_activity
           (id, at, account_id, agent, action, symbol, quantity, price_usd, rationale, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(a.id, a.at, a.accountId, a.agent, a.action, a.symbol, a.quantity, a.priceUsd, a.rationale, a.status);
    },
    activity(limit = 50, accountId?: string): TradeActivity[] {
      return db
        .prepare(
          `SELECT id, at, account_id AS accountId, agent, action, symbol, quantity,
                  price_usd AS priceUsd, rationale, status
             FROM trading_activity WHERE (? IS NULL OR account_id = ?)
            ORDER BY at DESC LIMIT ?`,
        )
        .all(accountId ?? null, accountId ?? null, limit)
        .map((r) => TradeActivitySchema.parse(r));
    },

    /** The agent's editable guardrail limits, or null when none were ever
     *  saved — the caller then falls back to the code defaults rather than
     *  inventing a permissive set. */
    limits(): TradingLimits | null {
      const row = db
        .prepare(
          `SELECT max_notional_per_trade_usd AS maxNotionalPerTradeUsd,
                  max_position_pct_of_sleeve AS maxPositionPctOfSleeve,
                  max_risk_pct_per_trade     AS maxRiskPctPerTrade,
                  max_concurrent_positions   AS maxConcurrentPositions,
                  max_trades_per_day         AS maxTradesPerDay,
                  min_sleeve_value_usd       AS minSleeveValueUsd,
                  max_deployed_capital_usd   AS maxDeployedCapitalUsd,
                  autopilot
             FROM trading_limits WHERE id = 1`,
        )
        .get() as (Record<string, number> & { autopilot: number }) | undefined;
      return row ? TradingLimitsSchema.parse({ ...row, autopilot: row.autopilot === 1 }) : null;
    },

    limitsUpdatedAt(): string | null {
      const row = db.prepare('SELECT updated_at AS updatedAt FROM trading_limits WHERE id = 1').get() as
        | { updatedAt: string }
        | undefined;
      return row?.updatedAt ?? null;
    },

    saveLimits(l: Omit<TradingLimits, 'autopilot'> & { autopilot?: boolean }, now = new Date().toISOString()): void {
      db.prepare(
        `INSERT OR REPLACE INTO trading_limits
           (id, max_notional_per_trade_usd, max_position_pct_of_sleeve, max_risk_pct_per_trade,
            max_concurrent_positions, max_trades_per_day, min_sleeve_value_usd,
            max_deployed_capital_usd, autopilot, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        l.maxNotionalPerTradeUsd,
        l.maxPositionPctOfSleeve,
        l.maxRiskPctPerTrade,
        l.maxConcurrentPositions,
        l.maxTradesPerDay,
        l.minSleeveValueUsd,
        l.maxDeployedCapitalUsd,
        l.autopilot ? 1 : 0,
        now,
      );
    },
  };

  /** Per-metric history for the analytics sparklines. Written by the
   *  /api/analytics/refresh sweep (launchd cron every 15 min); one row per
   *  capture, read back as per-day last-known value. */
  const metricSnapshots = {
    record(metricId: string, value: number, capturedAt: string): void {
      MetricSnapshotSchema.parse({ metricId, capturedAt, value });
      db.prepare(
        'INSERT OR REPLACE INTO metric_snapshots (metric_id, captured_at, value) VALUES (?, ?, ?)',
      ).run(metricId, capturedAt, value);
    },
    history(metricId: string, days: number, today: string): { date: string; value: number }[] {
      return db
        .prepare(
          `SELECT date, value FROM (
             SELECT substr(captured_at, 1, 10) AS date, value,
                    ROW_NUMBER() OVER (
                      PARTITION BY substr(captured_at, 1, 10) ORDER BY captured_at DESC
                    ) AS rn
             FROM metric_snapshots
             WHERE metric_id = ? AND substr(captured_at, 1, 10) >= date(?, ?)
           ) WHERE rn = 1 ORDER BY date`,
        )
        .all(metricId, today, `-${Math.max(1, Math.floor(days))} days`)
        .map((r) => {
          const row = r as { date: string; value: number };
          MetricSnapshotSchema.parse({ metricId, capturedAt: row.date, value: row.value });
          return row;
        });
    },
  };

  const rowToPost = (r: {
    id: string;
    caption: string;
    media_url: string | null;
    platforms: string;
    status: string;
    scheduled_for: string | null;
    created_at: string;
  }): SocialPost =>
    SocialPostSchema.parse({
      id: r.id,
      caption: r.caption,
      mediaUrl: r.media_url,
      platforms: JSON.parse(r.platforms),
      status: r.status,
      scheduledFor: r.scheduled_for,
      createdAt: r.created_at,
    });

  const socialPosts = {
    enqueue(p: SocialPost): void {
      SocialPostSchema.parse(p);
      db.prepare(
        `INSERT OR REPLACE INTO social_posts (id, caption, media_url, platforms, status, scheduled_for, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(p.id, p.caption, p.mediaUrl, JSON.stringify(p.platforms), p.status, p.scheduledFor, p.createdAt);
    },
    all(): SocialPost[] {
      return db
        .prepare('SELECT * FROM social_posts ORDER BY created_at DESC')
        .all()
        .map((r) => rowToPost(r as Parameters<typeof rowToPost>[0]));
    },
    queued(): SocialPost[] {
      return db
        .prepare("SELECT * FROM social_posts WHERE status = 'queued' ORDER BY created_at DESC")
        .all()
        .map((r) => rowToPost(r as Parameters<typeof rowToPost>[0]));
    },
  };

  const people = {
    all(): Person[] {
      return db
        .prepare('SELECT * FROM people ORDER BY department_id, name')
        .all()
        .map((r: any) =>
          PersonSchema.parse({
            id: r.id,
            departmentId: r.department_id,
            name: r.name,
            role: r.role,
            tools: JSON.parse(r.tools),
          }),
        );
    },
    insert(p: Person): void {
      PersonSchema.parse(p);
      db.prepare(
        'INSERT OR REPLACE INTO people (id, department_id, name, role, tools) VALUES (?, ?, ?, ?, ?)',
      ).run(p.id, p.departmentId, p.name, p.role, JSON.stringify(p.tools));
    },
    deleteWhereIdNotIn(ids: string[]): void {
      const placeholders = ids.map(() => '?').join(', ');
      db.prepare(`DELETE FROM people WHERE id NOT IN (${placeholders})`).run(...ids);
    },
  };

  const sopTasks = {
    all(): SopTask[] {
      return db
        .prepare('SELECT * FROM sop_tasks ORDER BY department_id, title')
        .all()
        .map((r: any) =>
          SopTaskSchema.parse({
            id: r.id,
            departmentId: r.department_id,
            title: r.title,
            summary: r.summary,
            steps: JSON.parse(r.steps),
            assigneeKind: r.assignee_kind,
            assigneeId: r.assignee_id,
          }),
        );
    },
    insert(t: SopTask): void {
      SopTaskSchema.parse(t);
      db.prepare(
        'INSERT OR REPLACE INTO sop_tasks (id, department_id, title, summary, steps, assignee_kind, assignee_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(t.id, t.departmentId, t.title, t.summary, JSON.stringify(t.steps), t.assigneeKind, t.assigneeId);
    },
    deleteWhereIdNotIn(ids: string[]): void {
      const placeholders = ids.map(() => '?').join(', ');
      db.prepare(`DELETE FROM sop_tasks WHERE id NOT IN (${placeholders})`).run(...ids);
    },
  };

  /** Client proposals. The generator deploys to Vercel and leaves source on
   *  the operator's laptop, so the URL is what the OS stores and shows. */
  const proposals = {
    all(): Proposal[] {
      return db
        .prepare('SELECT * FROM proposals ORDER BY created_at DESC, client')
        .all()
        .map((r: any) =>
          ProposalSchema.parse({
            id: r.id,
            client: r.client,
            brand: r.brand,
            url: r.url,
            status: r.status,
            amountUsd: r.amount_usd ?? null,
            notes: r.notes ?? '',
            createdAt: r.created_at,
            origin: r.origin ?? 'seed',
            accessCode: r.access_code ?? '',
          }),
        );
    },
    insert(p: Proposal): void {
      ProposalSchema.parse(p);
      db.prepare(
        `INSERT OR REPLACE INTO proposals
           (id, client, brand, url, status, amount_usd, notes, created_at, origin, access_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        p.id,
        p.client,
        p.brand,
        p.url,
        p.status,
        p.amountUsd,
        p.notes,
        p.createdAt,
        p.origin ?? 'seed',
        p.accessCode ?? '',
      );
    },
    /** Re-seed cleanup that only ever removes rows the SEED owns. A proposal
     *  the operator added through the OS is theirs, and must survive. */
    deleteSeededNotIn(ids: string[]): void {
      const keep = ids.length ? ids.map(() => '?').join(',') : "''";
      db.prepare(`DELETE FROM proposals WHERE origin = 'seed' AND id NOT IN (${keep})`).run(...ids);
    },
  };

  /**
 * The operator's approve/dismiss calls on agent work.
 *
 * Server-side rather than localStorage because the board runs on the host and
 * the operator opens the OS from more than one machine: a call made on the
 * laptop has to still be made on the phone. It is also the only place an
 * agent could ever read the decision back.
 */
  const deliverableDecisions = {
    all(): DeliverableDecision[] {
      return db
        .prepare('SELECT * FROM deliverable_decisions ORDER BY decided_at DESC, id')
        .all()
        .map((r: any) =>
          DeliverableDecisionSchema.parse({
            id: r.id,
            decision: r.decision,
            decidedAt: r.decided_at,
            decidedRevision: r.decided_revision ?? '',
            note: r.note ?? '',
          }),
        );
    },
    /** Deciding again on the same id replaces: one open call per deliverable. */
    set(d: DeliverableDecision): void {
      const v = DeliverableDecisionSchema.parse(d);
      db.prepare(
        `INSERT OR REPLACE INTO deliverable_decisions
           (id, decision, decided_at, decided_revision, note)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(v.id, v.decision, v.decidedAt, v.decidedRevision, v.note);
    },
    /** Undo — the row returns to the open queue. */
    clear(id: string): void {
      db.prepare('DELETE FROM deliverable_decisions WHERE id = ?').run(id);
    },
  };

  /**
 * Brand deals, owned by the OS: the operator is moving off Notion and wants
 * this to be its own system of record. The Notion connector still backs the
 * existing /brand-deals board, but the agent and anything new read here.
 */
  const brandDeals = {
    all(): BrandDeal[] {
      return db
        .prepare('SELECT * FROM brand_deals ORDER BY last_edited DESC, brand')
        .all()
        .map((r: any) =>
          BrandDealSchema.parse({
            id: r.id,
            brand: r.brand,
            status: r.status,
            tier: r.tier ?? null,
            dealValueUsd: r.deal_value_usd ?? null,
            budgetUsd: r.budget_usd ?? null,
            amountAgreedUsd: r.amount_agreed_usd ?? null,
            suggestedRateUsd: r.suggested_rate_usd ?? null,
            paidInFull: !!r.paid_in_full,
            deadline: r.deadline ?? null,
            followUpDate: r.follow_up_date ?? null,
            contactName: r.contact_name ?? null,
            contactEmail: r.contact_email ?? null,
            mainChannel: r.main_channel ?? null,
            videoType: r.video_type ?? null,
            source: r.source ?? null,
            icpFit: r.icp_fit ?? null,
            notionUrl: r.notion_url,
            lastEdited: r.last_edited,
            seeded: !!r.seeded,
          }),
        );
    },
    upsert(d: BrandDeal): void {
      BrandDealSchema.parse(d);
      db.prepare(
        `INSERT OR REPLACE INTO brand_deals
           (id, brand, status, tier, deal_value_usd, budget_usd, amount_agreed_usd,
            suggested_rate_usd, paid_in_full, deadline, follow_up_date, contact_name,
            contact_email, main_channel, video_type, source, icp_fit, notion_url,
            last_edited, seeded)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        d.id, d.brand, d.status, d.tier, d.dealValueUsd, d.budgetUsd, d.amountAgreedUsd,
        d.suggestedRateUsd, d.paidInFull ? 1 : 0, d.deadline, d.followUpDate, d.contactName,
        d.contactEmail, d.mainChannel, d.videoType, d.source, d.icpFit, d.notionUrl,
        d.lastEdited, d.seeded ? 1 : 0,
      );
    },
    remove(id: string): void {
      db.prepare('DELETE FROM brand_deals WHERE id = ?').run(id);
    },
  };

  const leadMagnets = {
    all(): LeadMagnet[] {
      return db
        .prepare('SELECT * FROM lead_magnets ORDER BY launched_at DESC, name')
        .all()
        .map((r: any) =>
          LeadMagnetSchema.parse({
            id: r.id,
            name: r.name,
            offer: r.offer,
            url: r.url,
            status: r.status,
            captures: r.captures,
            destination: r.destination,
            source: r.source,
            launchedAt: r.launched_at,
            notes: r.notes,
            origin: r.origin ?? 'seed',
          }),
        );
    },
    insert(m: LeadMagnet): void {
      LeadMagnetSchema.parse(m);
      db.prepare(
        'INSERT OR REPLACE INTO lead_magnets (id, name, offer, url, status, captures, destination, source, launched_at, notes, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(m.id, m.name, m.offer, m.url, m.status, m.captures, m.destination, m.source, m.launchedAt, m.notes, m.origin ?? 'seed');
    },
    byId(id: string): LeadMagnet | null {
      const r = db.prepare('SELECT * FROM lead_magnets WHERE id = ?').get(id) as any;
      if (!r) return null;
      return LeadMagnetSchema.parse({
        id: r.id, name: r.name, offer: r.offer, url: r.url, status: r.status,
        captures: r.captures, destination: r.destination, source: r.source,
        launchedAt: r.launched_at, notes: r.notes, origin: r.origin ?? 'seed',
      });
    },
    /** Delete one row by id. Returns false when it was not there, so the API
     *  can 404 instead of pretending. */
    remove(id: string): boolean {
      return db.prepare('DELETE FROM lead_magnets WHERE id = ?').run(id).changes > 0;
    },
    /** Prune retired SEED rows only. Anything created from the OS is the operator's
     *  and is never deleted by a re-seed. */
    deleteWhereIdNotIn(ids: string[]): void {
      const placeholders = ids.map(() => '?').join(', ');
      db.prepare(
        `DELETE FROM lead_magnets WHERE origin = 'seed' AND id NOT IN (${placeholders})`,
      ).run(...ids);
    },
  };

  const workflows = {
    all(): Workflow[] {
      return db
        .prepare('SELECT * FROM workflows ORDER BY ord, name')
        .all()
        .map((r: any) =>
          WorkflowSchema.parse({
            id: r.id,
            name: r.name,
            subtitle: r.subtitle,
            revenueUsd: r.revenue_usd,
            order: r.ord,
            steps: JSON.parse(r.steps),
          }),
        );
    },
    /** Single workflow by id, or null when it doesn't exist: the builder's
     *  update/delete routes use this to tell "not found" from a real 500. */
    get(id: string): Workflow | null {
      const r = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as any;
      if (!r) return null;
      return WorkflowSchema.parse({
        id: r.id,
        name: r.name,
        subtitle: r.subtitle,
        revenueUsd: r.revenue_usd,
        order: r.ord,
        steps: JSON.parse(r.steps),
      });
    },
    insert(w: Workflow): void {
      WorkflowSchema.parse(w);
      db.prepare(
        'INSERT OR REPLACE INTO workflows (id, name, subtitle, revenue_usd, ord, steps) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(w.id, w.name, w.subtitle, w.revenueUsd, w.order, JSON.stringify(w.steps));
    },
    /** Deletes one workflow by id: the builder's delete affordance. Distinct
     *  from deleteWhereIdNotIn, which is the seed's bulk reconciliation. */
    remove(id: string): void {
      db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
    },
    deleteWhereIdNotIn(ids: string[]): void {
      // An empty keep-list means "keep nothing": SQL rejects NOT IN ().
      if (ids.length === 0) { db.prepare('DELETE FROM workflows').run(); return; }
      const placeholders = ids.map(() => '?').join(', ');
      db.prepare(`DELETE FROM workflows WHERE id NOT IN (${placeholders})`).run(...ids);
    },
  };

  const skills = {
    all(): Skill[] {
      return db
        .prepare('SELECT * FROM skills ORDER BY ord, name')
        .all()
        .map((r: any) =>
          SkillSchema.parse({
            id: r.id,
            name: r.name,
            category: r.category,
            description: r.description,
            ownerAgentId: r.owner_agent_id,
            status: r.status,
            tools: JSON.parse(r.tools),
            markdown: r.markdown,
            order: r.ord,
          }),
        );
    },
    insert(s: Skill): void {
      SkillSchema.parse(s);
      db.prepare(
        'INSERT OR REPLACE INTO skills (id, name, category, description, owner_agent_id, status, tools, markdown, ord) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(s.id, s.name, s.category, s.description, s.ownerAgentId, s.status, JSON.stringify(s.tools), s.markdown, s.order);
    },
    deleteWhereIdNotIn(ids: string[]): void {
      const placeholders = ids.map(() => '?').join(', ');
      db.prepare(`DELETE FROM skills WHERE id NOT IN (${placeholders})`).run(...ids);
    },
  };

  const rowToFunnelTouch = (r: any): FunnelTouch =>
    FunnelTouchSchema.parse({
      id: r.id,
      contactId: r.contact_id,
      seq: r.seq,
      stage: r.stage,
      channel: r.channel,
      label: r.label,
      source: r.source,
      at: r.at,
    });

  const funnel = {
    insertContact(c: FunnelContact): void {
      FunnelContactSchema.parse(c);
      db.prepare(
        'INSERT OR REPLACE INTO funnel_contacts (id, name, venture, status, product, amount_usd, relationship, likelihood, email, phone, person, company, role, linkedin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(c.id, c.name, c.venture, c.status, c.product, c.amountUsd, c.relationship, c.likelihood, c.email, c.phone, c.person, c.company, c.role, c.linkedin, c.createdAt);
    },
    insertTouch(t: FunnelTouch): void {
      FunnelTouchSchema.parse(t);
      db.prepare(
        'INSERT OR REPLACE INTO funnel_touches (id, contact_id, seq, stage, channel, label, source, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(t.id, t.contactId, t.seq, t.stage, t.channel, t.label, t.source, t.at);
    },
    /** Contacts with their touches in journey order, newest contact first. */
    journeys(venture?: FunnelVenture): FunnelJourney[] {
      const rows = (
        venture
          ? db.prepare('SELECT * FROM funnel_contacts WHERE venture = ? ORDER BY created_at DESC, id').all(venture)
          : db.prepare('SELECT * FROM funnel_contacts ORDER BY created_at DESC, id').all()
      ) as any[];
      const touchStmt = db.prepare('SELECT * FROM funnel_touches WHERE contact_id = ? ORDER BY seq');
      return rows.map((r) =>
        FunnelJourneySchema.parse({
          id: r.id,
          name: r.name,
          venture: r.venture,
          status: r.status,
          product: r.product,
          amountUsd: r.amount_usd,
          relationship: r.relationship,
          likelihood: r.likelihood,
          email: r.email,
          phone: r.phone,
          person: r.person,
          company: r.company,
          role: r.role,
          linkedin: r.linkedin,
          createdAt: r.created_at,
          touches: touchStmt.all(r.id).map(rowToFunnelTouch),
        }),
      );
    },
  };

  // Seat usage pushed from OTHER machines (this box's own seat is computed
  // live by the connector, never stored). Payload is the whole validated
  // snapshot: the shape is owned by lib/usage.ts and re-parsed on the way out.
  const usageSnapshots = {
    upsert(snap: SeatUsage): void {
      db.prepare('INSERT OR REPLACE INTO usage_snapshots (id, captured_at, payload) VALUES (?, ?, ?)').run(
        snap.id,
        snap.capturedAt,
        JSON.stringify(snap),
      );
    },
    all(): SeatUsage[] {
      return (db.prepare('SELECT payload FROM usage_snapshots').all() as { payload: string }[]).map((r) =>
        UsageSnapshotSchema.parse(JSON.parse(r.payload)),
      );
    },
  };

  return {
    meta,
    departments,
    agents,
    tools,
    roadmap,
    metrics,
    domains,
    personas,
    phases,
    agentRuns,
    agentMessages,
    agentTasks,
    agentCrons,
    cronRuns,
    commsDigests,
    plaudIngests,
    digestReads,
    broadcasts,
    contactTags,
    social,
    emailList,
    trading,
    usageSnapshots,
    metricSnapshots,
    socialPosts,
    funnel,
    people,
    sopTasks,
    brandDeals,
    leadMagnets,
    proposals,
    deliverableDecisions,
    workflows,
    skills,
    close: () => db.close(),
  };
}

export type FounderDb = ReturnType<typeof openDb>;
/** Legacy alias kept so existing call sites keep compiling. */
