'use client';

import { useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import type { AgentMessage } from '@/lib/schemas';

/**
 * Per-agent chat panel. Talk to one agent in an LLM-backed conversation that
 * can call the agent's read-only connectors mid-chat. Posts to
 * POST /api/agents/[id]/chat and re-renders the returned conversation.
 */
export function AgentChat({
  agentId,
  agentName,
  initialMessages = [],
}: {
  agentId: string;
  agentName: string;
  initialMessages?: AgentMessage[];
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error(`chat failed (${res.status})`);
      const body = (await res.json()) as { reply: string; messages: AgentMessage[] };
      setMessages(body.messages);
      setInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-3 border-t border-os-border pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left font-mono text-[10px] uppercase tracking-wider text-os-dim hover:text-os-muted"
      >
        <span className="flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3" /> Chat
        </span>
        <span>
          {messages.length > 0 ? `${messages.length} msg ` : ''}
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="mt-2">
          <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {messages.length === 0 && (
              <p className="font-mono text-[10.5px] leading-relaxed text-os-dim">
                Ask {agentName} anything — it reads its live connectors to answer.
              </p>
            )}
            {messages.map((m) => {
              if (m.role === 'tool') {
                return (
                  <div key={m.id} className="font-mono text-[10px] text-os-dim">
                    🔧 {m.toolCalls.map((c) => c.name).join(', ') || 'tool'}
                  </div>
                );
              }
              const isUser = m.role === 'user';
              return (
                <div key={m.id} className={isUser ? 'text-right' : 'text-left'}>
                  <span
                    className={`inline-block max-w-[85%] break-words rounded-md px-2 py-1 text-[11px] leading-relaxed ${
                      isUser ? 'bg-os-surface2 text-os-text' : 'bg-os-raised text-os-muted'
                    }`}
                  >
                    {m.content}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex gap-1.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={`Message ${agentName}…`}
              disabled={sending}
              className="min-w-0 flex-1 rounded-full border border-os-border bg-os-bg px-2.5 py-1.5 text-[11px] text-os-text placeholder:text-os-dim focus:border-os-border-strong focus:outline-none"
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="flex shrink-0 items-center rounded-full border border-os-border-strong bg-os-surface2 px-2.5 py-1.5 text-os-text transition-opacity hover:border-os-dim disabled:opacity-40"
              aria-label="Send"
            >
              {sending ? <span className="font-mono text-[10px]">…</span> : <Send className="h-3 w-3" />}
            </button>
          </div>
          {error && <p className="mt-1.5 font-mono text-[10px] text-os-err">⚠ {error}</p>}
        </div>
      )}
    </div>
  );
}
