import type { Workflow } from '@/lib/schemas';

/**
 * The bottom-bar numbers for a workflow: how much human time it burns, how much
 * money leaks at its bottlenecks, and how much the automations carry back
 * (live) or would carry (suggested). Pure + tested so the map stays a renderer.
 */
export type WorkflowStats = {
  manualHours: number; // human step hours / week
  agentHours: number; // agent step hours / week
  leakUsd: number; // $/mo bleeding across all bottleneck steps
  liveReturnsUsd: number; // $/mo recovered by live automations
  suggestedReturnsUsd: number; // $/mo suggested automations would recover
  humanSteps: number;
  agentSteps: number;
  toolCount: number; // distinct tools across all steps
  automationCount: number; // steps carrying an automation
};

export function workflowStats(workflow: Workflow): WorkflowStats {
  const tools = new Set<string>();
  let manualHours = 0;
  let agentHours = 0;
  let leakUsd = 0;
  let liveReturnsUsd = 0;
  let suggestedReturnsUsd = 0;
  let humanSteps = 0;
  let agentSteps = 0;
  let automationCount = 0;

  for (const s of workflow.steps) {
    if (s.ownerKind === 'human') {
      humanSteps += 1;
      manualHours += s.hoursPerWeek;
    } else {
      agentSteps += 1;
      agentHours += s.hoursPerWeek;
    }
    if (s.leakUsd) leakUsd += s.leakUsd;
    for (const t of s.tools) tools.add(t);
    if (s.automation) {
      automationCount += 1;
      if (s.automation.state === 'live') liveReturnsUsd += s.automation.recoveredUsd;
      else suggestedReturnsUsd += s.automation.recoveredUsd;
    }
  }

  return {
    manualHours,
    agentHours,
    leakUsd,
    liveReturnsUsd,
    suggestedReturnsUsd,
    humanSteps,
    agentSteps,
    toolCount: tools.size,
    automationCount,
  };
}
