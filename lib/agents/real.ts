import type { AgentRunResult, RuntimeAgent } from '@/lib/agents/runtime';

function plannedAgentRun(name: string, role: string) {
  return async (): Promise<AgentRunResult> => ({
    ok: false,
    summary: `${name} (${role}) is registered in the company but its production runtime is not connected yet.`,
  });
}

function createPlannedAgent(
  id: string,
  name: string,
  description: string,
  departmentId: string,
): RuntimeAgent {
  return {
    id,
    name,
    description,
    departmentId,
    run: plannedAgentRun(name, description),
  };
}

export const realAgents: RuntimeAgent[] = [
  // Research Investments
  createPlannedAgent(
    'djed',
    'Djed',
    'Macro & Geopolitical Desk',
    'dept-research',
  ),

  createPlannedAgent(
    'marcus',
    'Marcus',
    'Market News Desk',
    'dept-research',
  ),

  createPlannedAgent(
    'lauti',
    'Lauti',
    'Equity Research Desk',
    'dept-research',
  ),

  createPlannedAgent(
    'pepo',
    'Pepo',
    'Crypto Research Desk',
    'dept-research',
  ),

  createPlannedAgent(
    'andy',
    'Andy',
    'ETF Research Desk',
    'dept-research',
  ),

  createPlannedAgent(
    'yann',
    'Yann',
    'Red Desk',
    'dept-research',
  ),

  createPlannedAgent(
    'beppe',
    'Beppe',
    'Final Research Supervisor',
    'dept-research',
  ),

  // Risk Analysis
  createPlannedAgent(
    'manuel',
    'Manuel',
    'Portfolio Risk Manager',
    'dept-risk',
  ),

  createPlannedAgent(
    'dimash',
    'Dimash',
    'Trade Structuring Analyst',
    'dept-risk',
  ),

  createPlannedAgent(
    'bare',
    'Bare',
    'Liquidity and Event Risk Analyst',
    'dept-risk',
  ),

  createPlannedAgent(
    'angelo',
    'Angelo',
    'Broker Execution Specialist',
    'dept-risk',
  ),

  createPlannedAgent(
    'pio',
    'Pio',
    'Independent Risk Controller',
    'dept-risk',
  ),

  createPlannedAgent(
    'christian',
    'Christian',
    'Final Risk Supervisor',
    'dept-risk',
  ),

  // Portfolio Monitoring & Performance
  createPlannedAgent(
    'john',
    'John',
    'Position Monitoring Desk',
    'dept-monitoring',
  ),

  createPlannedAgent(
    'ale',
    'Ale',
    'Portfolio Exposure and Event Watch',
    'dept-monitoring',
  ),

  createPlannedAgent(
    'carlos',
    'Carlos',
    'Performance Analytics Desk',
    'dept-monitoring',
  ),

  createPlannedAgent(
    'hakan',
    'Hakan',
    'Employee KPI and Audit Desk',
    'dept-monitoring',
  ),

  createPlannedAgent(
    'zielu',
    'Zielu',
    'Learning and Process Improvement Desk',
    'dept-monitoring',
  ),

  createPlannedAgent(
    'javier',
    'Javier',
    'Final Monitoring Supervisor',
    'dept-monitoring',
  ),
];
