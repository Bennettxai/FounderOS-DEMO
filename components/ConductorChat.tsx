'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { ConductorEmblem } from '@/components/ConductorEmblem';

/**
 * Conductor chat for the /agents page. Unlike the broadcast ConductorCard on
 * /org, this routes: a bare message goes to the best-fit agent; prefix with
 * `@agent-id` (or `@Name`) to force one. Posts to
 * POST /api/agents/conductor/chat and shows which agent answered.
 */
type Turn = { id: string; role: 'user' | 'assistant'; content: string; routedTo?: string };

export function ConductorChat({ agentNames }: { agentNames: Record<string, string> }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setTurns((t) => [...t, { id: `u-${t.length}-${text.length}`, role: 'user', content: text }]);
    setInput('');
    try {
      const res = await fetch('/api/agents/conductor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error(`conductor failed (${res.status})`);
      const body = (await res.json()) as { routedTo: string; reply: string };
      setTurns((t) => [...t, { id: `a-${t.length}`, role: 'assistant', content: body.reply, routedTo: body.routedTo }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-lg-t border border-os-border-strong bg-os-surface p-4">
      <div className="flex items-center gap-2.5">
        <ConductorEmblem size={38} thinking={sending} />
        <div className="min-w-0">
          <div className="text-[13px] font-bold tracking-[0.12em]">CONDUCTOR</div>
          <div className="font-mono text-[10px] text-os-dim">
            routes to the best-fit agent — or prefix <span className="text-os-muted">@agent-id</span> to pick one
          </div>
        </div>
      </div>

      {turns.length > 0 && (
        <div className="mt-3 max-h-60 space-y-1.5 overflow-y-auto pr-1">
          {turns.map((t) =>
            t.role === 'user' ? (
              <div key={t.id} className="text-right">
                <span className="inline-block max-w-[85%] break-words rounded-md bg-os-surface2 px-2.5 py-1 text-[11.5px] text-os-text">
                  {t.content}
                </span>
              </div>
            ) : (
              <div key={t.id} className="text-left">
                {t.routedTo && (
                  <div className="mb-0.5 font-mono text-[9.5px] uppercase tracking-wider text-os-accent">
                    → {agentNames[t.routedTo] ?? t.routedTo}
                  </div>
                )}
                <span className="inline-block max-w-[85%] break-words rounded-md bg-os-raised px-2.5 py-1 text-[11.5px] text-os-muted">
                  {t.content}
                </span>
              </div>
            ),
          )}
        </div>
      )}

      <div className="mt-3 flex gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Talk to Conductor — it routes you to the right agent"
          disabled={sending}
          className="min-w-0 flex-1 rounded-full border border-os-border bg-os-bg px-3 py-1.5 text-xs text-os-text placeholder:text-os-dim focus:border-os-border-strong focus:outline-none"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-os-border-strong bg-os-surface2 px-3 py-1.5 text-xs font-semibold text-os-text transition-opacity hover:border-os-dim disabled:opacity-40"
        >
          {sending ? <span className="font-mono text-[11px]">routing…</span> : <Send className="h-3 w-3" />}
        </button>
      </div>
      {error && <p className="mt-1.5 font-mono text-[10px] text-os-err">⚠ {error}</p>}
    </div>
  );
}
