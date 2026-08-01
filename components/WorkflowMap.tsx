'use client';

/**
 * The machine, mapped. A horizontal chain of process steps for the selected
 * workflow: each step is owned by a human or an agent, costs weekly hours, runs
 * on tools, and flows into the next along a labelled edge. Bottleneck steps are
 * tagged with the money they leak; automations (live or suggested) show what
 * carries the load back. The bottom bar totals manual load, tagged leak, and
 * automation returns. Reads seeded, real-ready data; "Add step" drops a
 * placeholder node (client-only for now).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { User, Bot, Clock, Zap, Wrench, Plus, RotateCcw, ChevronRight, TriangleAlert } from 'lucide-react';
import { workflowStats } from '@/lib/workflow-stats';
import { toolBrand } from '@/lib/workflow-tool-brands';
import type { Workflow, WorkflowStep } from '@/lib/schemas';

/** Compact money: $14k, $120k, $233k, $850. */
function usd(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `$${Math.round(n)}`;
}

function StepCard({ step, toolLogos }: { step: WorkflowStep; toolLogos: Record<string, ReactNode> }) {
  const leaking = step.leakUsd != null;
  const auto = step.automation;
  return (
    <div
      className="relative flex w-[224px] shrink-0 flex-col gap-2 rounded-xl border p-3"
      style={{
        borderColor: leaking ? 'color-mix(in oklab, var(--err) 55%, var(--border))' : 'var(--border)',
        background: leaking ? 'color-mix(in oklab, var(--err) 6%, var(--surface))' : 'var(--surface)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-semibold leading-tight">{step.title}</span>
        {leaking && (
          <span
            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide"
            style={{ background: 'color-mix(in oklab, var(--err) 18%, transparent)', color: 'var(--err)' }}
          >
            <TriangleAlert className="h-2.5 w-2.5" />
            leak {usd(step.leakUsd!)}/mo
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 font-mono text-[10px]">
        {step.ownerKind === 'agent' ? (
          <Bot className="h-3 w-3 shrink-0 text-os-accent" />
        ) : (
          <User className="h-3 w-3 shrink-0 text-os-muted" />
        )}
        <span className="truncate text-os-muted">{step.owner}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-os-dim">
          <Clock className="h-3 w-3" />
          {step.hoursPerWeek}h/wk
        </span>
      </div>

      {step.tools.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {step.tools.map((t) => (
            <span
              key={t}
              title={toolBrand(t).name}
              className="flex items-center gap-1 rounded-md border border-os-border py-0.5 pl-0.5 pr-1.5 font-mono text-[9px] text-os-dim"
            >
              {toolLogos[t]}
              {toolBrand(t).name}
            </span>
          ))}
        </div>
      )}

      {auto && (
        <div
          className="mt-0.5 rounded-md border px-2 py-1.5"
          style={{
            borderColor: auto.state === 'live' ? 'color-mix(in oklab, var(--ok) 40%, transparent)' : 'var(--border-strong)',
            background: auto.state === 'live' ? 'color-mix(in oklab, var(--ok) 9%, transparent)' : 'var(--accent-soft)',
          }}
        >
          <div className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 shrink-0" style={{ color: auto.state === 'live' ? 'var(--ok)' : 'var(--text-3)' }} />
            <span className="truncate text-[10.5px] font-medium">{auto.title}</span>
          </div>
          <div
            className="mt-0.5 font-mono text-[9px] uppercase tracking-wide"
            style={{ color: auto.state === 'live' ? 'var(--ok)' : 'var(--text-3)' }}
          >
            {auto.state === 'live'
              ? `live · recovering ${usd(auto.recoveredUsd)}/mo`
              : auto.recoveredUsd > 0
                ? `suggested · +${usd(auto.recoveredUsd)}/mo`
                : 'suggested'}
          </div>
        </div>
      )}
    </div>
  );
}

/** The labelled connector between two steps. */
function Edge({ label }: { label: string | null }) {
  return (
    <div className="flex min-w-[58px] shrink-0 flex-col items-center justify-center px-1">
      {label && (
        <span className="mb-1 whitespace-nowrap font-mono text-[9px] uppercase tracking-wide text-os-accent">{label}</span>
      )}
      <div className="flex w-full items-center">
        <span className="h-px flex-1" style={{ background: 'var(--border-strong)' }} />
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-os-dim" />
      </div>
    </div>
  );
}

function PlaceholderCard() {
  return (
    <div className="flex w-[224px] shrink-0 flex-col gap-2 rounded-xl border border-dashed border-os-border-strong p-3">
      <span className="text-[13px] font-semibold text-os-dim">New step</span>
      <div className="flex items-center gap-1.5 font-mono text-[10px] text-os-dim">
        <User className="h-3 w-3" />
        unassigned · set an owner
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'err' }) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'err' ? 'var(--err)' : 'var(--text)';
  return (
    <div className="shrink-0">
      <div className="font-mono text-[9px] uppercase tracking-widest text-os-dim">{label}</div>
      <div className="font-mono text-[15px] font-semibold" style={{ color }}>
        {value}
      </div>
      {sub && <div className="font-mono text-[9px] text-os-dim">{sub}</div>}
    </div>
  );
}

export function WorkflowMap({
  workflows,
  toolLogos = {},
}: {
  workflows: Workflow[];
  /** tool id -> pre-rendered BrandLogo (built server-side so simple-icons
   *  never ships to the client). */
  toolLogos?: Record<string, ReactNode>;
}) {
  const [selectedId, setSelectedId] = useState(workflows[0]?.id ?? '');
  const [extraByWf, setExtraByWf] = useState<Record<string, number>>({});

  const current = workflows.find((w) => w.id === selectedId) ?? workflows[0];
  const stats = useMemo(() => (current ? workflowStats(current) : null), [current]);
  const extra = extraByWf[selectedId] ?? 0;

  if (!current || !stats) {
    return (
      <p className="rounded-xl border border-dashed border-os-border px-4 py-10 text-center text-xs text-os-dim">
        No workflows seeded yet.
      </p>
    );
  }

  const addStep = () => setExtraByWf((m) => ({ ...m, [selectedId]: (m[selectedId] ?? 0) + 1 }));
  const reset = () => setExtraByWf((m) => ({ ...m, [selectedId]: 0 }));

  return (
    <div>
      {/* workflow selector + builder actions */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {workflows.map((w) => {
          const on = w.id === selectedId;
          return (
            <button
              key={w.id}
              onClick={() => setSelectedId(w.id)}
              className={`rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                on ? 'border-os-accent text-os-accent' : 'border-os-border text-os-dim hover:text-os-muted'
              }`}
            >
              {w.name}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={addStep}
            className="flex items-center gap-1 rounded-md border border-os-border-strong bg-os-surface2 px-2.5 py-1.5 font-mono text-[11px] text-os-text transition-colors hover:border-os-dim"
          >
            <Plus className="h-3 w-3" /> Add step
          </button>
          {extra > 0 && (
            <button
              onClick={reset}
              className="flex items-center gap-1 rounded-md border border-os-border px-2.5 py-1.5 font-mono text-[11px] text-os-dim transition-colors hover:text-os-muted"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          )}
        </div>
      </div>

      <div className="mb-3 font-mono text-[11px] text-os-dim">{current.subtitle}</div>

      {/* legend */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[9.5px] uppercase tracking-wide text-os-dim">
        <span>legend</span>
        <span className="flex items-center gap-1.5"><User className="h-3 w-3 text-os-muted" /> human</span>
        <span className="flex items-center gap-1.5"><Bot className="h-3 w-3 text-os-accent" /> agent</span>
        <span className="flex items-center gap-1.5"><Wrench className="h-3 w-3" /> tool</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2" style={{ background: 'var(--err)' }} /> bottleneck leak
        </span>
        <span className="flex items-center gap-1.5"><Zap className="h-3 w-3" style={{ color: 'var(--ok)' }} /> automation</span>
      </div>

      {/* the map */}
      <div className="overflow-x-auto pb-3">
        <div className="flex items-center">
          {current.steps.map((step, i) => (
            <div key={step.id} className="flex items-stretch">
              <StepCard step={step} toolLogos={toolLogos} />
              {(i < current.steps.length - 1 || extra > 0) && <Edge label={step.edgeLabel} />}
            </div>
          ))}
          {Array.from({ length: extra }).map((_, i) => (
            <div key={`extra-${i}`} className="flex items-stretch">
              <PlaceholderCard />
              {i < extra - 1 && <Edge label={null} />}
            </div>
          ))}
        </div>
      </div>

      {/* the machine's numbers */}
      <div className="mt-3 flex flex-wrap items-center gap-x-7 gap-y-3 rounded-xl border border-os-border bg-os-surface px-4 py-3.5">
        <div className="min-w-0 shrink-0">
          <div className="text-[12.5px] font-semibold">{current.name}</div>
          <div className="font-mono text-[10px] text-os-dim">{usd(current.revenueUsd)}/mo revenue</div>
        </div>
        <Stat label="Manual load" value={`${stats.manualHours}h/wk`} />
        <Stat label="Tagged leak" value={`${usd(stats.leakUsd)}/mo`} tone="err" />
        <Stat
          label="Automation returns"
          value={`${usd(stats.liveReturnsUsd)}/mo`}
          sub={stats.suggestedReturnsUsd > 0 ? `+${usd(stats.suggestedReturnsUsd)} suggested` : undefined}
          tone="ok"
        />
        <div className="ml-auto flex shrink-0 items-center gap-3 font-mono text-[10px] text-os-dim">
          <span className="flex items-center gap-1"><User className="h-3 w-3" /> {stats.humanSteps} human</span>
          <span className="flex items-center gap-1"><Bot className="h-3 w-3" /> {stats.agentSteps} agent</span>
          <span className="flex items-center gap-1"><Wrench className="h-3 w-3" /> {stats.toolCount} tool</span>
        </div>
      </div>
    </div>
  );
}
