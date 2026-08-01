'use client';

/**
 * Notion-style agent dock: a slim expand tab on the right edge of every view
 * opens a vertical Conductor panel that knows what screen you're on. The
 * panel fetches /api/conductor/context for the current route, shows what it
 * sees, and sends that context with every message so the agent can talk
 * about "this screen" concretely. Chat itself is the existing conductor
 * pipeline (routes to the best-fit agent, @agent-id to force one).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, Send, X } from 'lucide-react';
import { SparkIcon } from '@/components/SparkIcon';
import { ConductorEmblem } from '@/components/ConductorEmblem';

type Turn = { id: string; role: 'user' | 'assistant'; content: string; routedTo?: string };
type ScreenCtx = { title: string; context: string };

/** Cross-component open signal — the Topbar agent icon fires this. */
export const CONDUCTOR_OPEN_EVENT = 'conductor:open';

const WIDTH_KEY = 'alex-conductor-w';
const MIN_W = 300;
const MAX_W = 760;
const clampW = (w: number) => Math.min(MAX_W, Math.max(MIN_W, Math.round(w)));

export function ConductorPanel() {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  // Alex controls the size: drag the left edge; the width persists
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
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setTurns((t) => [...t, { id: `u-${t.length}`, role: 'user', content: text }]);
    setInput('');
    try {
      const res = await fetch('/api/agents/conductor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: ctx ? `Screen: ${ctx.title}\n${ctx.context}` : undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `conductor failed (${res.status})`);
      }
      const body = (await res.json()) as { routedTo: string; reply: string };
      setTurns((t) => [...t, { id: `a-${t.length}`, role: 'assistant', content: body.reply, routedTo: body.routedTo }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  const persistWidth = (w: number) => {
    const next = clampW(w);
    widthRef.current = next;
    setWidth(next);
    try {
      localStorage.setItem(WIDTH_KEY, String(next));
    } catch {
      /* fine */
    }
  };

  return (
    <>
      {/* corner agent — tucked away bottom-right, pops its label out on
          hover, never in the way; click opens the dock */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open the Conductor agent panel"
          title="Ask the Conductor about this screen"
          className="group fixed bottom-5 right-5 z-40 flex items-center rounded-full border border-os-border-strong bg-os-surface/90 p-2.5 opacity-60 backdrop-blur transition-all duration-300 hover:opacity-100 hover:pr-3.5"
          style={{ transitionTimingFunction: 'var(--ease)', boxShadow: 'none' }}
        >
          <SparkIcon size={17} shade="var(--text)" />
          <span
            className="max-w-0 overflow-hidden whitespace-nowrap font-mono text-[10.5px] tracking-wide text-os-muted transition-all duration-300 group-hover:ml-2 group-hover:max-w-[130px]"
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

        {/* edge arrows: ‹ widens the panel a step, › slides it away — hidden
            while closed so they don't poke past the off-screen edge */}
        <div
          className={`absolute -left-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1.5 transition-opacity duration-300 ${
            open ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <button
            onClick={() => persistWidth(widthRef.current + 140)}
            disabled={width >= MAX_W}
            aria-label="Widen the panel"
            title="Wider"
            className="grid h-7 w-7 place-items-center rounded-full border border-os-border-strong bg-os-surface text-os-dim shadow-sm transition-colors hover:text-os-accent disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setOpen(false)}
            aria-label="Slide the panel away"
            title="Slide away"
            className="grid h-7 w-7 place-items-center rounded-full border border-os-border-strong bg-os-surface text-os-dim shadow-sm transition-colors hover:text-os-text"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <header className="flex items-center gap-2.5 border-b border-os-border px-4 py-3">
          <ConductorEmblem size={32} thinking={sending} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-bold tracking-[0.12em]">CONDUCTOR</div>
            <div className="truncate font-mono text-[9.5px] uppercase tracking-wide text-os-dim">
              seeing: {ctx?.title ?? '…'}
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close Conductor"
            className="shrink-0 rounded-sm-t p-1 text-os-dim transition-colors hover:text-os-text"
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

        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {turns.length === 0 && (
            <p className="pt-6 text-center font-mono text-[10.5px] leading-relaxed text-os-dim">
              Ask about this screen — the Conductor sees what you see
              <br />
              and routes to the best-fit agent (@agent-id to force one).
            </p>
          )}
          {turns.map((t) =>
            t.role === 'user' ? (
              <div key={t.id} className="text-right">
                <span className="inline-block max-w-[88%] break-words rounded-md bg-os-surface2 px-2.5 py-1.5 text-left text-[11.5px] text-os-text">
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
                <span className="inline-block max-w-[92%] whitespace-pre-wrap break-words rounded-md border border-os-border bg-os-bg px-2.5 py-1.5 text-[11.5px] leading-relaxed text-os-muted">
                  {t.content}
                </span>
              </div>
            ),
          )}
          {sending && (
            <div className="flex items-center gap-2">
              <ConductorEmblem size={18} thinking />
              <span className="font-mono text-[10px] text-os-dim">routing…</span>
            </div>
          )}
          {error && <p className="font-mono text-[10px] text-os-err">⚠ {error}</p>}
        </div>

        <div className="flex gap-1.5 border-t border-os-border p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder={`Ask about ${ctx?.title ?? 'this screen'}…`}
            disabled={sending}
            className="min-w-0 flex-1 rounded-full border border-os-border bg-os-bg px-3 py-1.5 text-xs text-os-text placeholder:text-os-dim focus:border-os-border-strong focus:outline-none"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            aria-label="Send"
            className="flex shrink-0 items-center rounded-full border border-os-border-strong bg-os-surface2 px-3 py-1.5 text-os-text transition-opacity hover:border-os-dim disabled:opacity-40"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </aside>
    </>
  );
}
