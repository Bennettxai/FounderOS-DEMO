import type { Agent } from '@/lib/schemas';

/**
 * The research crew: the Research pillar, where the knowledge agent
 * (`data-agent`) and its surf-research + bounty workers live. The lead comes
 * first, then the workers alphabetically.
 */
export const CONTENT_DEPT_ID = 'dept-research';

export function contentAgents(agents: Agent[]): Agent[] {
  const isLead = (a: Agent) => (a.tier === 'lead' || a.parentId === null ? 0 : 1);
  return agents
    .filter((a) => a.departmentId === CONTENT_DEPT_ID)
    .sort((a, b) => isLead(a) - isLead(b) || a.name.localeCompare(b.name));
}
