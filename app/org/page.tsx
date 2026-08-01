import Link from 'next/link';
import { Users } from 'lucide-react';
import { getDb } from '@/lib/data';
import { buildHierarchy, flattenNodes, type AgentNode } from '@/lib/hierarchy';
import { LIFE_AREAS, lifeAreaForDepartment } from '@/lib/life-map';
import { VENTURES, getVenture, ventureAgentSet, venturesForAgent } from '@/lib/ventures';
import { ConductorCard } from '@/components/ConductorCard';
import { SparkIcon } from '@/components/SparkIcon';
import { PageHeader } from '@/components/PageHeader';
import type { Agent, AgentStatus } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

const STATUS_DOT: Record<AgentStatus, string> = {
  active: 'bg-os-text',
  idle: 'bg-os-muted',
  training: 'bg-os-muted animate-pulse',
  planned: 'border border-os-dim bg-transparent',
};

/** Tiny colored dots showing which ventures an agent serves. */
function VentureDots({ agentId }: { agentId: string }) {
  const serving = venturesForAgent(agentId);
  if (serving.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {serving.map((v) => (
        <span key={v.id} title={v.label} className="h-1 w-1 rounded-full" style={{ background: v.color }} />
      ))}
    </span>
  );
}

/** Small black task pill, FounderOS-board style. */
function AgentPill({ agent, dim = false }: { agent: Agent; dim?: boolean }) {
  return (
    <div
      title={`${agent.role} — ${agent.description}`}
      className={`hoverable flex items-center gap-1.5 rounded-full border border-os-border bg-os-bg px-2.5 py-1.5 ${dim ? 'opacity-20' : ''}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[agent.status]}`} />
      <span className="truncate text-[10px] font-medium">{agent.name}</span>
      <VentureDots agentId={agent.id} />
    </div>
  );
}

function AgentNodePill({
  node,
  depth = 0,
  dimFor,
}: {
  node: AgentNode;
  depth?: number;
  dimFor?: (id: string) => boolean;
}) {
  return (
    <div className="space-y-1.5" style={{ paddingLeft: depth ? `${depth * 10}px` : undefined }}>
      <AgentPill agent={node.agent} dim={dimFor?.(node.agent.id) ?? false} />
      {node.children.map((child) => (
        <AgentNodePill key={child.agent.id} node={child} depth={depth + 1} dimFor={dimFor} />
      ))}
    </div>
  );
}

/** A flanking system card next to the AI Head, linked to its view. */
function SystemCard({ href, title, caption }: { href: string; title: string; caption: string }) {
  return (
    <Link
      href={href}
      className="hoverable group block w-44 rounded-xl border border-os-border bg-os-surface p-3 text-center"
    >
      <div className="flex justify-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-os-border-bright bg-os-bg">
          <SparkIcon size={20} shade="#a3a3a3" />
        </div>
      </div>
      <div className="mt-1.5 text-xs font-bold">{title}</div>
      <div className="text-[10px] leading-snug text-os-dim">{caption}</div>
    </Link>
  );
}

export default function OrgChartPage({ searchParams }: { searchParams?: { venture?: string } }) {
  const db = getDb();
  const departments = db.departments.all();
  const agents = db.agents.all();
  // The venture lens: same roster, same DB — the switcher just changes which
  // crew lights up. No venture param = everything bright.
  const venture = getVenture(searchParams?.venture ?? '');
  const ventureSet = venture ? ventureAgentSet(venture.id) : null;
  const dimFor = (id: string) => (ventureSet ? !ventureSet.has(id) : false);
  const conductor = agents.find((a) => a.id === 'conductor');
  // Conductor sits in the AI Head slot; the columns are everything else
  const tree = buildHierarchy(
    departments,
    agents.filter((a) => a.id !== 'conductor'),
  );
  const agentNames = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  const lastBroadcast = db.broadcasts.recent(1)[0] ?? null;

  return (
    <div>
      <PageHeader
        title="Agent Hierarchy"
      />

      {/* Venture switcher: Vantage / Launchpad Cohort / Personal Brand — one
          click swaps which crew lights up below. All data stays shared. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link
          href="/org"
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
            !venture ? 'border-os-text bg-os-text text-os-bg' : 'border-os-border bg-os-surface text-os-muted hover:text-os-text'
          }`}
        >
          All ventures
        </Link>
        {VENTURES.map((v) => {
          const active = venture?.id === v.id;
          return (
            <Link
              key={v.id}
              href={`/org?venture=${v.id}`}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                active ? 'text-black' : 'border-os-border bg-os-surface text-os-muted hover:text-os-text'
              }`}
              style={active ? { background: v.color, borderColor: v.color } : undefined}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? '#000000' : v.color }} />
              {v.label}
            </Link>
          );
        })}
        {venture && <span className="text-[11px] text-os-dim">{venture.kind} · {venture.detail}</span>}
      </div>

      {venture && (
        <div
          className="mb-4 rounded-lg border bg-os-surface px-4 py-3"
          style={{ borderColor: `${venture.color}66`, boxShadow: `inset 3px 0 0 ${venture.color}` }}
        >
          <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: venture.color }}>
            {venture.label} — executive focus
          </div>
          <ul className="mt-1.5 space-y-1">
            {venture.focus.map((f) => (
              <li key={f} className="flex items-start gap-2 text-[11px] text-os-muted">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: venture.color }} />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-2 font-mono text-[10px] text-os-dim">
            G-Brain tag: #{venture.brainTag} · {ventureSet?.size} agents on this venture
          </div>
        </div>
      )}

      {/* Life-area legend: every crew below is tinted by the part of life it serves */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-os-border bg-os-surface px-3 py-2">
        <span className="text-[9px] uppercase tracking-[0.2em] text-os-dim">Life areas</span>
        {LIFE_AREAS.map((area) => (
          <span key={area.id} className="flex items-center gap-1.5 text-[10px] text-os-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: area.color }} />
            {area.label}
          </span>
        ))}
      </div>

      {/* Operator */}
      <div className="flex flex-col items-center">
        <Users className="h-7 w-7 text-os-text" />
        <div className="mt-1 text-base font-bold tracking-wide">Alex Rivera</div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-os-dim">Operator</div>
        <div className="mt-2 h-6 w-px bg-os-border-bright" />
        <div className="text-[10px] uppercase tracking-[0.2em] text-os-muted">Conductor (Super Agent)</div>
        <div className="h-3 w-px bg-os-border-bright" />
      </div>

      {/* AI Head row: G-Brain ── Conductor ── Comms Feed */}
      <div className="flex items-center justify-center gap-0">
        <SystemCard href="/brain" title="G-Brain" caption="markdown + pgvector knowledge store" />
        <div className="hidden h-px w-10 bg-os-border-bright md:block" />
        {conductor ? (
          <ConductorCard conductor={conductor} agentNames={agentNames} initialBroadcast={lastBroadcast} />
        ) : (
          <div className="rounded-xl border border-dashed border-os-border px-6 py-4 text-xs text-os-dim">
            conductor missing — run npm run seed
          </div>
        )}
        <div className="hidden h-px w-10 bg-os-border-bright md:block" />
        <SystemCard href="/comms" title="Comms Feed" caption="Gmail · WhatsApp · Slack, unified" />
      </div>

      {/* Trunk down to the department rail */}
      <div className="mx-auto h-10 w-px bg-os-border-bright" />

      {/* Department crews: sparkle tile → instance agents → worker pills → tools.
          The whole row is centered under the Conductor (mx-auto w-max) and only
          scrolls when it genuinely overflows the viewport. Spacing widens with
          the screen: gap-4 → gap-8 (wide) → gap-12 (ultra / 32"). */}
      <div className="overflow-x-auto overflow-y-hidden pb-4 overscroll-x-contain">
        <div className="mx-auto w-max">
          {/* Rail inset by half a column (mx-36 = ½ of w-72) so it runs exactly
              center-to-center across the crews — connectors always meet it. */}
          <div className="mx-36 h-px bg-os-border-bright" />
          <div className="flex gap-4 pt-4 wide:gap-8 ultra:gap-12">
          {tree.departments.map(({ department, roots }) => {
            const all = flattenNodes(roots).map((n) => n.agent);
            // Every lead at the department root is an instance slot; everything
            // else (workers, root specialists) renders as a task pill below.
            const instanceAgents = roots.filter((r) => r.agent.tier === 'lead').map((r) => r.agent);
            const instanceIds = new Set(instanceAgents.map((a) => a.id));
            const pillNodes = roots.flatMap((root) =>
              instanceIds.has(root.agent.id) ? root.children : [root],
            );
            const deptTools = [...new Set(all.flatMap((a) => a.tools))];
            const area = lifeAreaForDepartment(department.id);
            return (
              <section
                key={department.id}
                className="org-connector flex w-72 shrink-0 flex-col items-center gap-2.5 wide:rounded-2xl wide:border wide:border-os-border wide:bg-os-surface wide:px-4 wide:py-5"
              >
                <div className="text-xs font-bold">{department.name}</div>
                {area && (
                  <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em]" style={{ color: area.color }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: area.color }} />
                    {area.label}
                  </div>
                )}
                <div
                  className="hoverable group flex h-16 w-16 items-center justify-center rounded-2xl bg-os-raised"
                  style={{ border: `1px solid ${area?.color ?? '#333333'}55`, boxShadow: `0 0 18px ${area?.color ?? '#000000'}22` }}
                >
                  <SparkIcon size={34} shade={area?.color ?? department.color} />
                </div>

              {instanceAgents.length > 0 && (
                <div className="w-full space-y-1.5">
                  <div className="text-center text-[9px] uppercase tracking-[0.2em] text-os-dim">
                    {department.name} crew
                  </div>
                  {/* Instance slots: each becomes an OpenClaw / Claude Code process on the mini */}
                  {instanceAgents.map((agent) => (
                    <div
                      key={agent.id}
                      title={agent.description}
                      className={`hoverable w-full rounded-xl border border-os-border-bright bg-os-surface px-3 py-2 ${
                        dimFor(agent.id) ? 'opacity-20' : ''
                      }`}
                      style={
                        venture && !dimFor(agent.id)
                          ? { borderColor: `${venture.color}66`, boxShadow: `0 0 12px ${venture.color}1a` }
                          : undefined
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[agent.status]}`} />
                          <span className="truncate text-xs font-bold">{agent.name}</span>
                          <VentureDots agentId={agent.id} />
                        </div>
                        <span className="shrink-0 rounded bg-os-raised px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-os-dim">
                          {agent.instance}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate pl-3 text-[10px] text-os-dim">{agent.role}</div>
                    </div>
                  ))}
                </div>
              )}

              {pillNodes.length > 0 && (
                <div className="grid w-full grid-cols-2 gap-1.5">
                  {pillNodes.map((node) => (
                    <AgentNodePill key={node.agent.id} node={node} dimFor={dimFor} />
                  ))}
                </div>
              )}

              {all.length === 0 && (
                <div className="w-full rounded-xl border border-dashed border-os-border px-3 py-5 text-center text-[10px] text-os-dim">
                  Agents land here as this department goes live
                </div>
              )}

              {deptTools.length > 0 && (
                <div className="w-full">
                  <div className="rounded-md bg-os-raised px-2 py-1 text-center text-[8px] uppercase tracking-[0.2em] text-os-muted">
                    Agent Tools
                  </div>
                  <div className="mt-1.5 flex flex-wrap justify-center gap-1">
                    {deptTools.map((tool) => (
                      <span key={tool} className="rounded border border-os-border px-1.5 py-0.5 font-mono text-[9px] text-os-muted">
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              </section>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}
