'use client';

import {
  ArrowLeft, ChevronRight, ClipboardList, FileText, ListChecks, Server, User, UserCog, Wrench, X, type LucideIcon,
} from 'lucide-react';
import type { AgentWiki, ToolWiki } from '@/lib/agent-wiki';
import type { Personnel } from '@/lib/personnel';
import type { MemoryNode } from '@/lib/memory-core';
import type { Person, RosterClient, SopTask } from '@/lib/schemas';

export type AgentLite = { id: string; name: string; role: string; model: string };
export type ToolLite = { id: string; slug: string; name: string; mcp: boolean };
export type DeptLite = { deptId: string; teamId: string; name: string; tagline: string; color: string };

/** [[wiki-link]] styled chip, optionally clickable. */
export function WikiLink({ label, mcp, onClick }: { label: string; mcp?: boolean; onClick?: () => void }) {
  const inner = (
    <>
      <span className="text-os-dim">[[</span>
      {label}
      <span className="text-os-dim">]]</span>
      {mcp && <span className="rounded-sm-t border border-[var(--accent-line)] px-1 text-[8px] uppercase tracking-wide text-os-accent">mcp</span>}
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="inline-flex items-center gap-1 font-mono text-[10.5px] text-os-accent transition-opacity hover:opacity-70">
      {inner}
    </button>
  ) : (
    <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-os-accent">{inner}</span>
  );
}

function PanelHeader({
  title, sub, color, onBack, onClose,
}: {
  title: string; sub?: string; color?: string; onBack?: () => void; onClose?: () => void;
}) {
  return (
    <div className="flex items-start gap-2 border-b border-os-border px-3 py-2">
      {onBack && (
        <button onClick={onBack} aria-label="Back" className="mt-0.5 shrink-0 text-os-dim transition-colors hover:text-os-text">
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-bold" style={color ? { color } : undefined}>{title}</div>
        {sub && <div className="truncate font-mono text-[9.5px] text-os-dim">{sub}</div>}
      </div>
      {onClose && (
        <button onClick={onClose} aria-label="Close" className="shrink-0 text-os-dim transition-colors hover:text-os-text">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-os-dim">
      <Icon className="h-3 w-3" /> {children}
    </div>
  );
}

/** A clickable row used for agents + people. */
function Row({
  color, title, sub, badge, onClick,
}: {
  color: string; title: string; sub?: string; badge?: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`group flex w-full items-center gap-2 rounded-md-t border border-os-border bg-os-surface px-2.5 py-1.5 text-left transition-colors ${
        onClick ? 'hover:border-os-border-strong' : 'cursor-default'
      }`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] font-semibold">{title}</span>
        {sub && <span className="block truncate font-mono text-[9.5px] text-os-dim">{sub}</span>}
      </span>
      {badge && <span className="shrink-0 font-mono text-[9px] uppercase tracking-wide text-os-dim">{badge}</span>}
      {onClick && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-os-dim opacity-0 transition-opacity group-hover:opacity-100" />}
    </button>
  );
}

/** Department overview: human lead, agents, tools. */
export function DeptOverviewCard({
  dept, head, agents, tools, onAgent, onTool, onPerson,
}: {
  dept: DeptLite;
  head: Personnel | null;
  agents: AgentLite[];
  tools: ToolLite[];
  onAgent: (id: string) => void;
  onTool: (id: string) => void;
  onPerson: (deptId: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader title={dept.name} sub={dept.tagline} color={dept.color} />
      <div className="flex-1 overflow-y-auto px-3 py-2.5">
        <SectionLabel icon={UserCog}>Human personnel</SectionLabel>
        {head ? (
          <Row color={dept.color} title={head.name} sub={head.role} badge="lead" onClick={() => onPerson(dept.deptId)} />
        ) : (
          <p className="rounded-md-t border border-dashed border-os-border px-3 py-2 font-mono text-[10.5px] text-os-dim">
            No human lead yet — this team runs on agents.
          </p>
        )}

        <div className="mt-4">
          <SectionLabel icon={User}>Agents ({agents.length})</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {agents.map((a) => (
              <Row key={a.id} color="var(--accent)" title={a.name} sub={`${a.role} · ${a.model}`} onClick={() => onAgent(a.id)} />
            ))}
          </div>
        </div>

        <div className="mt-4">
          <SectionLabel icon={Wrench}>Tools ({tools.length})</SectionLabel>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {tools.map((t) => (
              <WikiLink key={t.id} label={t.name} mcp={t.mcp} onClick={() => onTool(t.id)} />
            ))}
            {tools.length === 0 && <span className="font-mono text-[10.5px] text-os-dim">no tools wired</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Agent harness card: the real picture of one agent — its charter, the SOP it
 * executes (the actual instructions), where it sits in the harness (tier,
 * instance, reports-to, sub-agents), the tools it holds, and its last run.
 */
export function AgentHarnessCard({
  agent, task, parentName, parentAgentId, subAgents, lastRun, headName, runLabel,
  onBack, onClose, onTool, onAgent, onTask,
}: {
  agent: { name: string; role: string; model: string; tier: string; instance: string; description: string; tools: string[] };
  task: SopTask | null;
  parentName: string | null;
  parentAgentId: string | null;
  subAgents: { id: string; name: string }[];
  lastRun: { ok: boolean; summary: string } | null;
  /** relative time of the last run, precomputed by the caller */
  runLabel?: string | null;
  headName?: string | null;
  onBack?: () => void;
  onClose?: () => void;
  onTool?: (slug: string) => void;
  onAgent?: (agentId: string) => void;
  onTask?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader title={agent.name} sub={`${agent.role} · AI agent`} onBack={onBack} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-3 py-2.5">
        <p className="mb-3 text-[11px] leading-relaxed text-os-muted">{agent.description}</p>

        <SectionLabel icon={ListChecks}>instructions{task ? '' : ' · no SOP assigned'}</SectionLabel>
        {task ? (
          <button onClick={onTask} disabled={!onTask} className={`mb-1 text-left ${onTask ? 'hover:opacity-80' : ''}`}>
            <span className="font-mono text-[10.5px] text-os-accent">[[{task.title}]]</span>
          </button>
        ) : null}
        <ol className="mb-4 flex flex-col gap-1.5">
          {(task?.steps ?? []).map((s, i) => (
            <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-os-muted">
              <span className="shrink-0 font-mono text-[10px] text-os-dim">{String(i + 1).padStart(2, '0')}</span>
              {s}
            </li>
          ))}
        </ol>

        <SectionLabel icon={Server}>harness</SectionLabel>
        <div className="mb-4 flex flex-col gap-1 font-mono text-[10.5px] text-os-muted">
          <span>
            <span className="text-os-dim">tier</span> {agent.tier} · <span className="text-os-dim">runs on</span>{' '}
            {agent.instance} · {agent.model}
          </span>
          {parentName && (
            <span>
              <span className="text-os-dim">reports to</span>{' '}
              {parentAgentId && onAgent ? (
                <button onClick={() => onAgent(parentAgentId)} className="text-os-accent hover:opacity-80">
                  {parentName}
                </button>
              ) : (
                parentName
              )}
            </span>
          )}
          {headName && (
            <span>
              <span className="text-os-dim">human lead</span> {headName}
            </span>
          )}
          {subAgents.length > 0 && (
            <span className="flex flex-wrap items-center gap-x-2">
              <span className="text-os-dim">sub-agents</span>
              {subAgents.map((s) =>
                onAgent ? (
                  <button key={s.id} onClick={() => onAgent(s.id)} className="text-os-accent hover:opacity-80">
                    {s.name}
                  </button>
                ) : (
                  <span key={s.id}>{s.name}</span>
                ),
              )}
            </span>
          )}
        </div>

        <SectionLabel icon={Wrench}>tools ({agent.tools.length})</SectionLabel>
        <div className="mb-4 flex flex-wrap gap-x-3 gap-y-1.5">
          {agent.tools.map((slug) => (
            <WikiLink
              key={slug}
              label={slug.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              onClick={onTool ? () => onTool(slug) : undefined}
            />
          ))}
          {agent.tools.length === 0 && <span className="font-mono text-[10.5px] text-os-dim">no tools wired</span>}
        </div>

        <SectionLabel icon={FileText}>last run</SectionLabel>
        {lastRun ? (
          <div className="flex items-start gap-2">
            <span
              className="mt-1 h-2 w-2 shrink-0 rounded-full"
              style={{ background: lastRun.ok ? 'var(--ok, #3df08c)' : 'var(--err, #ff6259)' }}
            />
            <p className="text-[11px] leading-relaxed text-os-muted">
              {lastRun.summary}
              {runLabel && <span className="font-mono text-[9.5px] text-os-dim"> · {runLabel}</span>}
            </p>
          </div>
        ) : (
          <p className="font-mono text-[10.5px] text-os-dim">never run — trigger it from /agents</p>
        )}
      </div>
    </div>
  );
}

/** Tool wiki: what it is, how it's wired, and who uses it. */
export function ToolDetailCard({
  wiki, onBack, onClose,
}: {
  wiki: ToolWiki;
  onBack?: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader title={wiki.name} sub={wiki.kind} onBack={onBack} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-3 py-2.5">
        <p className="mb-3 text-[11px] leading-relaxed text-os-muted">{wiki.summary}</p>
        <SectionLabel icon={FileText}>context · {wiki.path}</SectionLabel>
        <div className="mb-4 flex items-center gap-2">
          <WikiLink label={`${wiki.slug}.md`} mcp={wiki.mcp} />
        </div>
        <SectionLabel icon={User}>used by ({wiki.usedBy.length})</SectionLabel>
        {wiki.usedBy.length === 0 ? (
          <p className="font-mono text-[10.5px] text-os-dim">no agents in view</p>
        ) : (
          <div className="flex flex-col gap-1">
            {wiki.usedBy.map((n) => (
              <span key={n} className="font-mono text-[11px] text-os-muted">{n}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export type ClientLite = RosterClient;

// stages that count as "this is a client", across funnel and Attio wording
const ACTIVE_STAGES = new Set(['converted', 'won', 'closed won', 'closed-won', 'active']);
const isActiveClient = (status: string) => ACTIVE_STAGES.has(status.toLowerCase());

/** The Clients pillar roster: every client by venture, pipeline underneath. */
export function ClientRosterCard({
  clients, color, onClose,
}: {
  clients: ClientLite[];
  color: string;
  onClose?: () => void;
}) {
  const source = clients[0]?.source ?? 'funnel';
  const isLost = (status: string) => status.toLowerCase().includes('lost');
  const converted = clients.filter((c) => isActiveClient(c.status));
  const pipeline = clients.filter((c) => !isActiveClient(c.status) && !isLost(c.status));
  const lost = clients.filter((c) => !isActiveClient(c.status) && isLost(c.status)).length;
  const ventures = [...new Set(converted.map((c) => c.venture).filter(Boolean))].sort();
  const unventured = converted.filter((c) => !c.venture);
  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title="Client roster"
        sub={`${converted.length} active · ${pipeline.length} in pipeline${lost > 0 ? ` · ${lost} lost` : ''} · ${source === 'attio' ? 'live · Attio' : 'seeded · funnel'}`}
        color={color}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto px-3 py-2.5">
        {ventures.map((v) => (
          <div key={v} className="mb-4">
            <SectionLabel icon={UserCog}>{v.replace(/-/g, ' ')}</SectionLabel>
            <div className="flex flex-col gap-1.5">
              {converted
                .filter((c) => c.venture === v)
                .map((c) => (
                  <Row
                    key={c.id}
                    color={color}
                    title={c.name}
                    sub={c.amountUsd ? `$${c.amountUsd.toLocaleString('en-US')}` : 'active client'}
                  />
                ))}
            </div>
          </div>
        ))}
        {unventured.length > 0 && (
          <div className="mb-4">
            <SectionLabel icon={UserCog}>clients</SectionLabel>
            <div className="flex flex-col gap-1.5">
              {unventured.map((c) => (
                <Row
                  key={c.id}
                  color={color}
                  title={c.name}
                  sub={c.amountUsd ? `$${c.amountUsd.toLocaleString('en-US')}` : c.status}
                />
              ))}
            </div>
          </div>
        )}
        {converted.length === 0 && (
          <p className="mb-4 font-mono text-[10.5px] text-os-dim">No active clients yet.</p>
        )}
        {pipeline.length > 0 && (
          <div>
            <SectionLabel icon={ClipboardList}>in pipeline ({pipeline.length})</SectionLabel>
            <div className="flex flex-col gap-1">
              {pipeline.map((c) => (
                <span key={c.id} className="truncate font-mono text-[10.5px] text-os-dim">
                  {c.name} · {c.status.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Memory note detail: one page from Alex's brain-store constellation. */
export function MemoryNoteCard({
  note, color, onBack, onClose,
}: {
  note: MemoryNode;
  color: string;
  onBack?: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader title={note.label} sub="memory · brain-store" color={color} onBack={onBack} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-3 py-2.5">
        <div className="mb-3 flex items-center gap-2">
          <span
            className="rounded-sm-t border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide"
            style={{ borderColor: color, color }}
          >
            {note.folder}
          </span>
          <span className="font-mono text-[9.5px] text-os-dim">
            {note.wordCount} words · {note.chunks} chunk{note.chunks === 1 ? '' : 's'}
          </span>
        </div>
        {note.excerpt ? (
          <p className="mb-3 text-[11px] leading-relaxed text-os-muted">{note.excerpt}</p>
        ) : (
          <p className="mb-3 font-mono text-[10.5px] text-os-dim">no excerpt</p>
        )}
        <SectionLabel icon={FileText}>source</SectionLabel>
        <WikiLink label={`${note.id}.md`} />
      </div>
    </div>
  );
}

/** SOP detail: one written-out job — its steps, its single owner, its tools. */
export function SopTaskDetailCard({
  task, assigneeName, assigneeKindLabel, assigneeColor, runtime, tools, onBack, onClose, onAssignee, onTool,
}: {
  task: SopTask;
  assigneeName: string;
  assigneeKindLabel: string; // 'human' | 'AI agent'
  assigneeColor: string;
  /** what executes this SOP, e.g. 'builtin · imapflow' or 'human · judgment call' */
  runtime?: string | null;
  tools: { slug: string; name: string; mcp: boolean }[];
  onBack?: () => void;
  onClose?: () => void;
  onAssignee?: () => void;
  onTool?: (slug: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader title={task.title} sub="standard operating procedure" onBack={onBack} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-3 py-2.5">
        {task.summary && <p className="mb-3 text-[11px] leading-relaxed text-os-muted">{task.summary}</p>}

        <SectionLabel icon={UserCog}>done by</SectionLabel>
        <div className="mb-4">
          <Row color={assigneeColor} title={assigneeName} sub={assigneeKindLabel} badge="1:1" onClick={onAssignee} />
          {runtime && (
            <p className="mt-1 font-mono text-[9.5px] text-os-dim">
              runs on <span className="text-os-muted">{runtime}</span>
            </p>
          )}
        </div>

        <SectionLabel icon={ListChecks}>the job, written out</SectionLabel>
        <ol className="mb-4 flex flex-col gap-1.5">
          {task.steps.map((s, i) => (
            <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-os-muted">
              <span className="shrink-0 font-mono text-[10px] text-os-dim">{String(i + 1).padStart(2, '0')}</span>
              {s}
            </li>
          ))}
        </ol>

        <SectionLabel icon={Wrench}>tools at the end of the chain ({tools.length})</SectionLabel>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {tools.map((t) => (
            <WikiLink key={t.slug} label={t.name} mcp={t.mcp} onClick={onTool ? () => onTool(t.slug) : undefined} />
          ))}
          {tools.length === 0 && <span className="font-mono text-[10.5px] text-os-dim">no tools wired</span>}
        </div>
      </div>
    </div>
  );
}

/** Graph human detail: a person in the process — their one job and tools. */
export function GraphHumanDetailCard({
  person, deptName, color, task, tools, onBack, onClose, onTask, onTool,
}: {
  person: Person;
  deptName: string;
  color: string;
  task: SopTask | null;
  tools: { slug: string; name: string; mcp: boolean }[];
  onBack?: () => void;
  onClose?: () => void;
  onTask?: () => void;
  onTool?: (slug: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader title={person.name} sub={`${person.role} · human`} color={color} onBack={onBack} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-3 py-2.5">
        <p className="mb-3 text-[11px] leading-relaxed text-os-muted">
          Human employee in <span className="font-semibold">{deptName}</span> — one job, done by them alone.
        </p>
        <SectionLabel icon={ClipboardList}>their job</SectionLabel>
        <div className="mb-4">
          {task ? (
            <Row color={color} title={task.title} sub={task.summary} badge="sop" onClick={onTask} />
          ) : (
            <p className="font-mono text-[10.5px] text-os-dim">no task assigned</p>
          )}
        </div>
        <SectionLabel icon={Wrench}>works with ({tools.length})</SectionLabel>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {tools.map((t) => (
            <WikiLink key={t.slug} label={t.name} mcp={t.mcp} onClick={onTool ? () => onTool(t.slug) : undefined} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Person detail: who they are and the agents they manage. */
export function PersonDetailCard({
  person, deptName, color, agents, onBack, onClose,
}: {
  person: Personnel;
  deptName: string;
  color: string;
  agents: AgentLite[];
  onBack?: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader title={person.name} sub={person.role} color={color} onBack={onBack} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-3 py-2.5">
        <p className="mb-3 text-[11px] leading-relaxed text-os-muted">
          Leads <span className="font-semibold" style={{ color }}>{deptName}</span> — manages {agents.length} agent{agents.length === 1 ? '' : 's'}.
        </p>
        <SectionLabel icon={FileText}>context · brain-store/people/{person.name.toLowerCase()}.md</SectionLabel>
        <div className="mb-4"><WikiLink label={`${person.name.toLowerCase()}.md`} /></div>
        <SectionLabel icon={User}>manages</SectionLabel>
        <div className="flex flex-col gap-1">
          {agents.map((a) => (
            <span key={a.id} className="font-mono text-[11px] text-os-muted">{a.name}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
