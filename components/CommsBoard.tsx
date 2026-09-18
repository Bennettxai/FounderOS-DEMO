'use client';

import { useEffect, useState } from 'react';
import { CornerUpLeft, Mail, Maximize2, MessageSquare, Send, X, type LucideIcon } from 'lucide-react';
import { Badge, Dot } from '@/components/terminal';
import type { CommsLane, CommsLaneItem, LaneSource } from '@/lib/comms-lanes';

/**
 * The separated messaging board: one column per source (the four inboxes and
 * WhatsApp), each with its own honest connector status. An email lane expands
 * into a full reader where any message with a sender address can be answered —
 * replies send for real over SMTP via POST /api/comms/reply. Relative time is
 * computed against a server-passed `nowISO` so server and client agree.
 */

const LANE_ICON: Record<LaneSource, LucideIcon> = { email: Mail, whatsapp: MessageSquare };
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

function ItemRow({ item, nowISO }: { item: CommsLaneItem; nowISO: string }) {
  return (
    <div data-lens="r" className="pressable is-row px-3 py-2.5">
      <div className="flex items-center gap-2">
        {item.priority ? (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_VAR[item.priority] }} />
        ) : null}
        <span className="truncate text-[11.5px] font-semibold">{item.sender}</span>
        <span className="ml-auto shrink-0 font-mono text-[9px] text-os-dim">{ago(item.ts, nowISO)}</span>
        {item.unread ? <span className="animate-pop h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--accent)' }} /> : null}
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-os-muted">{item.preview}</p>
    </div>
  );
}

type SendState = { id: string; phase: 'sending' | 'sent' | 'error'; detail?: string } | null;

/** One message inside the expanded inbox reader, with its reply composer. */
function ReaderRow({
  lane,
  item,
  nowISO,
  sendState,
  onSend,
}: {
  lane: CommsLane;
  item: CommsLaneItem;
  nowISO: string;
  sendState: SendState;
  onSend: (item: CommsLaneItem, text: string) => void;
}) {
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  const mine = sendState?.id === item.id ? sendState : null;

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2">
        {item.priority ? (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_VAR[item.priority] }} />
        ) : null}
        <span className="truncate text-[12.5px] font-semibold">{item.sender}</span>
        {item.replyTo ? <span className="truncate font-mono text-[10px] text-os-dim">{item.replyTo}</span> : null}
        <span className="ml-auto shrink-0 font-mono text-[9.5px] text-os-dim">{ago(item.ts, nowISO)}</span>
        {item.unread ? <span className="animate-pop h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--accent)' }} /> : null}
      </div>
      <p className="mt-1 text-[12px] leading-snug text-os-muted">{item.preview}</p>

      {item.replyTo ? (
        composing ? (
          <div className="mt-2.5 rounded-xl border border-os-border bg-os-bg p-2.5">
            <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.15em] text-os-dim">
              to {item.replyTo} · re: {item.preview.slice(0, 60)}
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Write the reply…"
              className="w-full resize-y rounded-ctl border border-os-border bg-os-surface px-2.5 py-2 text-[12px] leading-relaxed text-os-text outline-none placeholder:text-os-dim focus:border-os-border-strong"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => onSend(item, text)}
                disabled={!text.trim() || mine?.phase === 'sending'}
                className="pressable flex items-center gap-1.5 rounded-ctl border border-os-border bg-os-surface px-3 py-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-widest text-os-accent hover:border-os-border-strong disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-3 w-3" />
                {mine?.phase === 'sending' ? 'sending…' : 'send'}
              </button>
              <button
                onClick={() => setComposing(false)}
                className="pressable font-mono text-[10.5px] uppercase tracking-widest text-os-dim hover:text-os-text"
              >
                cancel
              </button>
              {mine?.phase === 'sent' && <Badge tone="ok">sent</Badge>}
              {mine?.phase === 'error' && <Badge tone="err">{mine.detail ?? 'failed'}</Badge>}
            </div>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => setComposing(true)}
              className="pressable flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-os-dim hover:text-os-accent"
            >
              <CornerUpLeft className="h-3 w-3" />
              reply
            </button>
            {mine?.phase === 'sent' && <Badge tone="ok">sent</Badge>}
          </div>
        )
      ) : null}
    </div>
  );
}

/** The expanded inbox: every message full-width, replyable in place. */
function InboxReader({
  lane,
  nowISO,
  onClose,
}: {
  lane: CommsLane;
  nowISO: string;
  onClose: () => void;
}) {
  const [sendState, setSendState] = useState<SendState>(null);

  const send = async (item: CommsLaneItem, text: string) => {
    if (!item.replyTo || !text.trim()) return;
    setSendState({ id: item.id, phase: 'sending' });
    try {
      const res = await fetch('/api/comms/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'email',
          account: lane.id,
          to: item.replyTo,
          subject: `Re: ${item.preview}`,
          text,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok !== false) setSendState({ id: item.id, phase: 'sent' });
      else setSendState({ id: item.id, phase: 'error', detail: body.error ?? `HTTP ${res.status}` });
    } catch {
      setSendState({ id: item.id, phase: 'error', detail: 'network error' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className="animate-enter flex max-h-[84vh] w-full max-w-3xl flex-col overflow-hidden rounded-tile border border-os-border-strong bg-os-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-os-border px-5 py-3">
          <Mail className="h-4 w-4 shrink-0 text-os-accent" strokeWidth={1.7} />
          <span className="text-[13px] font-semibold">{lane.name}</span>
          <span className="font-mono text-[10px] text-os-dim">{lane.detail}</span>
          <span className="ml-auto flex items-center gap-2.5">
            {lane.unread > 0 ? <Badge tone="accent">{lane.unread} unread</Badge> : null}
            <button onClick={onClose} aria-label="Close" className="pressable text-os-dim hover:text-os-text">
              <X className="h-4 w-4" />
            </button>
          </span>
        </div>
        <div className="flex flex-col divide-y divide-os-border overflow-y-auto">
          {lane.items.length === 0 ? (
            <p className="px-4 py-5 font-mono text-[10.5px] text-os-dim">Nothing here right now.</p>
          ) : (
            lane.items.map((it) => (
              <ReaderRow key={it.id} lane={lane} item={it} nowISO={nowISO} sendState={sendState} onSend={send} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function LaneColumn({ lane, nowISO, onExpand }: { lane: CommsLane; nowISO: string; onExpand?: () => void }) {
  const Icon = LANE_ICON[lane.source];
  const ok = lane.state === 'connected';
  return (
    <div className="flex w-[248px] shrink-0 flex-col rounded-2xl border border-os-border bg-os-surface lg:w-auto">
      <div className="flex items-center gap-2 border-b border-os-border px-3 py-2.5">
        <Icon className={`h-[14px] w-[14px] shrink-0 ${ok ? 'text-os-accent' : 'text-os-dim'}`} strokeWidth={1.7} />
        <span className="truncate text-[12px] font-semibold">{lane.name}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {lane.unread > 0 ? <Badge tone="accent">{lane.unread}</Badge> : null}
          <Dot state={lane.state} pulse />
          {onExpand ? (
            <button
              onClick={onExpand}
              title={`Expand ${lane.name} — read + reply`}
              aria-label={`Expand ${lane.name}`}
              className="pressable text-os-dim hover:text-os-accent"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          ) : null}
        </span>
      </div>
      <div className="flex max-h-[calc(100dvh-19rem)] min-h-[320px] flex-col divide-y divide-os-border overflow-y-auto">
        {lane.items.length === 0 ? (
          <p className="px-3 py-4 font-mono text-[10px] leading-relaxed text-os-dim">
            {ok ? 'Nothing here right now.' : lane.detail}
          </p>
        ) : (
          lane.items.map((it) => <ItemRow key={it.id} item={it} nowISO={nowISO} />)
        )}
      </div>
    </div>
  );
}

export function CommsBoard({ lanes, nowISO }: { lanes: CommsLane[]; nowISO: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expanded = lanes.find((l) => l.id === expandedId) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpandedId(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-3 lg:grid lg:min-w-0 lg:grid-cols-5">
        {lanes.map((lane) => (
          <LaneColumn
            key={lane.id}
            lane={lane}
            nowISO={nowISO}
            onExpand={lane.source === 'email' ? () => setExpandedId(lane.id) : undefined}
          />
        ))}
      </div>
      {expanded ? <InboxReader lane={expanded} nowISO={nowISO} onClose={() => setExpandedId(null)} /> : null}
    </div>
  );
}
