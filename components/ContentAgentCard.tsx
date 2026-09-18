'use client';

import { Wrench } from 'lucide-react';
import { AsyncButton } from '@/components/AsyncButton';
import { Dot } from '@/components/terminal';
import type { Agent } from '@/lib/schemas';

function prettyTool(slug: string): string {
  return slug.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Mock 5c: a content agent, as a lens row you can run in place. The card is
 * the row (data-lens="r"), the run control and the tool chips are controls
 * (data-lens="c"). Running posts to the same route /agents and the palette
 * use, so a run started here shows up everywhere else.
 */
export function ContentAgentCard({ agent, lead = false }: { agent: Agent; lead?: boolean }) {
  const run = async () => {
    const res = await fetch(`/api/agents/${agent.id}/run`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json().catch(() => null);
  };
  return (
    <div
      data-lens="r"
      className={`pressable is-row rounded-panel border bg-os-surface p-4 ${
        lead ? 'border-[var(--accent-line)]' : 'border-os-border'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Dot state={agent.status === 'active' ? 'ok' : 'available'} pulse={agent.status === 'active'} />
            <span className="truncate text-[14px] font-bold">{agent.name}</span>
            {lead && (
              <span className="rounded-full border border-[var(--accent-line)] px-1.5 py-px font-mono text-[9px] uppercase tracking-wide text-os-accent">
                lead
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-os-dim">
            {agent.role} · {agent.model}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`font-mono text-[10px] uppercase tracking-wide ${
              agent.status === 'active' ? 'text-os-ok' : 'text-os-warn'
            }`}
          >
            {agent.status}
          </span>
          <AsyncButton run={run} tone="secondary" busyLabel="running" doneLabel="ok" showElapsed>
            ▸ run
          </AsyncButton>
        </div>
      </div>
      <p className="mt-2.5 text-[12px] leading-relaxed text-os-muted [text-wrap:pretty]">{agent.description}</p>
      {agent.tools.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {agent.tools.map((t) => (
            <span
              key={t}
              data-lens="c"
              className="pressable is-dark inline-flex items-center gap-1 rounded-full border border-os-border bg-os-surface2 px-2 py-0.5 font-mono text-[10px] text-os-muted"
            >
              <Wrench className="h-2.5 w-2.5" /> {prettyTool(t)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
