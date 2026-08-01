import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { AgentChat } from '@/components/AgentChat';
import { ConductorChat } from '@/components/ConductorChat';
import { AgentActivityFeed } from '@/components/AgentActivityFeed';
import { AgentWorkPanel } from '@/components/AgentWorkPanel';
import { recentActivity } from '@/lib/agents/activity';
import { SparkIcon } from '@/components/SparkIcon';
import { Badge, Dot, Label, SectionHead } from '@/components/terminal';
import { lifeAreaForDepartment } from '@/lib/life-map';
import type { Agent, AgentCron, AgentMessage, AgentRun, AgentTask } from '@/lib/schemas';

/** Perceived brightness 0–1 of a #rrggbb color (for the white guard below). */
function brightness(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/**
 * The Conductor (super agent) reads black/white via the theme; every other
 * agent's emblem takes its department's life-area color (sales / marketing /
 * knowledge / finances / communication). Near-white area tints (Operations)
 * fall back to the theme text color so emblems stay visible on the light theme.
 */
function emblemShade(agent: Agent): string {
  if (agent.id === 'conductor') return 'var(--text)';
  const color = lifeAreaForDepartment(agent.departmentId)?.color;
  if (!color || brightness(color) > 0.85) return 'var(--text)';
  return color;
}

export const dynamic = 'force-dynamic';

function AgentRosterCard({
  agent,
  parent,
  lastRun,
  tasks,
  crons,
  messages,
}: {
  agent: Agent;
  parent: Agent | null;
  lastRun: AgentRun | undefined;
  tasks: AgentTask[];
  crons: AgentCron[];
  messages: AgentMessage[];
}) {
  const active = agent.status === 'active';
  return (
    <article
      className="hoverable group flex min-h-48 flex-col rounded-lg-t border bg-os-surface p-4"
      style={{ borderColor: active ? 'color-mix(in oklab, var(--accent) 35%, var(--border))' : 'var(--border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <SparkIcon size={14} shade={emblemShade(agent)} />
            <Dot state={agent.status} pulse={active} />
            <h3 className="truncate text-[14.5px] font-bold">{agent.name}</h3>
          </div>
          <div className="mt-1 truncate font-mono text-[10.5px] text-os-dim">{agent.role}</div>
        </div>
        <Badge>{agent.tier}</Badge>
      </div>

      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-os-muted [text-wrap:pretty]">{agent.description}</p>

      <div className="mt-3 flex flex-wrap gap-1">
        {agent.tools.slice(0, 5).map((tool) => (
          <span
            key={tool}
            className="whitespace-nowrap rounded-sm-t border border-os-border bg-os-surface2 px-[7px] py-0.5 font-mono text-[9.5px] text-os-muted"
          >
            {tool}
          </span>
        ))}
        {agent.tools.length > 5 && (
          <span className="rounded-sm-t border border-os-border bg-os-surface2 px-[7px] py-0.5 font-mono text-[9.5px] text-os-dim">
            +{agent.tools.length - 5}
          </span>
        )}
      </div>

      <div className="mt-auto pt-4">
        <div className="mb-3 flex items-center justify-between gap-3 font-mono text-[10px] text-os-dim">
          <span className="truncate">{parent ? `under ${parent.name}` : `instance ${agent.instance}`}</span>
          <span className="shrink-0 uppercase tracking-wider">{agent.status}</span>
        </div>
        {lastRun && (
          <div className="flex items-baseline gap-1.5 font-mono text-[10px] leading-snug text-os-dim">
            <span className={`font-bold ${lastRun.ok ? 'text-os-ok' : 'text-os-err'}`}>
              {lastRun.ok ? 'OK' : 'FAIL'}
            </span>
            <span className="truncate" title={lastRun.summary}>
              last check: {lastRun.summary.slice(0, 56)}
            </span>
          </div>
        )}
        <AgentChat agentId={agent.id} agentName={agent.name} initialMessages={messages} />
        <AgentWorkPanel agentId={agent.id} initialTasks={tasks} initialCrons={crons} />
      </div>
    </article>
  );
}

export default function AgentsPage() {
  const db = getDb();
  const departments = db.departments.all();
  const agents = db.agents.all();
  const agentsById = new Map(agents.map((a) => [a.id, a]));
  const agentNames = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  const activity = recentActivity(db, 40);
  const totalRuns = db.agentRuns.recent(1000).length;
  const allTasks = db.agentTasks.all();
  const allCrons = db.agentCrons.all();
  const openTasks = allTasks.filter((t) => t.status !== 'done').length;

  return (
    <div>
      <PageHeader
        eyebrow="runtime"
        title="Real Agents"
      />

      <div className="mb-6">
        <ConductorChat agentNames={agentNames} />
      </div>

      <div className="mb-6 grid grid-cols-5 gap-3 max-[1100px]:grid-cols-2">
        {[
          ['Total', agents.length],
          ['Active', agents.filter((a) => a.status === 'active').length],
          ['Open tasks', openTasks],
          ['Cron jobs', allCrons.length],
          ['Runs', totalRuns],
        ].map(([label, value]) => (
          <div key={label} className="hoverable flex flex-col gap-1.5 rounded-lg-t border border-os-border bg-os-surface px-4 py-3">
            <Label>{label}</Label>
            <div className="font-mono text-[26px] font-semibold tracking-[-0.02em]">{value}</div>
          </div>
        ))}
      </div>

      <div className="mb-8">
        <AgentActivityFeed initialEvents={activity} agentNames={agentNames} />
      </div>

      <div className="space-y-8">
        {departments.map((dept) => {
          const deptAgents = agents.filter((a) => a.departmentId === dept.id);
          if (deptAgents.length === 0) return null;
          return (
            <section key={dept.id}>
              <SectionHead label={dept.name} count={`${deptAgents.length} agents`} />
              <div className="-mt-1 mb-3 text-[11.5px] text-os-dim">{dept.tagline}</div>
              <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 ultra:grid-cols-5">
                {deptAgents.map((agent) => (
                  <AgentRosterCard
                    key={agent.id}
                    agent={agent}
                    parent={agent.parentId ? agentsById.get(agent.parentId) ?? null : null}
                    lastRun={db.agentRuns.byAgent(agent.id)[0]}
                    tasks={allTasks.filter((t) => t.agentId === agent.id)}
                    crons={allCrons.filter((c) => c.agentId === agent.id)}
                    messages={db.agentMessages.byAgent(agent.id)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
