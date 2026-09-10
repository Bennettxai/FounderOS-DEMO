import { Users } from 'lucide-react';
import { getDb } from '@/lib/data';
import { buildHierarchy, type AgentNode } from '@/lib/hierarchy';
import { PageHeader } from '@/components/PageHeader';
import type { Agent, AgentStatus } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

const STATUS_DOT: Record<AgentStatus, string> = {
  active: 'bg-os-text',
  idle: 'bg-os-muted',
  training: 'bg-os-muted animate-pulse',
  planned: 'border border-os-dim bg-transparent',
};

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div className="rounded-xl border border-os-border bg-os-bg px-3 py-2">
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[agent.status]}`}
        />

        <div className="min-w-0">
          <div className="text-xs font-semibold">{agent.name}</div>
          <div className="text-[10px] text-os-muted">{agent.role}</div>
        </div>
      </div>
    </div>
  );
}

function AgentTree({
  node,
  depth = 0,
}: {
  node: AgentNode;
  depth?: number;
}) {
  return (
    <div
      className="space-y-2"
      style={{
        marginLeft: depth > 0 ? `${depth * 12}px` : undefined,
      }}
    >
      <AgentCard agent={node.agent} />

      {node.children.length > 0 && (
        <div className="space-y-2 border-l border-os-border pl-3">
          {node.children.map((child) => (
            <AgentTree
              key={child.agent.id}
              node={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgChartPage() {
  const db = getDb();

  const departments = db.departments.all();
  const agents = db.agents.all();

  const tree = buildHierarchy(departments, agents);

  return (
    <div>
      <PageHeader title="Company Organization" />

      <div className="flex flex-col items-center">
        <Users className="h-8 w-8 text-os-text" />

        <div className="mt-2 text-lg font-bold tracking-wide">
          Piter
        </div>

        <div className="text-[10px] uppercase tracking-[0.3em] text-os-dim">
          Human CEO
        </div>

        <div className="mt-3 text-center text-[11px] text-os-muted">
          Ultimate company authority and exclusive financial execution authority
        </div>

        <div className="mt-4 h-8 w-px bg-os-border-bright" />
      </div>

      <div className="overflow-x-auto pb-6">
        <div className="mx-auto grid min-w-[900px] max-w-7xl grid-cols-3 gap-6">
          {tree.departments.map(({ department, roots }) => (
            <section
              key={department.id}
              className="rounded-2xl border border-os-border bg-os-surface p-5"
            >
              <div className="mb-1 text-center text-sm font-bold">
                {department.name}
              </div>

              <div className="mb-5 text-center text-[10px] leading-relaxed text-os-muted">
                {department.tagline}
              </div>

              <div className="space-y-3">
                {roots.map((root) => (
                  <AgentTree key={root.agent.id} node={root} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-os-border bg-os-surface p-4">
        <div className="text-[10px] uppercase tracking-[0.2em] text-os-dim">
          Company status
        </div>

        <div className="mt-2 text-xs text-os-muted">
          {tree.totalAgents} AI employees registered · {tree.activeAgents} production runtimes active
        </div>
      </div>
    </div>
  );
}
