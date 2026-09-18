import type { FounderDb } from '@/lib/db';
import type { Agent, Department } from '@/lib/schemas';

/**
 * COMPANY FOUNDATION SEED
 *
 * This file contains only authoritative structural data belonging to this
 * company.
 *
 * It must never contain demo data, legacy FounderOS business data, personal
 * data from previous operators, simulated company history or fabricated
 * operational activity.
 *
 * Current responsibilities:
 * - register the three company departments;
 * - register the nineteen AI employees;
 * - preserve the official reporting hierarchy;
 * - define planned capabilities at a high level;
 * - remove retired legacy structural records where the database repository
 *   exposes an authoritative pruning operation.
 *
 * Runtime history, decisions, experiences, portfolio activity, tasks,
 * monitoring records and Startup Brain memories are NOT seed data.
 */

const GRAY = {
  white: '#fafafa',
  light: '#d4d4d4',
  mid: '#a3a3a3',
};

/**
 * The three operating departments of the investment company.
 */
const departments: Department[] = [
  {
    id: 'dept-research',
    name: 'Research Investments',
    slug: 'research-investments',
    tagline:
      'Investment research across equities, ETFs, crypto, macroeconomics and global markets.',
    color: GRAY.white,
    order: 1,
  },
  {
    id: 'dept-risk',
    name: 'Risk Analysis',
    slug: 'risk-analysis',
    tagline:
      'Portfolio risk, trade structuring, execution planning and independent control.',
    color: GRAY.light,
    order: 2,
  },
  {
    id: 'dept-monitoring',
    name: 'Portfolio Monitoring & Performance',
    slug: 'portfolio-monitoring-performance',
    tagline:
      'Portfolio oversight, performance measurement, employee KPI control and organizational learning.',
    color: GRAY.mid,
    order: 3,
  },
];

/**
 * Official AI workforce registry.
 *
 * Every agent starts in "planned" state.
 *
 * "tools" currently represents planned capabilities, not production
 * connections. A capability listed here must not be interpreted as connected
 * or authorized until the Control Plane and connection layer explicitly
 * activate it.
 *
 * All agents are expected to have access, subject to future permissions and
 * governance, to:
 *
 * - startup-brain:
 *   institutional company memory and accumulated experience;
 *
 * - web-research:
 *   external internet research, including public information, publications,
 *   opinions, analysis and third-party experience.
 *
 * External information is evidence, not automatically company knowledge.
 * Agents must evaluate its relevance and reliability before relying on it.
 */
const agents: Agent[] = [
  // ========================================================================
  // RESEARCH INVESTMENTS
  // ========================================================================

  {
    id: 'djed',
    departmentId: 'dept-research',
    name: 'Djed',
    role: 'Macro & Geopolitical Desk',
    status: 'planned',
    tier: 'specialist',
    description:
      'Maintains the global macroeconomic and geopolitical view and supports investment research with analysis of rates, inflation, central banks, currencies, energy, economic cycles and geopolitical risk.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'macro-data',
      'market-data',
      'news',
    ],
    parentId: 'beppe',
    instance: 'builtin',
  },

  {
    id: 'marcus',
    departmentId: 'dept-research',
    name: 'Marcus',
    role: 'Market News Desk',
    status: 'planned',
    tier: 'specialist',
    description:
      'Monitors company, sector and market news, M&A, regulation, catalysts and material events and provides timely information to the investment research team.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'news',
      'market-data',
    ],
    parentId: 'beppe',
    instance: 'builtin',
  },

  {
    id: 'lauti',
    departmentId: 'dept-research',
    name: 'Lauti',
    role: 'Equity Research Desk',
    status: 'planned',
    tier: 'worker',
    description:
      'Researches listed equities using fundamental, financial, competitive, valuation and technical analysis and produces investment proposals when conviction is sufficient.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'market-data',
      'financial-statements',
      'company-filings',
    ],
    parentId: 'beppe',
    instance: 'builtin',
  },

  {
    id: 'pepo',
    departmentId: 'dept-research',
    name: 'Pepo',
    role: 'Crypto Research Desk',
    status: 'planned',
    tier: 'worker',
    description:
      'Researches cryptocurrencies and digital assets using market structure, tokenomics, protocol fundamentals, liquidity, regulation, adoption and security analysis.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'market-data',
      'crypto-data',
      'news',
    ],
    parentId: 'beppe',
    instance: 'builtin',
  },

  {
    id: 'andy',
    departmentId: 'dept-research',
    name: 'Andy',
    role: 'ETF Research Desk',
    status: 'planned',
    tier: 'worker',
    description:
      'Researches ETFs through index methodology, holdings, exposure, costs, tracking quality, concentration, liquidity, structure and market analysis.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'market-data',
      'etf-data',
    ],
    parentId: 'beppe',
    instance: 'builtin',
  },

  {
    id: 'yann',
    departmentId: 'dept-research',
    name: 'Yann',
    role: 'Red Desk',
    status: 'planned',
    tier: 'specialist',
    description:
      'Independently challenges investment proposals by searching for material weaknesses, unsupported assumptions, contradictory evidence, alternative interpretations and overlooked risks.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'market-data',
      'news',
    ],
    parentId: 'beppe',
    instance: 'builtin',
  },

  {
    id: 'beppe',
    departmentId: 'dept-research',
    name: 'Beppe',
    role: 'Final Research Supervisor',
    status: 'planned',
    tier: 'lead',
    description:
      'Final supervisor of the Research Investments Team. Integrates the work of the research desks, ensures proposals meet company standards and acts as the team’s official interface with the CEO.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'proposal-registry',
    ],
    parentId: null,
    instance: 'builtin',
  },

  // ========================================================================
  // RISK ANALYSIS
  // ========================================================================

  {
    id: 'manuel',
    departmentId: 'dept-risk',
    name: 'Manuel',
    role: 'Portfolio Risk Manager',
    status: 'planned',
    tier: 'worker',
    description:
      'Evaluates portfolio-level sustainability, concentration, correlations, diversification, liquidity, drawdown implications and the amount of capital that can responsibly be allocated to a proposed operation.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'portfolio-data',
      'market-data',
    ],
    parentId: 'christian',
    instance: 'builtin',
  },

  {
    id: 'dimash',
    departmentId: 'dept-risk',
    name: 'Dimash',
    role: 'Trade Structuring Analyst',
    status: 'planned',
    tier: 'worker',
    description:
      'Transforms CEO-approved investment ideas into concrete proposed structures covering entry, order type, sizing, stop loss, profit targets, duration, invalidation and risk-reward.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'market-data',
      'portfolio-data',
    ],
    parentId: 'christian',
    instance: 'builtin',
  },

  {
    id: 'bare',
    departmentId: 'dept-risk',
    name: 'Bare',
    role: 'Liquidity & Event Risk Analyst',
    status: 'planned',
    tier: 'worker',
    description:
      'Evaluates spread, market depth, liquidity, expected execution quality, volatility conditions and material event risks before an operation can proceed.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'market-data',
      'event-calendar',
      'news',
    ],
    parentId: 'christian',
    instance: 'builtin',
  },

  {
    id: 'angelo',
    departmentId: 'dept-risk',
    name: 'Angelo',
    role: 'Broker Execution Specialist',
    status: 'planned',
    tier: 'worker',
    description:
      'Converts an approved financial plan into precise broker-neutral manual execution instructions for the CEO without receiving authority to execute financial transactions.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'instrument-reference',
      'market-data',
    ],
    parentId: 'christian',
    instance: 'builtin',
  },

  {
    id: 'pio',
    departmentId: 'dept-risk',
    name: 'Pio',
    role: 'Independent Risk Controller',
    status: 'planned',
    tier: 'specialist',
    description:
      'Independently reviews calculations, assumptions, sources, portfolio constraints, liquidity, event risks and trade structure before the Risk Team can issue its final verdict.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'market-data',
      'portfolio-data',
      'event-calendar',
    ],
    parentId: 'christian',
    instance: 'builtin',
  },

  {
    id: 'christian',
    departmentId: 'dept-risk',
    name: 'Christian',
    role: 'Final Risk Supervisor',
    status: 'planned',
    tier: 'lead',
    description:
      'Final supervisor of the Risk Analysis Team. Integrates independent risk work, validates the final risk ticket and acts as the team’s official interface with the CEO.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'trade-ticket-registry',
      'portfolio-data',
    ],
    parentId: null,
    instance: 'builtin',
  },

  // ========================================================================
  // PORTFOLIO MONITORING & PERFORMANCE
  // ========================================================================

  {
    id: 'john',
    departmentId: 'dept-monitoring',
    name: 'John',
    role: 'Position Monitoring Desk',
    status: 'planned',
    tier: 'worker',
    description:
      'Monitors open positions against market conditions, material news, technical developments, thesis validity, invalidation criteria and the original approved trade ticket.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'market-data',
      'portfolio-data',
      'news',
    ],
    parentId: 'javier',
    instance: 'builtin',
  },

  {
    id: 'ale',
    departmentId: 'dept-monitoring',
    name: 'Ale',
    role: 'Portfolio Exposure & Event Watch',
    status: 'planned',
    tier: 'worker',
    description:
      'Monitors portfolio exposure, concentration, correlations, diversification, drawdown, liquidity and the unified calendar of events that may materially affect the portfolio.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'portfolio-data',
      'market-data',
      'event-calendar',
      'news',
    ],
    parentId: 'javier',
    instance: 'builtin',
  },

  {
    id: 'carlos',
    departmentId: 'dept-monitoring',
    name: 'Carlos',
    role: 'Performance Analytics Desk',
    status: 'planned',
    tier: 'worker',
    description:
      'Measures investment proposal, trade and portfolio outcomes against expectations, benchmarks, risk taken, execution costs and relevant decision context.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'portfolio-data',
      'performance-data',
      'market-data',
    ],
    parentId: 'javier',
    instance: 'builtin',
  },

  {
    id: 'hakan',
    departmentId: 'dept-monitoring',
    name: 'Hakan',
    role: 'Employee KPI & Audit Desk',
    status: 'planned',
    tier: 'worker',
    description:
      'Evaluates each AI employee using role-specific scorecards covering analytical quality, compliance, source quality, timeliness, collaboration, errors and process performance.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'agent-logs',
      'performance-data',
    ],
    parentId: 'javier',
    instance: 'builtin',
  },

  {
    id: 'zielu',
    departmentId: 'dept-monitoring',
    name: 'Zielu',
    role: 'Learning & Process Improvement Desk',
    status: 'planned',
    tier: 'worker',
    description:
      'Performs post-mortems, identifies recurring success and failure patterns and proposes evidence-based, tested and versioned improvements to procedures, prompts, tools, sources and collaboration methods.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'agent-logs',
      'performance-data',
    ],
    parentId: 'javier',
    instance: 'builtin',
  },

  {
    id: 'javier',
    departmentId: 'dept-monitoring',
    name: 'Javier',
    role: 'Final Monitoring Supervisor',
    status: 'planned',
    tier: 'lead',
    description:
      'Final supervisor of Portfolio Monitoring & Performance. Integrates monitoring, performance, KPI and learning work and acts as the team’s official interface with the CEO.',
    model: 'unassigned',
    tools: [
      'startup-brain',
      'web-research',
      'portfolio-data',
      'agent-logs',
      'performance-data',
    ],
    parentId: null,
    instance: 'builtin',
  },
];

/**
 * Seed the authoritative structural foundation of the company.
 *
 * Ordering matters:
 *
 * 1. Current departments must exist before current agents are inserted.
 * 2. Legacy records with department foreign keys are removed before obsolete
 *    departments are deleted.
 * 3. Legacy agents are removed before obsolete departments are removed.
 *
 * Runtime and historical company data are intentionally not fabricated here.
 */
export function seedDatabase(db: FounderDb): void {
  // ----------------------------------------------------------------------
  // 1. Register the current organizational structure.
  // ----------------------------------------------------------------------

  for (const department of departments) {
    db.departments.insert(department);
  }

  for (const agent of agents) {
    db.agents.insert(agent);
  }

  // ----------------------------------------------------------------------
  // 2. Remove legacy seeded structural/business content.
  //
  // These repositories expose safe authoritative pruning operations.
  // No replacement demo data is inserted.
  // ----------------------------------------------------------------------

  db.workflows.deleteWhereIdNotIn([]);
  db.skills.deleteWhereIdNotIn([]);

  // ----------------------------------------------------------------------
  // 3. Remove obsolete workforce records.
  // ----------------------------------------------------------------------

  db.agents.deleteWhereIdNotIn(
    agents.map((agent) => agent.id),
  );

  db.departments.deleteWhereIdNotIn(
    departments.map((department) => department.id),
  );

  // ----------------------------------------------------------------------
  // IMPORTANT
  //
  // The seed deliberately does not create or fabricate:
  //
  // - portfolio history
  // - trades
  // - investment proposals
  // - risk tickets
  // - monitoring events
  // - performance results
  // - agent runs
  // - agent conversations
  // - tasks
  // - cron jobs
  // - broadcasts
  // - company experiences
  // - company decisions
  // - lessons
  // - Startup Brain memories
  // - external connections
  // - market history
  //
  // Those belong to runtime systems and must be created only by real company
  // activity.
  // ----------------------------------------------------------------------
}