import type { Agent, Department } from '@/lib/schemas';

export type AgentNode = {
  agent: Agent;
  children: AgentNode[];
};

export type DepartmentNode = {
  department: Department;
  roots: AgentNode[];
};

export type Hierarchy = {
  departments: DepartmentNode[];
  totalAgents: number;
  activeAgents: number;
};

const TIER_ORDER: Record<Agent['tier'], number> = { lead: 0, specialist: 1, worker: 2 };

function buildNodes(agents: Agent[]): AgentNode[] {
  const ids = new Set(agents.map((a) => a.id));
  const sorted = [...agents].sort(
    (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.name.localeCompare(b.name),
  );
  const childrenOf = (parentId: string | null): AgentNode[] =>
    sorted
      // An agent whose parent left the roster surfaces at the root rather than vanishing
      .filter((a) => (a.parentId !== null && ids.has(a.parentId) ? a.parentId : null) === parentId)
      .map((agent) => ({ agent, children: childrenOf(agent.id) }));
  return childrenOf(null);
}

export function flattenNodes(nodes: AgentNode[]): AgentNode[] {
  return nodes.flatMap((n) => [n, ...flattenNodes(n.children)]);
}

/**
 * Shapes the flat departments/agents tables into the org tree:
 * operator → department → instance agents → worker sub-agents (via parentId).
 */
export function buildHierarchy(departments: Department[], agents: Agent[]): Hierarchy {
  const nodes = [...departments]
    .sort((a, b) => a.order - b.order)
    .map((department) => ({
      department,
      roots: buildNodes(agents.filter((a) => a.departmentId === department.id)),
    }));

  return {
    departments: nodes,
    totalAgents: agents.length,
    activeAgents: agents.filter((a) => a.status === 'active').length,
  };
}
