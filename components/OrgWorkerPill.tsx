'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AsyncButton } from '@/components/AsyncButton';
import { venturesForAgent } from '@/lib/ventures';
import type { Agent, AgentStatus } from '@/lib/schemas';

const STATUS_DOT: Record<AgentStatus, string> = {
  active: 'bg-os-text',
  idle: 'bg-os-muted',
  training: 'bg-os-muted animate-pulse',
  planned: 'border border-os-dim bg-transparent',
};

/** Tiny colored dots showing which ventures an agent serves. */
export function VentureDots({ agentId }: { agentId: string }) {
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

/**
 * Mock 1f: the worker pill. Collapsed it is a 999-radius task pill; clicking it
 * opens the role plus a run control and a link through to the roster, and the
 * radius drops to 8px. The radius change is deliberately NOT animated — the
 * `.pressable` transition names its properties one by one and border-radius is
 * not among them, so the corner snaps while everything else eases.
 */
export function OrgWorkerPill({ agent, dim = false }: { agent: Agent; dim?: boolean }) {
  const [open, setOpen] = useState(false);
  const run = async () => {
    const res = await fetch(`/api/agents/${agent.id}/run`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json().catch(() => null);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      title={`${agent.role} — ${agent.description}`}
      onClick={() => setOpen((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }}
      data-lens="r"
      className={`pressable is-row border border-os-border bg-os-bg text-left ${
        open ? 'rounded-md-t' : 'rounded-full'
      } ${dim ? 'opacity-20' : ''}`}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[agent.status]}`} />
        <span className="truncate text-[10px] font-medium">{agent.name}</span>
        <VentureDots agentId={agent.id} />
      </div>
      {open && (
        <div
          className="animate-enter px-2.5 pb-2 pl-5 text-[9.5px] leading-relaxed text-os-muted"
          onClick={(e) => e.stopPropagation()}
        >
          {agent.role}
          <div className="mt-1.5 flex items-center gap-1.5">
            <AsyncButton run={run} tone="secondary" busyLabel="running" doneLabel="ok" showElapsed>
              ▸ run
            </AsyncButton>
            <Link
              href="/agents"
              data-lens="c"
              className="pressable is-dark inline-flex h-[20px] items-center rounded-ctl border border-os-border bg-os-bg px-2 font-mono text-[9.5px] font-semibold text-os-muted"
            >
              chat
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
