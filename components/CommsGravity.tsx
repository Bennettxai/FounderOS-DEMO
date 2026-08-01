'use client';

/**
 * The /comms gravity funnel. Messages fall into three lanes — Work · Personal ·
 * Misc/Unknown — as nodes (like the department heads), colored by the priority
 * you set on the sender (red 1 · yellow 2 · green 3 · white untagged). Priority
 * is gravity: red sinks to the bottom nearest the reply box, white floats to the
 * top. Click a node to read it and reply in the answer bar below. Reply delivery
 * and priority tagging reuse the same endpoints as the old feed.
 */
import { useMemo, useState } from 'react';
import { MessageSquare, Mail, Hash, Send, Copy, ExternalLink } from 'lucide-react';
import { CONTACT_TIERS } from '@/lib/life-map';
import { commsLane, laneBottomPct, COMMS_LANES, type CommsLane } from '@/lib/comms-gravity';
import type { CommsItem, CommsSource } from '@/lib/comms';
import type { ContactTag } from '@/lib/schemas';

const SOURCE_ICON: Record<CommsSource, typeof Mail> = {
  email: Mail,
  whatsapp: MessageSquare,
  slack: Hash,
};

const UNTAGGED_COLOR = '#c7d2cc';
const tierColor = (p: CommsItem['priority']): string =>
  p ? (CONTACT_TIERS.find((t) => t.tier === p)?.color ?? UNTAGGED_COLOR) : UNTAGGED_COLOR;

const TIER_BANDS: CommsItem['priority'][] = [1, 2, 3, undefined];

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

type Node = { item: CommsItem; key: string };

export function CommsGravity({
  initialFeed,
  initialTags,
  workKeywords = [],
}: {
  initialFeed: CommsItem[];
  initialTags: ContactTag[];
  workKeywords?: string[];
}) {
  const [tags, setTags] = useState(initialTags);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  // Re-annotate priority locally so newly tagged people recolor without a reload.
  const feed = useMemo<Node[]>(() => {
    return initialFeed.map((raw, i) => {
      const hay = (raw.sender ?? raw.title).toLowerCase().trim();
      let best: number | undefined;
      for (const tag of tags) {
        const person = tag.person.toLowerCase().trim();
        if (person === hay || (person.length >= 5 && hay.includes(person))) {
          if (best === undefined || tag.tier < best) best = tag.tier;
        }
      }
      const item = { ...raw, priority: best as CommsItem['priority'] };
      return { item, key: `${raw.source}-${raw.title}-${raw.ts}-${i}` };
    });
  }, [initialFeed, tags]);

  const lanes = useMemo(() => {
    const groups: Record<CommsLane, Node[]> = { work: [], personal: [], misc: [] };
    for (const node of feed) groups[commsLane(node.item, workKeywords)].push(node);
    return groups;
  }, [feed, workKeywords]);

  const selected = feed.find((n) => n.key === selectedKey) ?? null;

  const setPriority = async (item: CommsItem, tier: number) => {
    const person = item.sender ?? item.title;
    const existing = tags.find((t) => t.person === person && t.channel === item.source);
    if (existing?.tier === tier) {
      await fetch('/api/contacts/tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person, channel: item.source }),
      });
      setTags((prev) => prev.filter((t) => !(t.person === person && t.channel === item.source)));
      return;
    }
    const tag: ContactTag = { person, channel: item.source, tag: 'manual', tier: tier as 1 | 2 | 3 };
    const res = await fetch('/api/contacts/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tag),
    });
    if (res.ok) {
      setTags((prev) => [...prev.filter((t) => !(t.person === person && t.channel === item.source)), tag]);
    }
  };

  const reply = async (item: CommsItem) => {
    const text = draft.trim();
    if (!text) return;
    setStatus(null);

    if (item.source === 'slack' && item.replyTo) {
      const res = await fetch('/api/comms/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'slack', channel: item.replyTo, text }),
      });
      const body = await res.json().catch(() => ({}));
      setStatus(body.detail ?? (res.ok ? 'sent' : 'failed'));
      if (res.ok) setDraft('');
      return;
    }

    if (item.source === 'email') {
      if (!item.replyTo) {
        setStatus('no reply address on this message');
        return;
      }
      const res = await fetch('/api/comms/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'email', account: item.account, to: item.replyTo, subject: `Re: ${item.preview}`, text }),
      }).catch(() => null);
      const body = res ? await res.json().catch(() => ({})) : {};
      if (res?.ok && body.ok) {
        setStatus('sent');
        setDraft('');
        return;
      }
      const subject = encodeURIComponent(`Re: ${item.preview}`);
      window.location.href = `mailto:${item.replyTo}?subject=${subject}&body=${encodeURIComponent(text)}`;
      setStatus(body.error ? 'SMTP unavailable — opened draft' : 'opened draft in Mail');
      return;
    }

    await navigator.clipboard.writeText(text);
    window.location.href = 'whatsapp://';
    setStatus(`copied — paste into "${item.sender}" in WhatsApp`);
  };

  const select = (key: string) => {
    setSelectedKey((cur) => (cur === key ? null : key));
    setDraft('');
    setStatus(null);
  };

  return (
    <div>
      {/* legend */}
      <div className="mb-3 flex flex-wrap items-center gap-3 font-mono text-[10px] text-os-dim">
        <span className="uppercase tracking-widest">priority sinks toward the reply bar</span>
        {CONTACT_TIERS.map((t) => (
          <span key={t.tier} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
            {t.tier} {t.respond}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: UNTAGGED_COLOR }} />
          untagged
        </span>
        <span className="ml-auto normal-case">click a node to read + reply</span>
      </div>

      {/* gravity canvas: two dividers split it into three lanes that funnel
          down to the reply bar; priority sets how far each node sinks */}
      <div className="relative">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg-t border border-os-border bg-os-border">
          {COMMS_LANES.map((lane) => {
            const nodes = lanes[lane.id];
            return (
              <div key={lane.id} className="relative h-[54vh] min-h-[380px] bg-os-surface">
                <div className="absolute inset-x-0 top-0 z-10 flex items-baseline gap-2 border-b border-os-border bg-os-surface/80 px-3 py-2 backdrop-blur">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-os-muted">
                    {lane.label}
                  </span>
                  <span className="font-mono text-[10px] text-os-dim">{nodes.length}</span>
                </div>

                {nodes.length === 0 && (
                  <div className="absolute inset-0 grid place-items-center font-mono text-[10px] text-os-dim">
                    quiet
                  </div>
                )}

                {TIER_BANDS.map((tier) => {
                  const band = nodes.filter((n) => n.item.priority === tier);
                  if (band.length === 0) return null;
                  return (
                    <div
                      key={String(tier)}
                      className="absolute inset-x-0 flex flex-wrap items-end justify-center gap-2.5 px-3"
                      style={{ bottom: `${laneBottomPct(tier)}%` }}
                    >
                      {band.map(({ item, key }) => {
                        const color = tierColor(item.priority);
                        const Icon = SOURCE_ICON[item.source];
                        const isSel = key === selectedKey;
                        return (
                          <button
                            key={key}
                            onClick={() => select(key)}
                            title={`${item.sender ?? item.title} · ${item.source} · ${relativeTime(item.ts)}`}
                            className="group relative grid h-9 w-9 shrink-0 place-items-center rounded-full border bg-os-bg transition-transform hover:scale-110"
                            style={{
                              borderColor: color,
                              boxShadow: isSel
                                ? `0 0 0 2px ${color}, 0 0 14px ${color}77`
                                : `0 0 8px ${color}33`,
                            }}
                          >
                            <Icon className="h-[15px] w-[15px]" style={{ color }} />
                            {(item.unread ?? 0) > 0 && (
                              <span
                                className="absolute -right-1 -top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full px-0.5 font-mono text-[8px] font-bold text-os-bg"
                                style={{ background: color }}
                              >
                                {item.unread}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* the answer bar — the funnel point */}
      <div className="mt-3 rounded-lg-t border border-os-border-strong bg-os-surface p-3">
        {selected ? (
          <SelectedMessage
            item={selected.item}
            draft={draft}
            status={status}
            onDraft={setDraft}
            onReply={() => reply(selected.item)}
            onPriority={(tier) => setPriority(selected.item, tier)}
          />
        ) : (
          <div className="grid place-items-center py-6 text-center font-mono text-[11px] text-os-dim">
            click a node above to read it and reply here
          </div>
        )}
      </div>
    </div>
  );
}

function SelectedMessage({
  item,
  draft,
  status,
  onDraft,
  onReply,
  onPriority,
}: {
  item: CommsItem;
  draft: string;
  status: string | null;
  onDraft: (v: string) => void;
  onReply: () => void;
  onPriority: (tier: number) => void;
}) {
  const Icon = SOURCE_ICON[item.source];
  const color = tierColor(item.priority);
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border bg-os-bg"
          style={{ borderColor: color, boxShadow: `0 0 8px ${color}44` }}
        >
          <Icon className="h-4 w-4" style={{ color }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{item.title}</div>
          <div className="font-mono text-[10px] text-os-dim">
            {item.sender ?? '—'} · {relativeTime(item.ts)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="mr-1 font-mono text-[9px] uppercase tracking-widest text-os-dim">priority</span>
          {CONTACT_TIERS.map((t) => {
            const active = item.priority === t.tier;
            return (
              <button
                key={t.tier}
                onClick={() => onPriority(t.tier)}
                title={`${t.label} — respond ${t.respond}`}
                className={`h-6 w-6 rounded font-mono text-[11px] font-bold transition-transform hover:scale-110 ${
                  active ? 'text-black' : 'text-os-muted'
                }`}
                style={{ background: active ? t.color : 'transparent', border: `1px solid ${t.color}` }}
              >
                {t.tier}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap border-l-2 border-os-border pl-3 text-xs leading-relaxed text-os-muted">
        {item.preview || '—'}
      </p>

      <div className="mt-2.5 flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onReply();
          }}
          rows={2}
          placeholder={
            item.source === 'slack'
              ? `Reply in #${item.replyTo} — sends via bot`
              : item.source === 'email'
                ? `Reply to ${item.replyTo ?? item.sender} — sends over SMTP`
                : `Reply to ${item.sender} — copies & opens WhatsApp`
          }
          className="min-w-0 flex-1 resize-y rounded-lg border border-os-border bg-os-bg px-3 py-2 text-xs text-os-text placeholder:text-os-dim focus:border-os-border-bright focus:outline-none"
        />
        <button
          onClick={onReply}
          disabled={!draft.trim()}
          className="flex shrink-0 items-center gap-1.5 self-end rounded-lg bg-os-text px-3 py-2 text-xs font-bold text-os-bg disabled:opacity-30"
        >
          {item.source === 'slack' ? <Send className="h-3 w-3" /> : item.source === 'email' ? <Send className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {item.source === 'slack' ? 'Send' : item.source === 'email' ? 'Send' : 'Copy & open'}
        </button>
      </div>
      {status && <p className="mt-1.5 font-mono text-[10px] text-os-muted">{status}</p>}
    </div>
  );
}
