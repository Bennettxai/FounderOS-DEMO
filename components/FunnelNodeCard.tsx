'use client';

/**
 * The pinned lead dossier — one card, both canvases (network + radial), so a
 * clicked node answers Alex's three questions in order: WHO is this
 * (person · role @ company), WHERE did they come from (acquisition segment +
 * the actual entry touch), and HOW do I reach them (full contact values, not
 * just icons). Status strip + touch trail keep the pipeline context, and the
 * last message exchanged is fetched live the moment the card pins.
 */
import { useEffect, useState } from 'react';
import { CHANNEL_GLYPHS, FUNNEL_STAGES, STALL_DAYS, type FunnelSpaceNode } from '@/lib/funnel';
import { originOf } from '@/lib/funnel-radial';
import { usd } from '@/lib/funnel-viz';
import type { CommsItem } from '@/lib/comms';

const RELATIONSHIP_COLOR = {
  hot: 'var(--funnel-hot)',
  warm: 'var(--funnel-warm)',
  cold: 'var(--funnel-cold)',
} as const;

type LastMsg =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'none' }
  | { kind: 'found'; item: CommsItem };

function useLastMessage(node: FunnelSpaceNode): LastMsg {
  const [msg, setMsg] = useState<LastMsg>({ kind: 'loading' });
  useEffect(() => {
    let alive = true;
    setMsg({ kind: 'loading' });
    const params = new URLSearchParams({ name: node.person ?? node.name });
    if (node.email) params.set('email', node.email);
    fetch(`/api/funnel/lead-message?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { message: CommsItem | null; unavailable: boolean } | null) => {
        if (!alive) return;
        if (!body || body.unavailable) setMsg({ kind: 'unavailable' });
        else if (body.message) setMsg({ kind: 'found', item: body.message });
        else setMsg({ kind: 'none' });
      })
      .catch(() => alive && setMsg({ kind: 'unavailable' }));
    return () => {
      alive = false;
    };
  }, [node.id, node.person, node.name, node.email]);
  return msg;
}

const agoDays = (ts: string): string => {
  const d = Math.max(0, Math.floor((Date.now() - Date.parse(ts)) / 86_400_000));
  return d === 0 ? 'today' : `${d}d ago`;
};

function BlockLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 font-mono text-[8.5px] uppercase tracking-[0.24em] text-os-dim">{children}</div>
  );
}

/** One contact line: the full value, readable and clickable — not just an icon. */
function ContactLine({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div className="flex items-baseline gap-2 font-mono text-[10.5px]">
      <span className="w-10 shrink-0 uppercase tracking-wide text-os-dim">{label}</span>
      <a
        href={href}
        target={href.startsWith('http') ? '_blank' : undefined}
        rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
        className="min-w-0 truncate text-os-accent hover:underline"
        title={value}
      >
        {value}
      </a>
    </div>
  );
}

export function FunnelNodeCard({ node, onClose }: { node: FunnelSpaceNode; onClose: () => void }) {
  const origin = originOf(node);
  const lastMsg = useLastMessage(node);
  const who = node.person ?? node.name;
  const dealDiffers = node.person !== null && node.person !== node.name;
  const digits = node.phone?.replace(/[^\d]/g, '');
  const isGhl = node.url?.includes('gohighlevel');
  const stageLabel = FUNNEL_STAGES.find((s) => s.id === node.status)?.label;

  return (
    // top-11 keeps the canvas's fullscreen button (top-1) clickable above it
    <div className="absolute right-3 top-11 z-10 flex max-h-[calc(100%-56px)] w-[340px] flex-col overflow-y-auto rounded-md-t border border-os-border-strong bg-os-surface2 p-3">
      {/* WHO — the person, not the deal title */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold">{who}</div>
          {(node.role || node.company) && (
            <div className="mt-0.5 truncate text-[11px] text-os-muted" title={`${node.role ?? ''}${node.role && node.company ? ' @ ' : ''}${node.company ?? ''}`}>
              {node.role}
              {node.role && node.company ? ' @ ' : ''}
              {node.company}
            </div>
          )}
          <div className="mt-0.5 truncate font-mono text-[9.5px] uppercase tracking-wide text-os-dim">
            {node.venture === 'vantage' ? 'Vantage' : 'Launchpad Cohort'} · {stageLabel}
            {dealDiffers ? ` · deal: ${node.name}` : ''}
          </div>
        </div>
        <button onClick={onClose} className="shrink-0 font-mono text-[12px] text-os-dim hover:text-os-text" aria-label="Close">
          ×
        </button>
      </div>

      {/* status strip */}
      <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-os-border pt-2 font-mono text-[10px]">
        <div>
          <div className="text-os-dim">likelihood</div>
          <div className="text-[12px] text-os-text">{node.likelihood}%</div>
        </div>
        <div>
          <div className="text-os-dim">relationship</div>
          <div className="text-[12px] capitalize" style={{ color: RELATIONSHIP_COLOR[node.relationship] }}>{node.relationship}</div>
        </div>
        <div>
          <div className="text-os-dim">quiet for</div>
          <div
            className="text-[12px]"
            style={
              node.decay > 0
                ? { color: `color-mix(in oklab, var(--err) ${Math.round(Math.sqrt(node.decay) * 85)}%, var(--text))` }
                : node.state === 'stalled'
                  ? { color: 'var(--err)' }
                  : undefined
            }
          >
            {node.daysSinceLastTouch}d
          </div>
        </div>
      </div>
      {node.state === 'converted' && node.product && (
        <div className="mt-2 rounded-sm-t border border-[color-mix(in_oklab,var(--ok)_35%,transparent)] bg-[color-mix(in_oklab,var(--ok)_9%,transparent)] px-2 py-1 font-mono text-[10px] text-os-ok">
          {node.product} · {usd(node.amountUsd ?? 0)}
        </div>
      )}
      {node.state !== 'converted' && (node.amountUsd ?? 0) > 0 && (
        <div className="mt-2 font-mono text-[10px] text-os-muted">deal value · {usd(node.amountUsd ?? 0)}</div>
      )}
      {node.state === 'stalled' && (
        <div className="mt-2 rounded-sm-t border border-[color-mix(in_oklab,var(--err)_35%,transparent)] bg-[color-mix(in_oklab,var(--err)_9%,transparent)] px-2 py-1 font-mono text-[10px] text-os-err">
          stalled — quiet past {STALL_DAYS}d before converting
        </div>
      )}

      {/* WHERE THEY CAME FROM */}
      <div className="mt-2.5 border-t border-os-border pt-2">
        <BlockLabel>origin</BlockLabel>
        <div className="flex items-baseline gap-2 text-[11px]">
          <span className="shrink-0 font-semibold text-os-text">{origin.segment}</span>
          {origin.at && <span className="shrink-0 font-mono text-[9.5px] text-os-dim">{origin.at}</span>}
          {origin.source && (
            <span className="shrink-0 rounded-sm-t border border-os-border px-1 font-mono text-[8.5px] uppercase tracking-wide text-os-dim">
              {origin.source}
            </span>
          )}
        </div>
        {origin.entry && (
          <div className="mt-0.5 truncate text-[10.5px] text-os-muted" title={origin.entry}>
            {origin.entry}
          </div>
        )}
      </div>

      {/* HOW TO REACH THEM */}
      <div className="mt-2.5 border-t border-os-border pt-2">
        <BlockLabel>contact</BlockLabel>
        <div className="flex flex-col gap-1">
          {node.email && <ContactLine label="email" value={node.email} href={`mailto:${node.email}`} />}
          {node.phone && <ContactLine label="phone" value={node.phone} href={`tel:${node.phone}`} />}
          {node.linkedin && (
            <ContactLine label="li" value={node.linkedin.replace(/^https?:\/\/(www\.)?/, '')} href={node.linkedin} />
          )}
          {(node.email || node.phone || node.url) && (
            <div className="mt-0.5 flex items-center gap-3 font-mono text-[9.5px] uppercase tracking-wide">
              {digits && (
                <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" className="text-os-muted hover:text-os-accent">
                  whatsapp
                </a>
              )}
              {node.phone && (
                <a href={`sms:${node.phone}`} className="text-os-muted hover:text-os-accent">
                  sms
                </a>
              )}
              {node.url && (
                <a href={node.url} target="_blank" rel="noopener noreferrer" className="text-os-muted hover:text-os-accent">
                  {isGhl ? 'open in GHL ↗' : 'open in Attio ↗'}
                </a>
              )}
            </div>
          )}
          {!node.email && !node.phone && !node.linkedin && !node.url && (
            <div className="font-mono text-[10px] text-os-dim">no contact info on record</div>
          )}
        </div>
        {/* last thread with them, fetched live on pin */}
        <div className="mt-1.5 flex items-baseline gap-2 font-mono text-[9.5px]">
          <span className="shrink-0 uppercase tracking-wide text-os-dim">last msg</span>
          {lastMsg.kind === 'loading' && <span className="text-os-dim">checking comms…</span>}
          {lastMsg.kind === 'unavailable' && <span className="text-os-dim">comms feed unavailable</span>}
          {lastMsg.kind === 'none' && <span className="text-os-dim">no thread on record</span>}
          {lastMsg.kind === 'found' && (
            <span className="min-w-0 truncate text-os-muted" title={lastMsg.item.preview}>
              via {lastMsg.item.source} · {agoDays(lastMsg.item.ts)} · “{lastMsg.item.preview.slice(0, 60)}”
            </span>
          )}
        </div>
      </div>

      {/* the raw trail */}
      <div className="mt-2.5 border-t border-os-border pt-2">
        <BlockLabel>journey</BlockLabel>
        <ol className="flex flex-col gap-1">
          {node.touches.map((t) => (
            <li key={t.id} className="flex items-baseline gap-1.5 text-[11px] text-os-muted">
              <span className="shrink-0 font-mono text-[10px] text-os-accent">{CHANNEL_GLYPHS[t.channel] ?? '·'}</span>
              <span className="min-w-0 flex-1 truncate" title={t.label}>{t.label}</span>
              <span className="shrink-0 font-mono text-[9px] text-os-dim">{t.at.slice(5)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
