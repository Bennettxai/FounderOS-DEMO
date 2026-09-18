'use client';

import { useEffect, useRef, useState } from 'react';
import { Archive, Clock, CornerUpLeft, Hash, Inbox, Lock, Mail, MessageSquare, Send, UserPlus, Users } from 'lucide-react';
import { Badge, Dot } from '@/components/terminal';
import { SlackClientBoard } from '@/components/SlackClientBoard';
import { useToast } from '@/components/Toaster';
import { buildCommsSources, itemsForSource, removeItem, type PaneRow, type SourceKind } from '@/lib/comms-panes';
import type { CommsLane, CommsLaneItem } from '@/lib/comms-lanes';
import type { SlackClientCard } from '@/lib/slack-clients';
import type { SlackChannel } from '@/lib/connectors/slack';

/**
 * The three-pane messaging view (interaction rebrand step 3): sources rail /
 * message list / reader, replacing the five side-by-side lane columns. The
 * old board stays on disk (CommsBoard) for an easy revert. Replies still go
 * out for real over SMTP via POST /api/comms/reply; archive and snooze are
 * optimistic local removals confirmed through the shared Toaster (undo puts
 * the previous lanes reference back — see lib/comms-panes.ts).
 */

const PRIORITY_VAR: Record<number, string> = { 1: 'var(--err)', 2: 'var(--warn)', 3: 'var(--ok)' };

function ago(iso: string, nowISO: string): string {
  const ms = Date.parse(nowISO) - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  if (ms < 60_000) return 'now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const SOURCE_ICON: Record<SourceKind, typeof Mail> = {
  all: Inbox,
  email: Mail,
  whatsapp: MessageSquare,
  'slack-clients': Users,
  'slack-channels': Hash,
};

type SendState = { phase: 'sending' | 'sent' | 'error'; detail?: string } | null;

export function CommsThreePane({
  lanes,
  slackCards,
  channels,
  nowISO,
}: {
  lanes: CommsLane[];
  slackCards: SlackClientCard[];
  channels: SlackChannel[];
  nowISO: string;
}) {
  const [laneState, setLaneState] = useState(lanes);
  const [sourceId, setSourceId] = useState('all');
  const [selId, setSelId] = useState<string | null>(null);
  const [replyNonce, setReplyNonce] = useState(0);
  const toast = useToast();
  const listRef = useRef<HTMLDivElement>(null);
  /** The last dismiss's undo, so `z` (and the emptied-source way out) can put it back. */
  const lastUndo = useRef<(() => void) | null>(null);

  const sources = buildCommsSources({ lanes: laneState, slackCards, channels });
  const source = sources.find((s) => s.id === sourceId) ?? sources[0];
  const rows = itemsForSource(laneState, sourceId);
  const selected = rows.find((r) => r.id === selId) ?? null;

  /** Optimistic removal — archive and snooze. `prev` is the undo state. */
  const dismiss = (row: PaneRow, verb: 'Archived' | 'Snoozed') => {
    const prev = laneState;
    const idx = rows.findIndex((r) => r.id === row.id);
    setLaneState(removeItem(prev, row.id));
    const next = rows[idx + 1] ?? rows[idx - 1] ?? null;
    setSelId(next ? next.id : null);
    const undo = () => { setLaneState(prev); lastUndo.current = null; };
    lastUndo.current = undo;
    toast.ok(`${verb} — ${row.sender}`, undo);
  };

  const delegate = (row: PaneRow) => {
    toast.ok(`Delegated to Comms lead — ${row.sender}`);
  };

  const move = (delta: 1 | -1) => {
    if (rows.length === 0) return;
    const idx = selected ? rows.findIndex((r) => r.id === selected.id) : -1;
    const next = rows[Math.min(rows.length - 1, Math.max(0, idx + delta))] ?? rows[0];
    setSelId(next.id);
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); move(-1); }
    else if (e.key === 'e' && selected) { e.preventDefault(); dismiss(selected, 'Archived'); }
    else if (e.key === 's' && selected) { e.preventDefault(); dismiss(selected, 'Snoozed'); }
    else if (e.key === 'd' && selected) { e.preventDefault(); delegate(selected); }
    else if (e.key === 'r' && selected) { e.preventDefault(); setReplyNonce((n) => n + 1); }
    else if (e.key === 'z') { e.preventDefault(); lastUndo.current?.(); }
    else if (/^[1-6]$/.test(e.key)) {
      // stopPropagation keeps the palette's global digit view-jumps out of it
      const s = sources[Number(e.key) - 1];
      if (s) { e.preventDefault(); e.stopPropagation(); setSourceId(s.id); setSelId(null); }
    }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setSelId(null); }
  };

  const isBoardSource = source?.kind === 'slack-clients' || source?.kind === 'slack-channels';

  return (
    <div className="relative">
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[200px_minmax(0,1fr)_380px]">
        {/* Sources rail */}
        <div className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {sources.map((s) => {
            const Icon = SOURCE_ICON[s.kind];
            const active = s.id === sourceId;
            return (
              <button
                key={s.id}
                onClick={() => { setSourceId(s.id); setSelId(null); }}
                data-lens="r"
                className={`pressable is-row flex shrink-0 items-center gap-2 rounded-ctl px-2.5 py-2 text-left ${
                  active ? 'bg-os-surface2 text-os-text' : 'text-os-muted hover:text-os-text'
                }`}
              >
                <Icon className={`h-[13px] w-[13px] shrink-0 ${active ? 'text-os-accent' : 'text-os-dim'}`} strokeWidth={1.7} />
                <span className="truncate text-[11.5px] font-semibold">{s.name}</span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  {s.unread > 0 ? <Badge tone="accent">{s.unread}</Badge> : (
                    <span className="font-mono text-[9px] text-os-dim">{s.count}</span>
                  )}
                  {s.state && s.state !== 'connected' ? <Dot state={s.state} /> : null}
                </span>
              </button>
            );
          })}
          <div className="mt-2 hidden border-t border-os-border pt-2.5 lg:block">
            <p className="font-mono text-[9px] text-os-dim">
              <kbd className="kbd">1</kbd>-<kbd className="kbd">6</kbd> switch source
            </p>
            <p className="mt-2 font-mono text-[9px] leading-relaxed text-os-dim">
              Slack · channels moved under the Slack source. Recordings has its own tab.
            </p>
          </div>
        </div>

        {isBoardSource ? (
          <div className="min-w-0 lg:col-span-2">
            {source.kind === 'slack-clients' ? (
              <SlackClientBoard cards={slackCards} nowISO={nowISO} />
            ) : (
              <ChannelGrid channels={channels} />
            )}
          </div>
        ) : (
          <>
            {/* Message list */}
            <div
              ref={listRef}
              tabIndex={0}
              onKeyDown={onListKey}
              className="max-h-[calc(100dvh-17rem)] min-h-[320px] min-w-0 overflow-y-auto rounded-tile border border-os-border bg-os-surface outline-none focus-visible:[box-shadow:inset_0_0_0_1px_rgba(242,242,242,.18)]"
            >
              <div className="sticky top-0 z-[1] flex items-baseline justify-between border-b border-os-border bg-os-surface px-3 py-2">
                <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-os-muted">
                  {source?.name ?? 'All sources'}
                </span>
                <span className="font-mono text-[9px] text-os-dim">newest first</span>
              </div>
              {rows.length === 0 ? (
                <div className="px-4 py-5 font-mono text-[10.5px] leading-relaxed text-os-dim">
                  {source && source.state && source.state !== 'connected' ? (
                    <p>{source.name} is not connected. Check /integrations.</p>
                  ) : (
                    <>
                      <p className="text-os-muted">{source?.name ?? 'This source'} is clear.</p>
                      <p className="mt-1">Everything here was archived, snoozed or delegated away.</p>
                      <div className="mt-3 flex items-center gap-2">
                        {lastUndo.current ? (
                          <button
                            onClick={() => lastUndo.current?.()}
                            className="pressable rounded-ctl border border-os-border px-2 py-1 text-[10px] text-os-muted"
                          >
                            undo last
                          </button>
                        ) : null}
                        {sourceId !== 'all' ? (
                          <button
                            onClick={() => { setSourceId('all'); setSelId(null); }}
                            className="pressable rounded-ctl border border-os-border px-2 py-1 text-[10px] text-os-muted"
                          >
                            all sources →
                          </button>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-os-border">
                  {rows.map((row) => {
                    const active = selected?.id === row.id;
                    return (
                      <div
                        key={row.id}
                        data-lens="r"
                        onClick={() => setSelId(row.id)}
                        className={`pressable is-row relative cursor-pointer px-3 py-2.5 ${active ? 'bg-os-surface2' : ''}`}
                      >
                        {active ? <span className="absolute inset-y-0 left-0 w-[2px] bg-os-accent" /> : null}
                        <div className="flex items-center gap-2">
                          {row.priority ? (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_VAR[row.priority] }} />
                          ) : null}
                          <span className="truncate text-[11.5px] font-semibold">{row.sender}</span>
                          {sourceId === 'all' ? (
                            <span className="shrink-0 font-mono text-[8.5px] uppercase tracking-[0.12em] text-os-dim">{row.laneName}</span>
                          ) : null}
                          <span className="ml-auto shrink-0 font-mono text-[9px] text-os-dim">{ago(row.ts, nowISO)}</span>
                          {row.unread ? (
                            <span className="animate-pop h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--accent)' }} />
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-os-muted">{row.preview}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Reader */}
            <Reader row={selected} laneState={laneState} replyNonce={replyNonce} nowISO={nowISO} onArchive={(r) => dismiss(r, 'Archived')} onSnooze={(r) => dismiss(r, 'Snoozed')} onDelegate={delegate} />
          </>
        )}
      </div>
    </div>
  );
}

function ChannelGrid({ channels }: { channels: SlackChannel[] }) {
  if (channels.length === 0) {
    return (
      <p className="rounded-tile border border-dashed border-os-border px-3 py-3 font-mono text-[10.5px] text-os-dim">
        No channels imported — connect the Slack bot token to pull every current channel.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
      {channels.map((c) => (
        <div key={c.id} data-lens="r" className="pressable is-row rounded-tile border border-os-border bg-os-surface px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            {c.isPrivate ? (
              <Lock className="h-[13px] w-[13px] shrink-0 text-os-dim" strokeWidth={1.7} />
            ) : (
              <Hash className="h-[13px] w-[13px] shrink-0 text-os-accent" strokeWidth={1.7} />
            )}
            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] font-semibold">{c.name}</span>
            <span className="flex shrink-0 items-center gap-1 font-mono text-[9.5px] text-os-dim">
              <Users className="h-3 w-3" />
              {c.members}
            </span>
          </div>
          <p className="mt-1 truncate text-[10px] leading-snug text-os-dim">
            {c.topic || (c.isMember ? 'member' : 'not a member')}
          </p>
        </div>
      ))}
    </div>
  );
}

/** The right pane: full message header, body, and the action footer. */
function Reader({
  row,
  laneState,
  nowISO,
  replyNonce,
  onArchive,
  onSnooze,
  onDelegate,
}: {
  row: PaneRow | null;
  laneState: CommsLane[];
  nowISO: string;
  replyNonce: number;
  onArchive: (r: PaneRow) => void;
  onSnooze: (r: PaneRow) => void;
  onDelegate: (r: PaneRow) => void;
}) {
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  const [sendState, setSendState] = useState<SendState>(null);

  // Reset the composer whenever the selection changes.
  useEffect(() => { setComposing(false); setText(''); setSendState(null); }, [row?.id]);

  const lane = row ? laneState.find((l) => l.id === row.laneId) ?? null : null;
  const canReply = Boolean(row?.replyTo && lane?.source === 'email');
  // `r` in the list bumps replyNonce; open the composer when this row can reply
  useEffect(() => {
    if (replyNonce > 0 && canReply) setComposing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyNonce]);

  const send = async (item: CommsLaneItem & { laneId: string }, body: string) => {
    if (!item.replyTo || !body.trim()) return;
    setSendState({ phase: 'sending' });
    try {
      const res = await fetch('/api/comms/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'email',
          account: item.laneId,
          to: item.replyTo,
          subject: `Re: ${item.preview}`,
          text: body,
        }),
      });
      const parsed = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && parsed.ok !== false) setSendState({ phase: 'sent' });
      else setSendState({ phase: 'error', detail: parsed.error ?? `HTTP ${res.status}` });
    } catch {
      setSendState({ phase: 'error', detail: 'network error' });
    }
  };

  if (!row) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-tile border border-os-border bg-os-surface px-6 py-8 text-center">
        <Inbox className="mb-2 h-5 w-5 text-os-dim" strokeWidth={1.5} />
        <p className="font-mono text-[10.5px] leading-relaxed text-os-dim">Select a message to read it here.</p>
        <div className="mt-3 flex max-w-[280px] flex-wrap items-center justify-center gap-x-3 gap-y-1.5 font-mono text-[9.5px] text-os-dim">
          <span><kbd className="kbd">j</kbd> <kbd className="kbd">k</kbd> move</span>
          <span><kbd className="kbd">e</kbd> archive</span>
          <span><kbd className="kbd">s</kbd> snooze</span>
          <span><kbd className="kbd">d</kbd> delegate</span>
          <span><kbd className="kbd">r</kbd> reply</span>
          <span><kbd className="kbd">z</kbd> undo</span>
          <span><kbd className="kbd">1</kbd>-<kbd className="kbd">6</kbd> source</span>
          <span><kbd className="kbd">esc</kbd> clear</span>
        </div>
      </div>
    );
  }

  return (
    <div key={row.id} className="animate-enter flex max-h-[calc(100dvh-17rem)] min-h-[320px] flex-col rounded-tile border border-os-border bg-os-surface">
      <div className="shrink-0 border-b border-os-border px-4 py-3">
        <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-os-dim">
          {row.priority ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_VAR[row.priority] }} />
          ) : null}
          <span className="truncate">{row.laneName} · {ago(row.ts, nowISO)}</span>
        </div>
        <p className="mt-1 truncate text-[13px] font-semibold">{row.sender}</p>
        <p className="mt-0.5 truncate font-mono text-[9.5px] text-os-dim">
          from {row.laneName}
          {row.replyTo ? ` · ${row.replyTo}` : ''}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <p className="text-[12px] leading-relaxed text-os-muted">{row.preview}</p>
        {composing ? (
          <div className="mt-3 rounded-tile border border-os-border bg-os-bg p-2.5">
            <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.15em] text-os-dim">
              to {row.replyTo} · re: {row.preview.slice(0, 60)}
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              autoFocus
              placeholder="Write the reply…"
              className="w-full resize-y rounded-ctl border border-os-border bg-os-surface px-2.5 py-2 text-[12px] leading-relaxed text-os-text outline-none placeholder:text-os-dim focus:border-os-border-strong"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => send(row, text)}
                disabled={!text.trim() || sendState?.phase === 'sending'}
                className="pressable flex items-center gap-1.5 rounded-ctl border border-os-border bg-os-surface px-3 py-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-widest text-os-accent hover:border-os-border-strong disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-3 w-3" />
                {sendState?.phase === 'sending' ? 'sending…' : 'send'}
              </button>
              <button
                onClick={() => setComposing(false)}
                className="pressable font-mono text-[10.5px] uppercase tracking-widest text-os-dim hover:text-os-text"
              >
                cancel
              </button>
              {sendState?.phase === 'sent' && <Badge tone="ok">sent</Badge>}
              {sendState?.phase === 'error' && <Badge tone="err">{sendState.detail ?? 'failed'}</Badge>}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-os-border px-3 py-2.5">
        <button
          onClick={() => setComposing(true)}
          disabled={!canReply}
          title={canReply ? `Reply to ${row.replyTo}` : 'No reply address on this message'}
          className="pressable flex items-center gap-1.5 rounded-ctl bg-os-text text-os-ink px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CornerUpLeft className="h-3 w-3" />
          Reply
        </button>
        <button
          onClick={() => onArchive(row)}
          className="pressable flex items-center gap-1.5 rounded-ctl px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-os-dim hover:text-os-text"
        >
          <Archive className="h-3 w-3" />
          archive
        </button>
        <button
          onClick={() => onDelegate(row)}
          className="pressable flex items-center gap-1.5 rounded-ctl px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-os-dim hover:text-os-text"
        >
          <UserPlus className="h-3 w-3" />
          delegate
        </button>
        <button
          onClick={() => onSnooze(row)}
          className="pressable flex items-center gap-1.5 rounded-ctl px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-os-dim hover:text-os-text"
        >
          <Clock className="h-3 w-3" />
          snooze
        </button>
        {row.unread ? <Badge tone="accent">unread</Badge> : null}
      </div>
    </div>
  );
}
