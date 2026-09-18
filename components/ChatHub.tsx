'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Crown, PanelLeft, Plus, X } from 'lucide-react';
import { ConductorChat } from '@/components/ConductorChat';
import { ConductorComposer } from '@/components/ConductorComposer';
import { Synthesizing } from '@/components/Synthesizing';
import { Label } from '@/components/terminal';
import type { ConversationSummary } from '@/lib/chats';
import type { AgentMessage } from '@/lib/schemas';

/**
 * The Claude-style chat hub: ONE rounded shell — the
 * same rounded-2xl language as the Conductor panel — holding a collapsible
 * conversation rail and the open thread, equal height, everything scrolling
 * inside. Collapse the rail (PanelLeft, like the sidebar) and the whole shell
 * becomes the chat; the strip keeps every conversation one click away as
 * avatars. "New chat" flips the rail into the roster picker and collapses the
 * same way. The Conductor row renders the real cockpit thread (bare, so the
 * shell doesn't double-frame it); agent rows use persisted agent_messages.
 */
const CONDUCTOR = '__board_conductor__';

const ago = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'now';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

const initials = (name: string): string =>
  name
    .split(/[\s·]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export function ChatHub({
  initialSummaries,
  roster,
  conductorModel,
  boardUrl = null,
}: {
  initialSummaries: ConversationSummary[];
  roster: { id: string; name: string; description: string }[];
  conductorModel: string | null;
  boardUrl?: string | null;
}) {
  const [summaries, setSummaries] = useState(initialSummaries);
  const [selected, setSelected] = useState<string>(CONDUCTOR);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [railOpen, setRailOpen] = useState(true);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [sending, setSending] = useState<number | null>(null); // Date.now() while a reply is out
  const [error, setError] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const nameOf = (id: string) =>
    id === CONDUCTOR ? 'Conductor · CEO' : (roster.find((a) => a.id === id)?.name ?? id);

  const loadThread = useCallback(async (agentId: string) => {
    setLoadingThread(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/chat`, { cache: 'no-store' });
      if (res.ok) setMessages(((await res.json()) as { messages: AgentMessage[] }).messages);
    } catch {
      /* keep the last view on a transient failure */
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    if (selected !== CONDUCTOR) void loadThread(selected);
    setError(null);
  }, [selected, loadThread]);

  // keep the thread pinned to the newest message
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, sending]);

  const send = async (outbound: string, display: string) => {
    if (selected === CONDUCTOR) return; // the cockpit panel owns its own send
    const optimistic: AgentMessage = {
      id: `local-${Date.now()}`,
      agentId: selected,
      role: 'user',
      content: display,
      toolCalls: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setSending(Date.now());
    setError(null);
    try {
      const res = await fetch(`/api/agents/${selected}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: outbound }),
      });
      if (!res.ok) {
        setError(((await res.json()) as { error?: string }).error ?? `HTTP ${res.status}`);
      } else {
        const body = (await res.json()) as { messages: AgentMessage[] };
        setMessages(body.messages);
        const last = body.messages[body.messages.length - 1];
        if (last) {
          setSummaries((s) => {
            const rest = s.filter((c) => c.agentId !== selected);
            return [
              {
                agentId: selected,
                agentName: nameOf(selected),
                lastMessage: last.content.replace(/\s+/g, ' ').slice(0, 140),
                lastAt: last.createdAt,
                messageCount: body.messages.length,
              },
              ...rest,
            ];
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(null);
    }
  };

  const pick = (id: string) => {
    setSelected(id);
    setPicking(false);
  };

  // status dot: the board Conductor is a live thread, agent threads are direct
  const railDot = (id: string) => (
    <span
      aria-hidden
      className={`h-1.5 w-1.5 shrink-0 self-center ${id === CONDUCTOR ? 'animate-pulse bg-os-ok' : 'bg-os-dim'}`}
    />
  );
  const headerDot = <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-os-ok" />;

  const railRow = (id: string, name: string, sub: string, at?: string) => (
    <button
      key={id}
      onClick={() => pick(id)}
      data-lens="r"
      className={`pressable is-row relative mx-1.5 my-0.5 flex w-[calc(100%-12px)] flex-col gap-0.5 rounded-ctl px-2.5 py-2 text-left hover:bg-os-surface2 ${
 selected === id ? 'bg-os-surface2' : ''
 }`}
    >
      {selected === id && <span aria-hidden className="absolute bottom-1.5 left-0 top-1.5 w-[2px] bg-os-accent" />}
      <span className="flex items-baseline gap-2">
        {railDot(id)}
        {id === CONDUCTOR && <Crown className="h-3 w-3 shrink-0 self-center text-os-accent" />}
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{name}</span>
        <span className="shrink-0 font-mono text-[9px] text-os-dim">
          {id === CONDUCTOR ? 'pinned' : at ? ago(at) : null}
        </span>
      </span>
      <span className="truncate font-mono text-[10px] text-os-dim">{sub}</span>
    </button>
  );

  /** Collapsed strip: avatars keep every conversation one click away. */
  const stripDot = (id: string, name: string) => (
    <button
      key={id}
      onClick={() => pick(id)}
      title={name}
      className={`pressable mx-auto flex h-8 w-8 items-center justify-center rounded-xl text-[9.5px] font-bold hover:bg-os-surface2 ${
 selected === id ? 'bg-os-surface2 text-os-text' : 'text-os-muted'
 }`}
    >
      {id === CONDUCTOR ? <Crown className="h-3.5 w-3.5 text-os-accent" /> : initials(name)}
    </button>
  );

  return (
    <div
      className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-os-border-strong bg-os-surface transition-[grid-template-columns] duration-200"
      style={{ height: '100%', gridTemplateColumns: railOpen ? '280px minmax(0,1fr)' : '46px minmax(0,1fr)' }}
    >
      {/* conversation rail ↔ collapsed avatar strip */}
      <div className="flex h-full min-h-0 flex-col border-r border-os-border bg-os-bg2">
        <div className={`flex shrink-0 items-center border-b border-os-border py-2 ${railOpen ? 'justify-between px-3' : 'justify-center px-1'}`}>
          {railOpen && <Label>Conversations</Label>}
          <button
            onClick={() => setRailOpen((o) => !o)}
            title={railOpen ? 'Collapse conversations' : 'Expand conversations'}
            className="pressable text-os-dim hover:text-os-text"
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </button>
        </div>
        {railOpen ? (
          <>
            <div className="flex shrink-0 items-center gap-1.5 border-b border-os-border px-3 py-1.5">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="search threads"
                className="min-w-0 flex-1 rounded-ctl border border-os-border bg-os-bg px-2 py-1 font-mono text-[10px] text-os-text placeholder:text-os-dim focus:border-os-border-strong focus:outline-none"
              />
              <button
                onClick={() => setPicking((p) => !p)}
                title="New chat"
                className="pressable shrink-0 rounded-ctl border border-os-border p-1.5 text-os-muted hover:bg-os-surface2 hover:text-os-text"
              >
                {picking ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
              {picking ? (
                roster
                  .filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase()))
                  .map((a) => railRow(a.id, a.name, a.description.slice(0, 60)))
              ) : (
                <>
                  {railRow(CONDUCTOR, 'Conductor · CEO', 'the live board thread on the host')}
                  {summaries
                    .filter((c) => c.agentId !== 'conductor')
                    .filter((c) => c.agentName.toLowerCase().includes(query.trim().toLowerCase()))
                    .map((c) => railRow(c.agentId, c.agentName, c.lastMessage, c.lastAt))}
                  {summaries.length === 0 && (
                    <p className="px-3 py-3 font-mono text-[10px] text-os-dim">
                      No direct chats yet. Hit New chat and pick an agent.
                    </p>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain py-2">
            {stripDot(CONDUCTOR, 'Conductor · CEO')}
            {summaries
              .filter((c) => c.agentId !== 'conductor')
              .map((c) => stripDot(c.agentId, c.agentName))}
          </div>
        )}
      </div>

      {/* thread pane — same height as the rail, always */}
      {selected === CONDUCTOR ? (
        <div className="h-full min-h-0">
          <ConductorChat model={conductorModel} boardUrl={boardUrl} bare />
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-os-border px-4 py-2">
            {headerDot}
            <span className="text-[12.5px] font-semibold">{nameOf(selected)}</span>
            <span className="ml-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">
              direct · read-only tools
            </span>
          </div>
          <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
            {loadingThread && messages.length === 0 && (
              <div className="space-y-3" aria-hidden>
                {[72, 46, 64, 38, 58, 50].map((w, i) => (
                  <div
                    key={i}
                    className="skeleton h-8 rounded-panel"
                    style={{ width: `${w}%`, marginLeft: i % 2 ? 'auto' : undefined }}
                  />
                ))}
              </div>
            )}
            {messages.length === 0 && !sending && !loadingThread && (
              <p className="font-mono text-[10.5px] text-os-dim">
                Fresh thread with {nameOf(selected)}. Say something.
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`animate-enter ${m.role === 'user' ? 'flex justify-end' : ''}`}>
                {m.role !== 'user' && (
                  <div className="mb-0.5 font-mono text-[9.5px] uppercase tracking-wider text-os-accent">
                    {nameOf(selected).toUpperCase()} · {ago(m.createdAt)}
                  </div>
                )}
                <div
                  className={`${m.role === 'user' ? '' : 'inline-block '}max-w-[82%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[12.5px] leading-relaxed ${
                    m.role === 'user' ? 'bg-os-surface2' : 'bg-os-raised text-os-muted'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <span className="inline-flex items-center rounded-xl bg-os-raised px-3 py-2">
                  <Synthesizing since={sending} />
                </span>
              </div>
            )}
            {error && <p className="font-mono text-[10px] text-os-err">{error}</p>}
          </div>
          <div className="shrink-0 p-3">
            <ConductorComposer onSend={send} disabled={sending !== null} placeholder={`Message ${nameOf(selected)}…`} />
          </div>
        </div>
      )}
    </div>
  );
}
