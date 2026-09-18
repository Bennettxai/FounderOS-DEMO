'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { ConductorEmblem } from '@/components/ConductorEmblem';
import { ConductorComposer } from '@/components/ConductorComposer';
import { Synthesizing } from '@/components/Synthesizing';

/**
 * Conductor chat for the /agents page — the REAL CEO. Speaks to the board's
 * Conductor (Claude Fable 5, persistent session) through the standing cockpit
 * thread via /api/conductor/chat.
 *
 * Feels like a real Claude chat (the operator, /10): the Synthesizing
 * readout animates while the CEO run is out, the composer never locks, and
 * the thread polls CONTINUOUSLY (fast while waiting, slow at idle) so a reply
 * that lands late still appears without a reload. The composer itself
 * (multiline, attach, model chip, mic, read-aloud) is the shared
 * ConductorComposer.
 */
type Turn = { id: string; role: 'user' | 'assistant'; content: string };

type WireMsg = { id: string; body: string; authorType: 'user' | 'agent'; createdAt: string };

const WAIT_LIMIT_MS = 150_000;

export function ConductorChat({
  model = null,
  boardUrl = null,
  bare = false,
}: {
  model?: string | null;
  /** the Paperclip board URL, for the open-on-board link (null when unset) */
  boardUrl?: string | null;
  /** Rendered inside another framed panel (the /chats hub): drop the own
      border + rounding so the shell doesn't double-frame it. */
  bare?: boolean;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sending, setSending] = useState(false); // POST in flight (a second or two)
  const [awaiting, setAwaiting] = useState(false); // CEO run out, reply not landed
  const [error, setError] = useState<string | null>(null);

  const awaitingRef = useRef(false);
  awaitingRef.current = awaiting;
  const awaitingSinceRef = useRef(0);
  const assistantBaselineRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadThread = useCallback(async (): Promise<Turn[]> => {
    const res = await fetch('/api/conductor/chat', { cache: 'no-store' });
    if (!res.ok) return [];
    const body = (await res.json()) as { messages: WireMsg[] };
    return body.messages.map((m) => ({
      id: m.id,
      role: m.authorType === 'agent' ? ('assistant' as const) : ('user' as const),
      content: m.body,
    }));
  }, []);

  const applyThread = useCallback((thread: Turn[]) => {
    if (thread.length === 0) return;
    setTurns(thread.slice(-14));
    const assistants = thread.filter((t) => t.role === 'assistant').length;
    if (awaitingRef.current && assistants > assistantBaselineRef.current) {
      setAwaiting(false);
      setError(null);
    }
  }, []);

  // one continuous poll loop for the life of the widget: every 4s while a
  // reply is pending, every ~12s at idle, paused while the tab is hidden
  useEffect(() => {
    void loadThread().then(applyThread);
    let tick = 0;
    const id = setInterval(async () => {
      tick++;
      if (document.hidden) return;
      if (!awaitingRef.current && tick % 3 !== 0) return;
      applyThread(await loadThread());
      if (awaitingRef.current && Date.now() - awaitingSinceRef.current > WAIT_LIMIT_MS) {
        setAwaiting(false);
        setError('The CEO run is taking a while. Its reply lands in this thread automatically.');
      }
    }, 4000);
    return () => clearInterval(id);
  }, [loadThread, applyThread]);

  // keep the newest message (or the thinking bubble) in view
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, awaiting]);

  async function send(message: string, display: string) {
    if (sending) return;
    setSending(true);
    setError(null);
    setTurns((t) => [...t, { id: `optimistic-${Date.now()}`, role: 'user', content: display }]);
    try {
      const res = await fetch('/api/conductor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `board unreachable (${res.status})`);
      }
      // baseline from the FULL thread, not the sliced local turns — otherwise
      // the first poll "detects" a reply that landed weeks ago and the
      // synthesizing state clears instantly
      awaitingSinceRef.current = Date.now();
      setAwaiting(true);
      assistantBaselineRef.current = (await loadThread()).filter((t) => t.role === 'assistant').length;
    } catch (err) {
      setError(`Message did not reach the board: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSending(false);
    }
  }

  const lastReply = [...turns].reverse().find((t) => t.role === 'assistant')?.content ?? null;

  return (
    <div
      className={`flex h-full min-h-0 flex-col p-4 ${
        bare ? '' : 'rounded-2xl border border-os-border-strong bg-os-surface'
      }`}
    >
      <div className="flex shrink-0 items-center gap-2.5">
        <ConductorEmblem size={38} thinking={sending || awaiting} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 animate-pulse bg-os-ok" />
            <span className="text-[13px] font-bold tracking-[0.12em]">CONDUCTOR</span>
            <span className="rounded-full border border-os-border px-1.5 py-0.5 font-mono text-[8.5px] text-os-dim">
              board · {model ?? 'model unknown'}
            </span>
          </div>
          <div className="font-mono text-[10px] text-os-dim">
            the real CEO on the company board · delegates, creates tasks, reads your data
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          {awaiting && (
            <span className="font-mono text-[9.5px] uppercase tracking-wider text-os-warn">
              CEO working
            </span>
          )}
          {boardUrl && (
            <a
              href={boardUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 font-mono text-[10px] text-os-dim linky"
            >
              open on board <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {(turns.length > 0 || awaiting) && (
        <div ref={scrollRef} className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {turns.map((t) =>
            t.role === 'user' ? (
              <div key={t.id} className="text-right">
                <span className="inline-block max-w-[85%] break-words rounded-md bg-os-surface2 px-2.5 py-1 text-[11.5px] text-os-text">
                  {t.content}
                </span>
              </div>
            ) : (
              <div key={t.id} className="text-left">
                <div className="mb-0.5 font-mono text-[9.5px] uppercase tracking-wider text-os-accent">
                  → Conductor · board
                </div>
                <span className="inline-block max-w-[85%] whitespace-pre-wrap break-words rounded-md bg-os-raised px-2.5 py-1 text-[11.5px] text-os-muted">
                  {t.content}
                </span>
              </div>
            ),
          )}
          {awaiting && (
            <div className="text-left" data-thinking>
              <div className="mb-0.5 font-mono text-[9.5px] uppercase tracking-wider text-os-accent">
                → Conductor · board
              </div>
              <span className="inline-flex items-center rounded-xl bg-os-raised px-3 py-2">
                <Synthesizing since={awaitingSinceRef.current} />
              </span>
            </div>
          )}
        </div>
      )}

      {/* Claude-style composer: multiline, attach, live model chip, mic, voice */}
      <div className="mt-auto shrink-0 pt-3">
        <ConductorComposer
          onSend={send}
          disabled={sending}
          model={model}
          lastReply={lastReply}
          onError={setError}
        />
      </div>
      {error && <p className="mt-1.5 shrink-0 font-mono text-[10px] text-os-err">⚠ {error}</p>}
    </div>
  );
}
