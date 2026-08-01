import type { Agent } from '@/lib/schemas';

/**
 * The content-creation crew: the Marketing/Growth pillar, where the content
 * agent (`social-agent`) and its Zernio publisher + creative workers live. The
 * lead comes first, then the workers alphabetically.
 */
export const CONTENT_DEPT_ID = 'dept-marketing-growth';

export function contentAgents(agents: Agent[]): Agent[] {
  const isLead = (a: Agent) => (a.tier === 'lead' || a.parentId === null ? 0 : 1);
  return agents
    .filter((a) => a.departmentId === CONTENT_DEPT_ID)
    .sort((a, b) => isLead(a) - isLead(b) || a.name.localeCompare(b.name));
}
