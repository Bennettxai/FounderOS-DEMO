'use client';

import { useState } from 'react';
import type { Agent, Broadcast } from '@/lib/schemas';
import { AsyncButton } from '@/components/AsyncButton';
import { ConductorEmblem } from '@/components/ConductorEmblem';

/**
 * The "AI Head" card from the FounderOS board: the Conductor super-agent
 * with its chat pill. Sending broadcasts the message to every agent in
 * parallel via POST /api/agents/broadcast; replies expand below.
 */
export function ConductorCard({
  conductor,
  agentNames,
  initialBroadcast,
}: {
  conductor: Agent;
  agentNames: Record<string, string>;
  initialBroadcast: Broadcast | null;
}) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broadcast, setBroadcast] = useState<Broadcast | null>(initialBroadcast);
  const [showReplies, setShowReplies] = useState(false);

  async function send() {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/agents/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error(`broadcast failed (${res.status})`);
      const body = (await res.json()) as { broadcast: Broadcast };
      setBroadcast(body.broadcast);
      setShowReplies(true);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div data-lens="r" className="pressable is-row group w-[340px] rounded-tile border border-os-border-bright bg-os-surface p-4">
      <div className="text-center text-[10px] uppercase tracking-[0.25em] text-os-dim">AI Head</div>

      {/* Living core — breathes and orbits while the Conductor is broadcasting */}
      <div className="mt-2 flex justify-center">
        <ConductorEmblem size={62} thinking={sending} />
      </div>
      <div className="mt-2 text-center text-sm font-bold tracking-[0.2em]">CONDUCTOR</div>
      <div className="text-center text-[10px] text-os-dim">
        super agent · {conductor.instance} runtime until the dedicated host lands
      </div>

      {/* Chat pill → broadcast to every agent */}
      <div className="mt-3 flex gap-1.5">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Chat with Conductor — reaches every agent"
          className="min-w-0 flex-1 rounded-full border border-os-border bg-os-bg px-3 py-1.5 text-xs text-os-text placeholder:text-os-dim focus:border-os-border-bright focus:outline-none"
          disabled={sending}
        />
        {/* three-state broadcast control: Send → spinner → ✓ (✗ if it threw) */}
        <AsyncButton
          run={send}
          disabled={!message.trim()}
          failed={error !== null}
          doneLabel=""
          failLabel=""
          className="!rounded-full shrink-0"
        >
          Send
        </AsyncButton>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-os-muted">⚠ {error}</p>}

      {/* Capability pills */}
      <div className="mt-3 grid grid-cols-3 gap-1">
        {['Broadcast', 'Orchestration', 'Instances'].map((cap) => (
          <span key={cap} className="rounded-full bg-os-text px-2 py-1 text-center text-[9px] font-semibold uppercase tracking-wider text-os-bg">
            {cap}
          </span>
        ))}
      </div>

      {/* Agent tools bar */}
      <div className="mt-2 rounded-md bg-os-raised px-2 py-1 text-center text-[9px] uppercase tracking-[0.2em] text-os-muted">
        Agent Tools
      </div>
      <div className="mt-1.5 flex justify-center gap-1">
        {conductor.tools.map((tool) => (
          <span key={tool} className="rounded border border-os-border px-1.5 py-0.5 font-mono text-[9px] text-os-muted">
            {tool}
          </span>
        ))}
      </div>

      {/* Latest broadcast + replies */}
      {broadcast && (
        <div className="mt-3 border-t border-os-border pt-2">
          <button
            onClick={() => setShowReplies((v) => !v)}
            className="pressable flex w-full items-baseline justify-between gap-2 text-left"
          >
            <span className="truncate text-[11px] text-os-muted">«{broadcast.message}»</span>
            <span className="shrink-0 text-[10px] text-os-ok">
              {broadcast.replies.filter((r) => r.ok).length}/{broadcast.replies.length} ok{' '}
              <span className="text-os-dim">{showReplies ? '▾' : '▸'}</span>
            </span>
          </button>
          {showReplies && (
            <ul className="animate-enter mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
              {broadcast.replies.map((reply) => (
                <li key={reply.id} className="flex items-start gap-1.5 rounded-md bg-os-raised px-2 py-1.5">
                  <span
                    className={`mt-1 h-1 w-1 shrink-0 rounded-full ${reply.ok ? 'bg-os-text' : 'border border-os-dim bg-transparent'}`}
                  />
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold">{agentNames[reply.agentId] ?? reply.agentId}</span>
                    <span className="break-words text-[10px] leading-relaxed text-os-muted"> — {reply.reply}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
