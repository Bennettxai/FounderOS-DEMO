import { describe, it, expect } from 'vitest';
import { workflowStats } from '@/lib/workflow-stats';
import type { Workflow } from '@/lib/schemas';

const wf: Workflow = {
  id: 'w',
  name: 'W',
  subtitle: '',
  revenueUsd: 100_000,
  order: 0,
  steps: [
    { id: 's1', title: 'A', ownerKind: 'human', owner: 'Alex', hoursPerWeek: 10, tools: ['attio', 'gmail'], edgeLabel: 'x', leakUsd: 14_000, automation: null },
    { id: 's2', title: 'B', ownerKind: 'agent', owner: 'Bot', hoursPerWeek: 6, tools: ['attio', 'zernio'], edgeLabel: null, leakUsd: null, automation: { title: 'Auto', state: 'live', recoveredUsd: 4000 } },
    { id: 's3', title: 'C', ownerKind: 'human', owner: 'Alex', hoursPerWeek: 5, tools: ['gmail'], edgeLabel: null, leakUsd: 6000, automation: { title: 'Sug', state: 'suggested', recoveredUsd: 6000 } },
  ],
};

describe('workflowStats', () => {
  it('sums manual (human) vs agent hours per week', () => {
    const s = workflowStats(wf);
    expect(s.manualHours).toBe(15);
    expect(s.agentHours).toBe(6);
  });

  it('sums leaks and splits automation returns by live vs suggested', () => {
    const s = workflowStats(wf);
    expect(s.leakUsd).toBe(20_000);
    expect(s.liveReturnsUsd).toBe(4000);
    expect(s.suggestedReturnsUsd).toBe(6000);
  });

  it('counts humans, agents, distinct tools, and automations', () => {
    const s = workflowStats(wf);
    expect(s.humanSteps).toBe(2);
    expect(s.agentSteps).toBe(1);
    expect(s.toolCount).toBe(3); // attio, gmail, zernio deduped
    expect(s.automationCount).toBe(2);
  });

  it('is all-zero for an empty workflow', () => {
    const s = workflowStats({ ...wf, steps: [] });
    expect(s).toMatchObject({ manualHours: 0, agentHours: 0, leakUsd: 0, toolCount: 0, automationCount: 0 });
  });
});
