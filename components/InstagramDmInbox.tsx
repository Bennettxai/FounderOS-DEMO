'use client';

import { useMemo, useState } from 'react';
import { Instagram, Send } from 'lucide-react';
import type { DmThread } from '@/lib/social';
import type { SocialDmMessage } from '@/lib/schemas';

/** Compact relative time (mirrors the /comms feed style). */
function relativeTime(iso: string, nowMs: number): string {
  const diff = nowMs - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '';
  const m = Math.round(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Regroup a flat message list into conversations, newest thread first — the
    client-side twin of lib/social dmThreads(), so a sent reply reflows the
    inbox without a round trip. */
function groupThreads(messages: SocialDmMessage[]): DmThread[] {
  const groups = new Map<string, SocialDmMessage[]>();
  for (const m of messages) {
    const arr = groups.get(m.subscriberId) ?? [];
    arr.push(m);
    groups.set(m.subscriberId, arr);
  }
  const threads: DmThread[] = [];
  for (const [subscriberId, list] of groups) {
    const chrono = [...list].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    const last = chrono[chrono.length - 1];
    threads.push({ subscriberId, name: last.name, handle: last.handle, messages: chrono, last, unreplied: last.direction === 'in' });
  }
  threads.sort((a, b) => (a.last.ts < b.last.ts ? 1 : a.last.ts > b.last.ts ? -1 : 0));
  return threads;
}

/**
 * The Instagram DM inbox: thread list + conversation pane, with a reply box that
 * sends for real via ManyChat (POST /api/social/dm/reply). Seeded until the
 * ManyChat webhook feeds it live; a message with source 'manychat' flips the
 * "live" pip. Sending is honest — a failed/unconfigured send shows inline and
 * appends nothing.
 */
export function InstagramDmInbox({ threads: initial, nowMs }: { threads: DmThread[]; nowMs: number }) {
  const [messages, setMessages] = useState<SocialDmMessage[]>(() => initial.flatMap((t) => t.messages));
  const threads = useMemo(() => groupThreads(messages), [messages]);

  const [selected, setSelected] = useState<string | null>(initial[0]?.subscriberId ?? null);
  const active = threads.find((t) => t.subscriberId === selected) ?? threads[0] ?? null;

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLive = messages.some((m) => m.source === 'manychat');

  async function send() {
    if (!active || !draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/social/dm/reply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscriberId: active.subscriberId, text: draft.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Send failed — connect ManyChat (MANYCHAT_API_KEY) to reply.');
        return;
      }
      setMessages((prev) => [body.message as SocialDmMessage, ...prev]);
      setDraft('');
    } catch {
      setError('Network error while sending.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      {/* Header — Instagram channel + honest seeded/live status. */}
      <div className="mb-4 flex items-center gap-2 border-b border-os-border pb-3">
        <div className="inline-flex gap-1 rounded-md-t border border-os-border bg-os-surface p-1">
          <span className="flex items-center gap-2 rounded-[5px] bg-[var(--accent-soft)] px-3.5 py-1.5 font-mono text-[12px] font-semibold text-os-accent">
            <Instagram className="h-3.5 w-3.5" />
            Instagram
            <span className="rounded-sm-t bg-os-accent px-1.5 py-px text-[10px] text-os-bg">{threads.length}</span>
          </span>
        </div>
        <span className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-os-dim">
          <span className={`h-1.5 w-1.5 ${isLive ? 'bg-os-ok' : 'bg-os-dim'}`} />
          {isLive ? 'live · manychat' : 'seeded · live via manychat webhook'}
        </span>
      </div>

      {threads.length === 0 ? (
        <div className="rounded-lg-t border border-os-border bg-os-surface px-4 py-8 text-center font-mono text-[12px] text-os-dim">
          No DMs yet. They appear here as ManyChat posts them to /api/webhooks/manychat.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg-t border border-os-border bg-os-border md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          {/* Thread list */}
          <div className="flex max-h-[520px] flex-col overflow-y-auto bg-os-surface">
            {threads.map((t) => {
              const on = t.subscriberId === active?.subscriberId;
              return (
                <button
                  key={t.subscriberId}
                  onClick={() => setSelected(t.subscriberId)}
                  className={`flex items-center gap-3 border-b border-os-border px-3.5 py-3 text-left transition-colors ${
                    on ? 'bg-os-surface2' : 'hover:bg-os-surface2/50'
                  }`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-os-border-strong bg-os-bg font-mono text-[11px] font-bold text-os-muted">
                    {initials(t.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-[12.5px] font-semibold text-os-text">{t.name}</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-os-dim">{relativeTime(t.last.ts, nowMs)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-[11px] text-os-dim">
                        {t.last.direction === 'out' ? 'You: ' : ''}
                        {t.last.text}
                      </span>
                      {t.unreplied && <span className="ml-auto h-1.5 w-1.5 shrink-0 bg-os-warn" title="needs reply" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Conversation + reply box */}
          <div className="flex max-h-[520px] flex-col bg-os-surface">
            {active && (
              <>
                <div className="flex items-center gap-2 border-b border-os-border px-4 py-3">
                  <Instagram className="h-3.5 w-3.5 text-os-dim" />
                  <span className="text-[12.5px] font-semibold text-os-text">{active.name}</span>
                  {active.handle && <span className="font-mono text-[11px] text-os-dim">@{active.handle}</span>}
                  {active.unreplied && (
                    <span className="ml-auto rounded-sm-t border border-os-warn/50 px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.12em] text-os-warn">
                      needs reply
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-4">
                  {active.messages.map((m) => {
                    const out = m.direction === 'out';
                    return (
                      <div key={m.id} className={`flex flex-col ${out ? 'items-end' : 'items-start'}`}>
                        <div
                          className={`max-w-[78%] rounded-md-t px-3 py-2 text-[12.5px] leading-relaxed ${
                            out ? 'bg-os-accent text-os-bg' : 'border border-os-border bg-os-surface2 text-os-text'
                          }`}
                        >
                          {m.text}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 px-1 font-mono text-[9.5px] text-os-dim">
                          {m.tag && <span className="uppercase tracking-[0.1em] text-os-accent">{m.tag}</span>}
                          <span>{relativeTime(m.ts, nowMs)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Reply box — sends for real via ManyChat. */}
                <div className="border-t border-os-border px-3 py-3">
                  {error && <p className="mb-2 font-mono text-[10.5px] text-os-err">{error}</p>}
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      rows={1}
                      placeholder={`Reply to ${active.name}…  (⌘↵ to send)`}
                      className="max-h-28 min-h-[38px] flex-1 resize-none rounded-md-t border border-os-border bg-os-bg px-3 py-2 font-mono text-[12px] text-os-text placeholder:text-os-dim focus:border-os-border-strong focus:outline-none"
                    />
                    <button
                      onClick={() => void send()}
                      disabled={sending || !draft.trim()}
                      className="flex h-[38px] items-center gap-1.5 rounded-md-t bg-os-accent px-3.5 font-mono text-[12px] font-semibold text-os-bg transition-opacity disabled:opacity-40"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {sending ? 'Sending' : 'Send'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
