import {
  Bot,
  Brain,
  Network,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { Badge, Dot, SectionHead } from '@/components/terminal';
import type { Agent, Department } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

function statusLabel(status: Agent['status']) {
  switch (status) {
    case 'active':
      return 'Production';
    case 'idle':
      return 'Idle';
    case 'training':
      return 'Training';
    case 'planned':
      return 'Planned';
    default:
      return status;
  }
}

function tierLabel(tier: Agent['tier']) {
  switch (tier) {
    case 'lead':
      return 'Supervisor';
    case 'specialist':
      return 'Specialist';
    case 'worker':
      return 'Worker';
    default:
      return tier;
  }
}

function AgentCard({
  agent,
  department,
  parent,
}: {
  agent: Agent;
  department: Department;
  parent: Agent | null;
}) {
  const active = agent.status === 'active';

  const hasAssignedModel =
    agent.model &&
    agent.model !== 'unassigned';

  const hasRuntime =
    agent.instance &&
    agent.instance !== 'builtin';

  return (
    <article
      className="flex min-h-[300px] flex-col rounded-lg-t border bg-os-surface p-5"
      style={{
        borderColor: active
          ? 'color-mix(in oklab, var(--accent) 35%, var(--border))'
          : 'var(--border)',
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Dot
              state={agent.status}
              pulse={active}
            />

            <h3 className="truncate text-[15px] font-bold">
              {agent.name}
            </h3>
          </div>

          <div className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-os-dim">
            {agent.role}
          </div>
        </div>

        <Badge>
          {tierLabel(agent.tier)}
        </Badge>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-os-muted">
        {agent.description}
      </p>

      <div className="mt-5 space-y-3 border-t border-os-border pt-4">
        <div className="flex items-center gap-2 text-xs">
          <Network className="h-3.5 w-3.5 shrink-0 text-os-dim" />

          <span className="text-os-dim">
            Department:
          </span>

          <span className="text-os-muted">
            {department.name}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-os-dim" />

          <span className="text-os-dim">
            Reports to:
          </span>

          <span className="text-os-muted">
            {parent
              ? parent.name
              : 'Human CEO'}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Brain className="h-3.5 w-3.5 shrink-0 text-os-dim" />

          <span className="text-os-dim">
            Model:
          </span>

          <span className="text-os-muted">
            {hasAssignedModel
              ? agent.model
              : 'Not assigned'}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Bot className="h-3.5 w-3.5 shrink-0 text-os-dim" />

          <span className="text-os-dim">
            Runtime:
          </span>

          <span className="text-os-muted">
            {hasRuntime
              ? agent.instance
              : 'Not connected'}
          </span>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center gap-2">
          <Wrench className="h-3.5 w-3.5 text-os-dim" />

          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">
            Planned capabilities
          </span>
        </div>

        {agent.tools.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {agent.tools.map((tool) => (
              <span
                key={tool}
                className="rounded-sm-t border border-os-border bg-os-surface2 px-2 py-1 font-mono text-[9.5px] text-os-muted"
              >
                {tool}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-xs text-os-dim">
            No capabilities registered yet.
          </div>
        )}
      </div>

      <div className="mt-auto pt-5">
        <div className="flex items-center justify-between border-t border-os-border pt-3 font-mono text-[10px]">
          <span className="text-os-dim">
            Agent ID: {agent.id}
          </span>

          <span
            className={
              active
                ? 'uppercase tracking-wider text-os-accent'
                : 'uppercase tracking-wider text-os-dim'
            }
          >
            {statusLabel(agent.status)}
          </span>
        </div>
      </div>
    </article>
  );
}

function DepartmentOverview({
  department,
  agents,
}: {
  department: Department;
  agents: Agent[];
}) {
  const supervisor =
    agents.find((agent) => agent.tier === 'lead') ?? null;

  return (
    <div className="rounded-lg-t border border-os-border bg-os-surface p-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
        {department.name}
      </div>

      <div className="mt-2 text-2xl font-semibold">
        {agents.length}
      </div>

      <div className="mt-1 text-xs text-os-dim">
        registered agents
      </div>

      <div className="mt-4 border-t border-os-border pt-3">
        <div className="text-xs text-os-dim">
          Supervisor
        </div>

        <div className="mt-1 text-sm font-medium text-os-muted">
          {supervisor
            ? supervisor.name
            : 'Not assigned'}
        </div>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const db = getDb();

  const departments = db.departments
    .all()
    .sort((a, b) => a.order - b.order);

  const agents = db.agents.all();

  const agentsById = new Map(
    agents.map((agent) => [agent.id, agent]),
  );

  const activeAgents = agents.filter(
    (agent) => agent.status === 'active',
  ).length;

  const plannedAgents = agents.filter(
    (agent) => agent.status === 'planned',
  ).length;

  const supervisors = agents.filter(
    (agent) => agent.tier === 'lead',
  ).length;

  return (
    <div>
      <PageHeader
        eyebrow="company workforce"
        title="Agents"
      />

      <div className="mb-8 max-w-4xl">
        <p className="text-sm leading-relaxed text-os-muted">
          This is the official registry of the company&apos;s AI workforce.
        </p>

        <p className="mt-2 text-sm leading-relaxed text-os-dim">
          Agents may be registered before their models, runtime environments,
          tools and external data connections are activated.
        </p>
      </div>

      <section className="mb-8 grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2 max-[700px]:grid-cols-1">
        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Registered agents
          </div>

          <div className="mt-2 text-2xl font-semibold">
            {agents.length}
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Production agents
          </div>

          <div className="mt-2 text-2xl font-semibold">
            {activeAgents}
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Planned agents
          </div>

          <div className="mt-2 text-2xl font-semibold">
            {plannedAgents}
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Supervisors
          </div>

          <div className="mt-2 text-2xl font-semibold">
            {supervisors}
          </div>
        </div>
      </section>

      <section className="mb-10">
        <SectionHead
          label="Department overview"
          count={`${departments.length} departments`}
        />

        <div className="grid grid-cols-3 gap-3 max-[1000px]:grid-cols-1">
          {departments.map((department) => {
            const departmentAgents = agents.filter(
              (agent) =>
                agent.departmentId === department.id,
            );

            return (
              <DepartmentOverview
                key={department.id}
                department={department}
                agents={departmentAgents}
              />
            );
          })}
        </div>
      </section>

      <div className="space-y-10">
        {departments.map((department) => {
          const departmentAgents = agents.filter(
            (agent) =>
              agent.departmentId === department.id,
          );

          if (departmentAgents.length === 0) {
            return null;
          }

          const orderedAgents = [
            ...departmentAgents.filter(
              (agent) => agent.tier === 'lead',
            ),
            ...departmentAgents.filter(
              (agent) => agent.tier !== 'lead',
            ),
          ];

          return (
            <section key={department.id}>
              <SectionHead
                label={department.name}
                count={`${departmentAgents.length} agents`}
              />

              <div className="-mt-1 mb-4 max-w-3xl text-[11.5px] leading-relaxed text-os-dim">
                {department.tagline}
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {orderedAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    department={department}
                    parent={
                      agent.parentId
                        ? agentsById.get(agent.parentId) ?? null
                        : null
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-10 rounded-lg-t border border-dashed border-os-border p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
          Workforce state
        </div>

        <p className="mt-2 text-sm leading-relaxed text-os-muted">
          Agent identities and reporting lines are registered.
        </p>

        <p className="mt-1 text-sm leading-relaxed text-os-dim">
          Production runtimes, model assignments, internet access, external
          data sources, Startup Brain access and operational permissions will
          be connected progressively.
        </p>
      </section>
    </div>
  );
}