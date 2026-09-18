'use client';

/**
 * Notion-style agent dock: a slim expand tab on the right edge of every view
 * opens a vertical Conductor panel that knows what screen you're on. The
 * panel fetches /api/conductor/context for the current route, shows what it
 * sees, and sends that context with every message so the agent can talk
 * about "this screen" concretely. Chat itself is the existing conductor
 * pipeline — the REAL board CEO via the cockpit thread.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronRight, X } from 'lucide-react';
import { ConductorComposer } from '@/components/ConductorComposer';
import { SparkIcon } from '@/components/SparkIcon';
import { ConductorEmblem } from '@/components/ConductorEmblem';
import { Synthesizing } from '@/components/Synthesizing';
import type { QuickAction } from '@/lib/screen-context';

type Turn = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  routedTo?: string;
  createdAt?: string;
  /** What the turn actually DID, if anything: a one-line proof with a way in. */
  receipt?: { text: string; href?: string };
};
type ScreenCtx = {
  title: string;
  context: string;
  quickActions?: QuickAction[];
  /** The model in the Conductor seat right now, or null when the board is out. */
  model?: string | null;
};

/** Cross-component open signal — the Topbar agent icon fires this. */
export const CONDUCTOR_OPEN_EVENT = 'conductor:open';

const WIDTH_KEY = 'founder-conductor-w';
const MIN_W = 300;
const MAX_W = 760;
const clampW = (w: number) => Math.min(MAX_W, Math.max(MIN_W, Math.round(w)));

/**
 * The fallback openers, used only until /api/conductor/context lands the
 * per-screen set (and if the board is unreachable it never does).
 */
const QUICK_ACTIONS = [
  { label: 'What needs me?', prompt: 'What needs my attention right now across the OS?' },
  { label: 'Board status', prompt: 'Give me the current board status: what is running, blocked, and done today.' },
  { label: "Today's digest", prompt: 'Summarize today: comms, agents, money, anything unusual.' },
] as const;

export function ConductorPanel() {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  // the operator controls the size: drag the left edge; the width persists
  const [width, setWidth] = useState(380);
  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(WIDTH_KEY));
      if (Number.isFinite(stored) && stored > 0) setWidth(clampW(stored));
    } catch {
      /* storage unavailable — default width stands */
    }
  }, []);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  // live width during a drag — state updates batch, so persisting from state
  // on pointerup can save a stale value on fast flicks
  const widthRef = useRef(380);
  useEffect(() => {
    widthRef.current = width;
  }, [width]);
  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: e.clientX, startW: widthRef.current };
    // 1:1 tracking while dragging — the glide transition would lag the handle
    document.documentElement.classList.add('conductor-dragging');
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic/stale pointer — drag still tracks via move events */
    }
  };
  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const w = clampW(d.startW + (d.startX - e.clientX));
    widthRef.current = w;
    setWidth(w);
  };
  const onHandleUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.documentElement.classList.remove('conductor-dragging');
    try {
      localStorage.setItem(WIDTH_KEY, String(widthRef.current));
    } catch {
      /* fine */
    }
  };

  // the Topbar agent icon opens the dock from anywhere
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(CONDUCTOR_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONDUCTOR_OPEN_EVENT, onOpen);
  }, []);

  // the dock PUSHES the content instead of covering it: publish the width as
  // a CSS var the layout shell reads for its right margin
  useEffect(() => {
    document.documentElement.style.setProperty('--conductor-w', open ? `${width}px` : '0px');
    return () => {
      document.documentElement.style.setProperty('--conductor-w', '0px');
    };
  }, [open, width]);
  const [ctx, setCtx] = useState<ScreenCtx | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [awaiting, setAwaiting] = useState(false);
  const awaitingRef = useRef(false);
  awaitingRef.current = awaiting;
  const awaitingSinceRef = useRef(0);
  const assistantBaselineRef = useRef(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // A clear is local, not a board delete: the cockpit thread is the real
  // record. We remember when he cleared and drop anything older on every
  // poll, otherwise the 4s refill would put the transcript straight back.
  const clearedAtRef = useRef(0);
  const clearTurns = () => {
    clearedAtRef.current = Date.now();
    setTurns([]);
  };

  const loadContext = useCallback(async (path: string) => {
    setCtx(null);
    try {
      const res = await fetch(`/api/conductor/context?path=${encodeURIComponent(path)}`);
      if (res.ok) setCtx((await res.json()) as ScreenCtx);
    } catch {
      // panel still works without context — the chat just loses screen grounding
    }
  }, []);

  useEffect(() => {
    if (open) void loadContext(pathname);
  }, [open, pathname, loadContext]);

  // The REAL Conductor thread (board cockpit issue) — load history when the
  // panel opens so the conversation survives reloads and devices.
  const loadThread = useCallback(async (): Promise<Turn[]> => {
    const res = await fetch('/api/conductor/chat');
    if (!res.ok) return [];
    const body = (await res.json()) as {
      messages: { id: string; body: string; authorType: 'user' | 'agent'; createdAt: string }[];
    };
    return body.messages
      .filter((m) => Date.parse(m.createdAt) > clearedAtRef.current)
      .map((m) => ({
        id: m.id,
        role: m.authorType === 'agent' ? ('assistant' as const) : ('user' as const),
        content: m.body,
        createdAt: m.createdAt,
        routedTo: m.authorType === 'agent' ? 'Conductor · board' : undefined,
      }));
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadThread().then((t) => {
      if (t.length > 0) setTurns(t);
    });
  }, [open, loadThread]);

  // One continuous poll while the panel is open: every 4s while a CEO reply
  // is pending, every ~12s at idle — a reply that lands late still appears
  // without reopening the panel (the old inline loop stopped looking).
  useEffect(() => {
    if (!open) return;
    let tick = 0;
    const id = setInterval(async () => {
      tick++;
      if (document.hidden) return;
      if (!awaitingRef.current && tick % 3 !== 0) return;
      const thread = await loadThread();
      if (thread.length > 0) {
        setTurns(thread);
        if (
          awaitingRef.current &&
          thread.filter((t) => t.role === 'assistant').length > assistantBaselineRef.current
        ) {
          setAwaiting(false);
          setError(null);
        }
      }
      if (awaitingRef.current && Date.now() - awaitingSinceRef.current > 150_000) {
        setAwaiting(false);
        setError('The CEO run is taking a while. Its reply lands in this thread automatically.');
      }
    }, 4000);
    return () => clearInterval(id);
  }, [open, loadThread]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, sending]);

  // `/ui <request>` → dispatch a real coding agent (Superset workspace on an
  // isolated branch) instead of chatting with the CEO. The receipt lands in
  // the local turn list; the change itself arrives as a branch to review.
  async function dispatchUiChange(request: string) {
    const res = await fetch('/api/conductor/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request }),
    });
    const body = (await res.json().catch(() => null)) as
      | { workspaceId?: string; branch?: string; error?: string }
      | null;
    if (!res.ok) throw new Error(body?.error ?? `dispatch failed (${res.status})`);
    setTurns((t) => [
      ...t,
      {
        id: `dispatch-${Date.now()}`,
        role: 'assistant',
        content: `Dispatched a coding agent for: "${request}"\n\nBranch: ${body?.branch}\nWorkspace: ${body?.workspaceId}`,
        routedTo: 'Superset · coding agent',
        receipt: { text: 'Workspace opened on an isolated branch', href: '/agents' },
      },
    ]);
  }

  async function send(composed: string, display: string) {
    if (sending) return;
    setSending(true);
    setError(null);
    setTurns((t) => [...t, { id: `optimistic-${Date.now()}`, role: 'user', content: display }]);
    try {
      if (display.toLowerCase().startsWith('/ui ')) {
        await dispatchUiChange(display.slice(4).trim());
        return;
      }
      // Send to the REAL Conductor (board cockpit thread). The screen context
      // rides along so the CEO knows what the operator is looking at.
      const message = ctx ? `${composed}\n\n(the user is looking at: ${ctx.title})` : composed;
      const res = await fetch('/api/conductor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `board unreachable (${res.status})`);
      }
      // The CEO replies asynchronously (comment wakes it, a run answers). The
      // background poll above picks the reply up; we just mark the wait.
      assistantBaselineRef.current = turns.filter((t) => t.role === 'assistant').length;
      awaitingSinceRef.current = Date.now();
      setAwaiting(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* corner agent — tucked away bottom-right, pops its label out on
          hover, never in the way; click opens the dock */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open the Conductor agent panel"
          title="Ask the Conductor about this screen"
          className="pressable group fixed bottom-5 right-5 z-40 flex items-center rounded-full border border-os-border-strong bg-os-surface/90 p-2.5 opacity-60 backdrop-blur hover:opacity-100"
          style={{ transitionTimingFunction: 'var(--ease)', boxShadow: 'none' }}
        >
          <SparkIcon size={17} shade="var(--text)" />
          <span
            className="max-w-0 overflow-hidden whitespace-nowrap font-mono text-[10.5px] tracking-wide text-os-muted transition-[max-width,margin-left] duration-300 group-hover:ml-2 group-hover:max-w-[130px]"
            style={{ transitionTimingFunction: 'var(--ease)' }}
          >
            Ask Conductor
          </span>
        </button>
      )}

      {/* the dock — opened from the Topbar agent icon or the corner bubble,
          resizable from its left edge, width remembered across sessions */}
      <aside
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex max-w-[92vw] flex-col border-l border-os-border-strong bg-os-surface transition-transform duration-[420ms] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ transitionTimingFunction: 'var(--ease)', width }}
      >
        {/* resize handle */}
        <div
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          title="Drag to resize"
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-os-accent/30"
          style={{ touchAction: 'none' }}
        />

        {/* one edge control: › slides the dock away. Widening is the drag
            handle's job, and two arrows on one edge read as a scrubber. */}
        <div
          className={`absolute -left-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1.5 transition-opacity duration-300 ${
            open ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <button
            data-lens="c"
            onClick={() => setOpen(false)}
            aria-label="Slide the panel away"
            title="Slide away"
            className="pressable is-dark grid h-7 w-7 place-items-center rounded-full border border-os-border-strong bg-os-surface text-os-dim"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <header className="flex items-center gap-2.5 border-b border-os-border px-4 py-3">
          <ConductorEmblem size={32} thinking={sending} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-bold tracking-[0.12em]">CONDUCTOR</span>
              {/* whatever is actually in the seat on the board — never a
                  hardcoded id, and honest when the board can't be reached */}
              <span className="truncate rounded-ctl border border-os-border px-1.5 py-px font-mono text-[9px] text-os-dim">
                {ctx?.model ?? 'model unknown'}
              </span>
            </div>
            <div className="truncate font-mono text-[9.5px] uppercase tracking-wide text-os-dim">
              seeing: {ctx?.title ?? '…'}
            </div>
          </div>
          <button
            data-lens="c"
            onClick={clearTurns}
            aria-label="Clear the transcript"
            title="Clear transcript"
            className="pressable is-dark shrink-0 rounded-ctl px-1.5 py-1 font-mono text-[9px] uppercase tracking-wider text-os-dim"
          >
            clear
          </button>
          <button
            data-lens="c"
            onClick={() => setOpen(false)}
            aria-label="Close Conductor"
            className="pressable is-dark shrink-0 rounded-ctl p-1 text-os-dim"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {ctx && (
          <p
            className="border-b border-os-border px-4 py-2 font-mono text-[10px] leading-relaxed text-os-dim"
            title={ctx.context}
          >
            {ctx.context.split('\n')[0]}
          </p>
        )}

        {/* the band: four openers for THIS screen, always up, so an empty
            transcript is never the only thing on offer */}
        <div className="border-b border-os-border px-4 py-2.5">
          <div className="mb-1.5 font-mono text-[8.5px] uppercase tracking-[0.2em] text-os-dim">
            quick actions · this screen
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(ctx?.quickActions ?? [...QUICK_ACTIONS]).map((a) => (
              <button
                key={a.label}
                data-lens="c"
                onClick={() => void send(a.prompt, a.label)}
                disabled={sending}
                className="pressable is-dark h-6 rounded-ctl border border-os-border bg-os-bg px-2 font-mono text-[9.5px] text-os-muted disabled:opacity-40"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {turns.length === 0 && (
            <div className="pt-6 text-center">
              <p className="font-mono text-[10.5px] leading-relaxed text-os-dim">
                Nothing yet.
                <br />
                ask about this screen, or pick a quick action above
              </p>
            </div>
          )}
          {turns.map((t) =>
            t.role === 'user' ? (
              <div key={t.id} className="text-right">
                <span className="inline-block max-w-[88%] break-words rounded-md-t bg-os-surface2 px-2.5 py-1.5 text-left text-[11.5px] text-os-text">
                  {t.content}
                </span>
              </div>
            ) : (
              <div key={t.id} className="text-left">
                {t.routedTo && (
                  <div className="mb-0.5 font-mono text-[9px] uppercase tracking-wider text-os-accent">
                    → {t.routedTo}
                  </div>
                )}
                <span className="inline-block max-w-[92%] whitespace-pre-wrap break-words rounded-md-t border border-os-border bg-os-bg px-2.5 py-1.5 text-[11.5px] leading-relaxed text-os-muted">
                  {t.content}
                </span>
                {/* the proof, not the prose: only turns that actually did
                    something carry one, so a receipt always means a change */}
                {t.receipt && (
                  <div className="mt-1 flex items-center gap-2 rounded-ctl border border-os-border bg-os-surface2 px-2 py-1 font-mono text-[9.5px]">
                    <span className="pop shrink-0 text-os-ok">✓</span>
                    <span className="min-w-0 flex-1 truncate text-os-muted">{t.receipt.text}</span>
                    {t.receipt.href && (
                      <a
                        data-lens="c"
                        href={t.receipt.href}
                        className="pressable is-dark shrink-0 rounded-ctl px-1 text-os-text"
                      >
                        open →
                      </a>
                    )}
                  </div>
                )}
              </div>
            ),
          )}
          {(sending || awaiting) && (
            <div className="flex items-center gap-2" data-thinking>
              <ConductorEmblem size={18} thinking />
              <Synthesizing dock since={awaiting ? awaitingSinceRef.current : undefined} />
            </div>
          )}
          {error && <p className="font-mono text-[10px] text-os-err">⚠ {error}</p>}
        </div>

        <div className="border-t border-os-border p-3">
          <ConductorComposer
            onSend={send}
            disabled={sending}
            placeholder={`Ask about ${ctx?.title ?? 'this screen'}… (/ui to dispatch a change)`}
            lastReply={[...turns].reverse().find((t) => t.role === 'assistant')?.content ?? null}
            model={ctx?.model ?? null}
            onError={setError}
          />
        </div>
      </aside>
    </>
  );
}
