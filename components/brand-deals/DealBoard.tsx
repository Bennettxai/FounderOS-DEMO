'use client';

/**
 * Brand Deals — GladOS Futurism (Zentra / UI Example 1) translated to dark
 * glados tokens per the operator, 2026-08-19: the page floats as one slab, numerals
 * rule, data owns all chroma (one hue per domain), hatched stepped funnel as
 * the hero, an AI prompt bar melting out of it (wired as a live filter),
 * barber-pole meters, step-line + dot-matrix minis, exactly ONE gradient
 * insight card. Read-only: the send gate stays the operator's Telegram tap.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Sparkles, MessagesSquare, Send, RefreshCw, Lightbulb, ExternalLink } from 'lucide-react';
import { Badge, Label } from '@/components/terminal';
import { PipelineChart, useCountUp, CARET_ANIMATION, type PipelineStage } from '@/components/PipelineChart';
import type { BrandDealsSnapshot, Deal, DealEvent, DealOutcome } from '@/lib/brand-deals';

const BOT_URL = '';

function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

const BTN_SOLID =
  'inline-flex items-center gap-1.5 rounded-[9px] bg-os-accent px-3.5 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-[var(--accent-2)] disabled:opacity-50';
const BTN_GHOST =
  'inline-flex items-center gap-1.5 rounded-[9px] border border-os-border-strong bg-os-surface2 px-3.5 py-1.5 text-[12.5px] text-os-muted transition-colors hover:bg-os-surface3 hover:text-os-text disabled:opacity-50';

// One hue per data domain (anti-drift rule).
const HUE = {
  accent: 'var(--accent)', // pipeline / hero (Console violet)
  amber: 'var(--warn)', // needs approval
  cobalt: 'var(--ramp-1)', // awaiting brand (ramp blue)
  violet: 'var(--ramp-4)', // unique (ramp orchid)
  send: 'var(--send-activity)', // send activity (light ramp blue under console)
};

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

const EASE = 'cubic-bezier(.2,.7,.2,1)';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Card shell: near-bg surface, radius 20, soft dual shadow, stagger-in,
 *  2px hover lift per the Zentra motion spec. */
function Card({
  children,
  delay = 0,
  className = '',
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`bd-card relative rounded-[12px] border border-os-border bg-os-surface ${className}`}
      style={{
        animation: `bd-rise .6s ${EASE} ${delay}ms both`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Card header with a REAL kebab: refresh the data or open the approval bot. */
function CardHead({ title, onRefresh }: { title: string; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center justify-between px-6 pt-5">
      <h2 className="text-[19px] font-semibold tracking-[-0.01em]">{title}</h2>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`${title} menu`}
        className="grid h-8 w-8 place-items-center rounded-full border border-os-border text-[13px] leading-none text-os-dim transition-colors hover:border-os-border-strong hover:text-os-text"
      >
        ···
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[30]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="glass-pop absolute right-5 top-14 z-[40] w-[210px] overflow-hidden rounded-md-t border border-os-border bg-os-bg2/95 py-1 backdrop-blur">
            <button
              onClick={() => {
                setOpen(false);
                onRefresh();
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[12.5px] text-os-muted transition-colors hover:bg-[color-mix(in_oklab,var(--text)_6%,transparent)] hover:text-os-text"
            >
              <RefreshCw size={13} strokeWidth={1.7} /> Refresh data
            </button>
            <a
              href={BOT_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[12.5px] text-os-muted transition-colors hover:bg-[color-mix(in_oklab,var(--text)_6%,transparent)] hover:text-os-text"
            >
              <ExternalLink size={13} strokeWidth={1.7} /> Open approval bot
            </a>
          </div>
        </>
      )}
    </div>
  );
}

/** Status meter: label/display row over a static hatch fill with a hue glow. */
function Meter({ label, frac: rawFrac, display, hue, delay }: { label: string; frac: number; display: string; hue: string; delay: number }) {
  const frac = Number.isFinite(rawFrac) && rawFrac > 0 ? Math.max(0.02, Math.min(1, rawFrac)) : 0.02;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[13.5px] text-os-muted">{label}</span>
        <span className="text-[14px] font-semibold tabular-nums">{display}</span>
      </div>
      <div className="mt-2 h-[10px] overflow-hidden rounded-full" style={{ background: 'color-mix(in oklab, var(--text) 8%, transparent)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${frac * 100}%`,
            // static hatch + glowing bar (no motion loops — 2026-08-24):
            // leading-edge highlight layered over the stripes, hue glow around
            background: `linear-gradient(90deg, transparent 72%, color-mix(in oklab, ${hue} 60%, white) 100%), repeating-linear-gradient(45deg, ${hue}, ${hue} 6px, color-mix(in oklab, ${hue} 45%, transparent) 6px, color-mix(in oklab, ${hue} 45%, transparent) 12px)`,
            boxShadow: `0 0 14px color-mix(in oklab, ${hue} 45%, transparent), inset 0 0 5px color-mix(in oklab, ${hue} 55%, transparent)`,
            animation: `bd-meter-in 1.2s ${EASE} ${delay}ms both`,
          }}
        />
      </div>
    </div>
  );
}

type FunnelStage = PipelineStage & { usd: number; note: string; filter: string };

function StatNumber({ value }: { value: number }) {
  const v = useCountUp(value);
  return <>{v}</>;
}

function DollarStat({ value }: { value: number }) {
  const v = useCountUp(value);
  return <>{fmtUsd(v)}</>;
}

/** Stepped line over vertical pinstripes — sends binned to 15 min with the
 *  quiet slots kept, so the line has real steps. */
function StepLine({ events }: { events: DealEvent[] }) {
  const buckets = useMemo(() => {
    const stamps = events
      .filter((e) => e.kind === 'sent')
      .map((e) => new Date(e.at).getTime())
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => a - b);
    if (stamps.length === 0) return [] as Array<{ label: string; count: number }>;
    const SLOT = 15 * 60_000;
    const first = Math.floor(stamps[0] / SLOT) * SLOT - SLOT;
    const last = Math.floor(stamps[stamps.length - 1] / SLOT) * SLOT + SLOT;
    const out: Array<{ label: string; count: number }> = [];
    for (let t = first; t <= last; t += SLOT) {
      const d = new Date(t);
      out.push({
        label: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        count: stamps.filter((s) => s >= t && s < t + SLOT).length,
      });
    }
    return out;
  }, [events]);
  if (buckets.length === 0) return <div className="px-6 py-8 text-[12px] text-os-dim">No sends recorded yet.</div>;
  const W = 600;
  const H = 150;
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const stepW = W / buckets.length;
  const y = (c: number) => H - 14 - (c / max) * (H - 60);
  let path = `M 0 ${y(buckets[0].count)}`;
  buckets.forEach((b, i) => {
    path += ` H ${(i + 1) * stepW}`;
    if (i < buckets.length - 1) path += ` V ${y(buckets[i + 1].count)}`;
  });
  const peakIdx = buckets.reduce((bi, b, i) => (b.count > buckets[bi].count ? i : bi), 0);
  const area = `${path} V ${H} H 0 Z`;
  return (
    <div className="relative px-6 pb-5">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" aria-hidden="true">
        <defs>
          <pattern id="bd-pins" width="5" height="8" patternUnits="userSpaceOnUse">
            <rect width="1.2" height="8" fill={HUE.send} opacity="0.28" />
          </pattern>
          <linearGradient id="bd-pinfade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.05" />
          </linearGradient>
          <mask id="bd-pinmask">
            <rect width={W} height={H} fill="url(#bd-pinfade)" />
          </mask>
        </defs>
        <path d={area} fill="url(#bd-pins)" mask="url(#bd-pinmask)" />
        <path
          d={path}
          fill="none"
          stroke={HUE.send}
          strokeWidth="3"
          strokeLinejoin="round"
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: 1, animation: `bd-draw 1.6s ${EASE} .5s both` }}
        />
        <circle cx={(peakIdx + 0.5) * stepW} cy={y(buckets[peakIdx].count)} r="4.5" fill={HUE.send} style={{ animation: `bd-fadein .4s ${EASE} 1.9s both` }} />
      </svg>
      {/* peak pill anchored on the peak step (reference grammar) */}
      <div
        className="pointer-events-none absolute whitespace-nowrap rounded-full border border-os-border px-2.5 py-1 text-[11px] backdrop-blur"
        style={{
          left: `calc(24px + (100% - 48px) * ${(peakIdx + 0.5) / buckets.length})`,
          top: `${(y(buckets[peakIdx].count) / H) * 100}%`,
          transform: 'translate(-50%, -140%)',
          background: 'color-mix(in oklab, var(--bg) 75%, transparent)',
          animation: `bd-fadein .5s ${EASE} 2s both`,
        }}
      >
        <span className="font-semibold tabular-nums" style={{ color: HUE.send }}>
          {buckets[peakIdx].count}
        </span>{' '}
        <span className="text-os-muted">at {buckets[peakIdx].label}</span>
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10.5px] text-os-dim">
        <span>{buckets[0].label}</span>
        <span>{buckets[buckets.length - 1].label}</span>
      </div>
    </div>
  );
}

/** Waffle dot-matrix mini — chain-depth distribution. */
function DotMatrix({ deals, hue }: { deals: Deal[]; hue: string }) {
  const cols = useMemo(() => {
    const defs: Array<{ label: string; test: (n: number) => boolean }> = [
      { label: '1', test: (n) => n === 1 },
      { label: '2-3', test: (n) => n >= 2 && n <= 3 },
      { label: '4-5', test: (n) => n >= 4 && n <= 5 },
      { label: '6-9', test: (n) => n >= 6 && n <= 9 },
      { label: '10+', test: (n) => n >= 10 },
    ];
    return defs.map((d) => ({ label: d.label, count: deals.filter((x) => x.chainLen > 0 && d.test(x.chainLen)).length }));
  }, [deals]);
  const max = Math.max(...cols.map((c) => c.count), 1);
  return (
    <div className="flex items-end gap-3">
      {cols.map((c, ci) => {
        const dots = Math.max(c.count === 0 ? 0 : 1, Math.round((c.count / max) * 6));
        const strength = c.count === max ? 1 : c.count >= max * 0.6 ? 0.55 : 0.25;
        return (
          <div key={c.label} className="flex flex-col items-center gap-1.5">
            <div className="flex flex-col-reverse gap-[3px]">
              {Array.from({ length: dots }, (_, i) => (
                <span
                  key={i}
                  className="block h-[7px] w-[7px] rounded-full"
                  style={{
                    background: hue,
                    opacity: strength,
                    animation: `bd-fadein .3s ${EASE} ${900 + ci * 90 + i * 55}ms both`,
                  }}
                />
              ))}
              {dots === 0 && <span className="block h-[7px] w-[7px] rounded-full" style={{ background: hue, opacity: 0.12 }} />}
            </div>
            <span className="whitespace-nowrap font-mono text-[10px] text-os-dim">{c.label}</span>
          </div>
        );
      })}
    </div>
  );
}

type Filter = 'all' | 'approval' | 'sent' | 'unique' | 'won' | 'lost' | 'closed';

const FILTER_TO_STAGE_IDX: Record<Filter, number> = {
  all: 2,
  unique: 2,
  approval: 2,
  sent: 1,
  won: 3,
  lost: 3,
  closed: 3,
};

export function DealBoard({ initial }: { initial: BrandDealsSnapshot }) {
  const [snap, setSnap] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [armedSend, setArmedSend] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [quoteInput, setQuoteInput] = useState('');
  const pending = useRef(false);

  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    try {
      const r = await fetch('/api/brand-deals');
      if (r.ok) setSnap(await r.json());
    } catch {
      /* keep last good */
    } finally {
      pending.current = false;
    }
  }, []);

  /** POST an action; adopt the fresh snapshot the API returns. */
  const act = useCallback(async (key: string, url: string, payload: unknown): Promise<boolean> => {
    setBusy(key);
    setNotice(null);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await r.json();
      if (body.snapshot) setSnap(body.snapshot);
      if (!body.ok) setNotice(body.error ?? 'action failed');
      return Boolean(body.ok);
    } catch (e) {
      setNotice(String(e));
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  // Reset the per-deal editors when the drawer target changes.
  useEffect(() => {
    setArmedSend(false);
    setDraftText(null);
    setNotice(null);
    const d = snap.deals.find((x) => x.id === selectedId);
    setQuoteInput(d?.quotedUsd != null ? String(d.quotedUsd) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const { counts, volume } = snap;
  const approval = snap.deals.filter((d) => d.stage === 'approval');
  const selected = snap.deals.find((d) => d.id === selectedId) ?? null;
  const uniqueDeals = snap.deals.filter((d) => d.tag === 'UNIQUE');
  const totalMsgs = snap.deals.reduce((n, d) => n + d.chainLen, 0);
  const sentToday = snap.events.filter((e) => e.kind === 'sent').length;

  const slashToken = query.trim().startsWith('/') ? query.trim().split(/\s+/)[0] : null;
  const textQuery = (slashToken ? query.trim().slice(slashToken.length) : query).trim().toLowerCase();
  const matchesFilter = (d: Deal, f: Filter): boolean => {
    if (f === 'all') return true;
    if (f === 'unique') return d.tag === 'UNIQUE';
    if (f === 'won' || f === 'lost') return d.outcome === f;
    if (f === 'closed') return d.stage === 'closed';
    return d.stage === f;
  };
  const tokenFilter: Filter | null =
    slashToken === '/unique'
      ? 'unique'
      : slashToken === '/approval'
        ? 'approval'
        : slashToken === '/won'
          ? 'won'
          : slashToken === '/lost'
            ? 'lost'
            : null;
  const filtered = snap.deals.filter((d) => {
    if (!matchesFilter(d, stageFilter)) return false;
    if (tokenFilter && !matchesFilter(d, tokenFilter)) return false;
    if (textQuery) {
      const hay = `${d.brand} ${d.email} ${d.subject} ${d.tagReason} ${d.summary ?? ''}`.toLowerCase();
      if (!hay.includes(textQuery)) return false;
    }
    return true;
  });

  const quotedUsdAll = snap.deals.reduce((n, d) => n + (d.quotedUsd ?? 0), 0);
  const funnelStages: FunnelStage[] = [
    { label: 'Announced', value: snap.deals.length, usd: quotedUsdAll, note: 'every tracked deal thread', filter: 'all' },
    { label: 'Sent', value: counts.sent, usd: volume.awaitingUsd, note: 'awaiting the brand', filter: 'sent' },
    { label: 'Needs approval', value: counts.approval, usd: volume.approvalUsd, note: 'approve here or in Telegram', filter: 'approval' },
    { label: 'Closed', value: counts.closed, usd: volume.wonUsd + volume.lostUsd, note: `${counts.won} won · ${counts.lost} lost`, filter: 'closed' },
  ];
  const activeStageIdx = FILTER_TO_STAGE_IDX[stageFilter];

  return (
    <div>
      <style>{`
        @keyframes bd-rise { from { opacity: 0; transform: translateY(10px) scale(.992); } to { opacity: 1; transform: none; } }
        @keyframes bd-fadein { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bd-draw { to { stroke-dashoffset: 0; } }
        @keyframes bd-meter-in { from { width: 0; } }
        @keyframes bd-drift { from { background-position: 0% 0%; } to { background-position: 12% 8%; } }
        .bd-card { transition: transform .15s ease, border-color .15s ease; }
        .bd-card:hover { transform: translateY(-1px); border-color: var(--border-strong); }
      `}</style>

      {/* The slab: the whole view floats as one surface. */}
      <div
        className="rounded-[28px] border border-os-border p-7"
        style={{
          background: 'var(--bg-2)',
          boxShadow: '0 1px 2px rgba(0,0,0,.4), 0 24px 70px -18px rgba(0,0,0,.6)',
          animation: `bd-rise .7s ${EASE} both`,
        }}
      >
        {/* Title row */}
        <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.32em] text-os-dim">// verified sender@ · autopilot</div>
            <h1 className="text-[46px] font-semibold leading-none tracking-[-0.035em]">Deal Journeys</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="rounded-full border border-os-border px-4 py-2 text-[13px] text-os-muted">
              live · refreshes 30s
            </span>
            <span className="ghost px-2 text-[13px] text-os-dim">approve here or in</span>
            <a
              href={BOT_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-4 py-2 text-[13px] text-os-accent transition-transform hover:-translate-y-[1px]"
            >
              Telegram <ExternalLink size={12} strokeWidth={1.8} />
            </a>
            <button
              onClick={refresh}
              aria-label="Refresh"
              className="grid h-10 w-10 place-items-center rounded-full border border-os-border text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text"
            >
              <RefreshCw size={15} strokeWidth={1.7} />
            </button>
          </div>
        </div>

        {/* Hero row: funnel + volume card */}
        <div className="grid grid-cols-[2fr_1fr] gap-6 max-[1200px]:grid-cols-1">
          <Card delay={120} className="pb-4">
            <CardHead title="Pipeline" onRefresh={refresh} />
            <PipelineChart
              stages={funnelStages}
              active={activeStageIdx}
              onSelect={(stage) => setStageFilter(stage.filter as Filter)}
              searchSlot={
                <>
                  <div className="mb-2 flex items-center gap-2 px-1 text-[13px] text-os-muted">
                    <Sparkles size={14} strokeWidth={1.7} className="text-os-accent" />
                    What are you looking for?
                  </div>
                  <label className="flex items-center gap-2 rounded-[12px] border border-os-border bg-os-bg px-3.5 py-2.5">
                    <Search size={14} strokeWidth={1.7} className="shrink-0 text-os-dim" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Filter deals — try a brand name, or /unique /approval /won /lost"
                      className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-os-dim"
                    />
                    {slashToken && (
                      <span
                        className="shrink-0 rounded-md border px-2 py-0.5 font-mono text-[11.5px]"
                        style={{
                          borderColor: 'color-mix(in oklab, var(--warn) 45%, transparent)',
                          background: 'color-mix(in oklab, var(--warn) 12%, transparent)',
                          color: 'var(--warn)',
                        }}
                      >
                        {slashToken}
                      </span>
                    )}
                    <span className="h-[15px] w-[1.5px] shrink-0 bg-os-accent" style={{ animation: CARET_ANIMATION }} />
                  </label>
                </>
              }
            />
          </Card>

          <Card delay={220} className="flex flex-col">
            <CardHead title="Deal Volume" onRefresh={refresh} />
            <div className="flex flex-1 flex-col px-6 pb-6">
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <span className="text-[50px] font-semibold leading-none tracking-[-0.035em] tabular-nums">
                  <DollarStat value={volume.openUsd} />
                </span>
                {volume.wonUsd > 0 && (
                  <span className="rounded-full border border-os-border px-2.5 py-1 font-mono text-[11.5px] tabular-nums text-os-muted">
                    <span className="text-os-ok">▲</span> {fmtUsd(volume.wonUsd)} won
                  </span>
                )}
                {volume.lostUsd > 0 && (
                  <span className="rounded-full border border-os-border px-2.5 py-1 font-mono text-[11.5px] tabular-nums text-os-muted">
                    <span className="text-os-err">▼</span> {fmtUsd(volume.lostUsd)} lost
                  </span>
                )}
              </div>
              <div className="mb-5 mt-2 text-[13px] text-os-dim">
                proposed revenue across open deals · {volume.quotedDeals} of {snap.deals.length} threads quoted
              </div>
              <div className="flex flex-1 flex-col justify-around gap-6 border-t border-os-border pt-5">
                <Meter
                  label={`Needs approval (${counts.approval})`}
                  frac={volume.openUsd > 0 ? volume.approvalUsd / volume.openUsd : 0}
                  display={fmtUsd(volume.approvalUsd)}
                  hue={HUE.amber}
                  delay={500}
                />
                <Meter
                  label={`Awaiting brand (${counts.sent})`}
                  frac={volume.openUsd > 0 ? volume.awaitingUsd / volume.openUsd : 0}
                  display={fmtUsd(volume.awaitingUsd)}
                  hue={HUE.cobalt}
                  delay={650}
                />
                <Meter
                  label={`Won vs lost (${counts.won}/${counts.lost})`}
                  frac={volume.wonUsd + volume.lostUsd > 0 ? volume.wonUsd / (volume.wonUsd + volume.lostUsd) : 0}
                  display={`${fmtUsd(volume.wonUsd)} / ${fmtUsd(volume.lostUsd)}`}
                  hue={HUE.accent}
                  delay={800}
                />
              </div>
              <div className="mt-5 border-t border-os-border pt-3 text-center font-mono text-[10.5px] tracking-[0.1em] text-os-dim">
                open = approval + awaiting · {sentToday} sends in the activity window
              </div>
            </div>
          </Card>
        </div>

        {/* Second row: activity line + chain stats + THE gradient card */}
        <div className="mt-6 grid grid-cols-[1fr_1fr_1fr] gap-6 max-[1200px]:grid-cols-1">
          <Card delay={320}>
            <CardHead title="Send Activity" onRefresh={refresh} />
            <div className="px-6 pt-3">
              <span className="text-[30px] font-semibold tabular-nums tracking-[-0.03em]">
                <StatNumber value={snap.events.filter((e) => e.kind === 'sent').length} />
              </span>
              <span className="ml-2 text-[13px] text-os-dim">sends, recent activity window</span>
            </div>
            <StepLine events={snap.events} />
          </Card>

          <Card delay={420}>
            <CardHead title="Chains" onRefresh={refresh} />
            <div className="flex items-end justify-between gap-4 px-6 pb-6 pt-3">
              <div>
                <div className="text-[30px] font-semibold tabular-nums tracking-[-0.03em]">
                  <StatNumber value={totalMsgs} />
                </div>
                <div className="mt-1 text-[13px] text-os-dim">messages across cached chains</div>
                <div className="mt-4 rounded-full border border-os-border px-3 py-1 text-[12px] text-os-muted">
                  Deepest: <span className="font-semibold tabular-nums">{Math.max(...snap.deals.map((d) => d.chainLen), 0)}</span> msgs
                </div>
              </div>
              <DotMatrix deals={snap.deals} hue={HUE.cobalt} />
            </div>
          </Card>

          {/* the ONE gradient insight card */}
          <Card
            delay={520}
            className="overflow-hidden !border-transparent"
            style={{
              background: [
                'radial-gradient(120% 90% at 85% 8%, rgb(var(--tile-glow-a-rgb) / .55), transparent 60%)',
                'radial-gradient(130% 110% at 12% 92%, rgb(var(--tile-glow-b-rgb) / .55), transparent 62%)',
                'radial-gradient(110% 110% at 55% 55%, rgb(var(--tile-glow-c-rgb) / .45), transparent 70%)',
                'var(--surface)',
              ].join(', '),
              backgroundSize: '160% 160%',
              animation: `bd-rise .6s ${EASE} 520ms both, bd-drift 14s ease-in-out 1s infinite alternate`,
            }}
          >
            <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: GRAIN, mixBlendMode: 'overlay', opacity: 0.85 }} />
            <div
              className="pointer-events-none absolute -right-14 -top-16 h-56 w-56 rotate-[24deg] rounded-[36px] border border-white/25 bg-white/5"
              style={{ backdropFilter: 'blur(3px)' }}
            />
            <div className="relative flex h-full flex-col px-6 py-5 text-white">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px] backdrop-blur">
                <Lightbulb size={13} strokeWidth={1.7} /> Insights
              </span>
              <div className="mt-4 text-[64px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                <StatNumber value={counts.unique} />
              </div>
              <div className="mt-2 text-[16px] font-semibold leading-snug">
                unique deals sit outside the standard reel playbook.
              </div>
              <div className="mt-1.5 text-[12.5px] leading-relaxed text-white/75">
                {uniqueDeals
                  .slice(0, 2)
                  .map((d) => d.tagReason || d.brand)
                  .join(' · ') || 'None flagged right now.'}
              </div>
              <div className="mt-auto flex gap-1.5 pt-4">
                {Array.from({ length: 8 }, (_, i) => (
                  <span
                    key={i}
                    className="h-[3px] flex-1 rounded-full"
                    style={{ background: i < Math.round((counts.unique / Math.max(snap.deals.length, 1)) * 8) ? '#fff' : 'rgba(255,255,255,.25)' }}
                  />
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Deal list */}
        <Card delay={620} className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-5">
            <h2 className="text-[19px] font-semibold tracking-[-0.01em]">
              Deals{' '}
              <span className="ml-1 font-mono text-[12px] font-normal tabular-nums text-os-dim">
                {filtered.length} of {snap.deals.length}
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ['all', `All ${snap.deals.length}`],
                  ['approval', `Needs approval ${counts.approval}`],
                  ['sent', `Awaiting ${counts.sent}`],
                  ['unique', `Unique ${counts.unique}`],
                  ['won', `Won ${counts.won}`],
                  ['lost', `Lost ${counts.lost}`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setStageFilter(key)}
                  className={`rounded-full px-4 py-1.5 text-[12.5px] transition-colors ${
                    stageFilter === key
                      ? 'bg-os-accent font-semibold text-black'
                      : 'border border-os-border text-os-muted hover:text-os-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 border-t border-os-border">
            {filtered.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedId(d.id)}
                className="grid w-full grid-cols-[220px_1fr_auto_auto_auto] items-center gap-5 border-b border-os-border px-6 py-3.5 text-left transition-colors last:border-0 hover:bg-[color-mix(in_oklab,var(--text)_4%,transparent)] max-[1000px]:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium">{d.brand}</div>
                  <div className="truncate font-mono text-[11px] text-os-dim">{d.email}</div>
                </div>
                <div className="min-w-0 max-[1000px]:hidden">
                  <div className="truncate text-[12.5px] text-os-muted">{d.subject || d.tagReason || '—'}</div>
                </div>
                <div className="flex items-center gap-2">
                  {d.quotedUsd != null && (
                    <span
                      className="rounded-full px-2.5 py-0.5 font-mono text-[10.5px] tabular-nums tracking-[0.04em]"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                      title={d.quoteSource === 'manual' ? 'quote set manually' : 'quote parsed from the thread'}
                    >
                      {fmtUsd(d.quotedUsd)}
                    </span>
                  )}
                  {d.tag === 'UNIQUE' && (
                    <span
                      className="rounded-full px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em]"
                      style={{ background: 'color-mix(in oklab, var(--ramp-4) 18%, transparent)', color: HUE.violet }}
                    >
                      unique
                    </span>
                  )}
                  <span
                    className="rounded-full px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em]"
                    style={
                      d.outcome === 'won'
                        ? { background: 'color-mix(in oklab, var(--ok) 16%, transparent)', color: 'var(--ok)' }
                        : d.outcome === 'lost'
                          ? { background: 'color-mix(in oklab, var(--err) 16%, transparent)', color: 'var(--err)' }
                          : d.stage === 'approval'
                            ? { background: 'color-mix(in oklab, var(--warn) 15%, transparent)', color: 'var(--warn)' }
                            : d.stage === 'sent'
                              ? { background: 'color-mix(in oklab, var(--ramp-1) 15%, transparent)', color: HUE.cobalt }
                              : { background: 'color-mix(in oklab, var(--text) 8%, transparent)', color: 'var(--text-2)' }
                    }
                  >
                    {d.outcome !== 'open' ? d.outcome : d.stage === 'approval' ? 'approve' : d.stage}
                  </span>
                </div>
                <span className="inline-flex w-[46px] items-center gap-1.5 font-mono text-[11px] tabular-nums text-os-dim max-[1000px]:hidden">
                  {d.chainLen > 0 && (
                    <>
                      <MessagesSquare size={12} strokeWidth={1.7} />
                      {d.chainLen}
                    </>
                  )}
                </span>
                <span className="w-[64px] text-right font-mono text-[11px] text-os-dim max-[1000px]:hidden">{timeAgo(d.lastEventAt)}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="px-6 py-8 text-center text-[12.5px] text-os-dim">Nothing matches that filter.</div>}
          </div>
        </Card>
      </div>

      {/* Detail drawer (unchanged behavior) */}
      {selected && (
        <div className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-[2px]" onClick={() => setSelectedId(null)} aria-hidden="true" />
      )}
      {selected && (
        <aside className="glass-pop fixed right-0 top-0 z-[70] flex h-full w-[460px] max-w-[92vw] flex-col border-l border-os-border bg-os-bg2/95 backdrop-blur">
          <div className="flex items-start justify-between gap-4 border-b border-os-border px-6 py-5">
            <div className="min-w-0">
              <div className="truncate text-[17px] font-semibold">{selected.brand}</div>
              <div className="mt-0.5 truncate font-mono text-[11.5px] text-os-dim">{selected.email}</div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Badge tone={selected.tag === 'UNIQUE' ? 'accent' : 'default'}>{selected.tag.toLowerCase()}</Badge>
                <Badge tone={selected.stage === 'approval' ? 'warn' : selected.stage === 'sent' ? 'ok' : 'default'}>
                  {selected.stage === 'approval' ? 'needs approval' : selected.stage}
                </Badge>
                {selected.chainLen > 0 && <Badge tone="default">{selected.chainLen} msgs</Badge>}
              </div>
              {selected.tagReason && <div className="mt-2 text-[12px] text-os-accent/85">{selected.tagReason}</div>}
            </div>
            <button
              onClick={() => setSelectedId(null)}
              aria-label="Close"
              className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-sm-t border border-os-border text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text"
            >
              <X size={15} strokeWidth={1.8} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {notice && (
              <div className="mb-4 rounded-md-t border border-[color-mix(in_oklab,var(--err)_35%,transparent)] bg-[color-mix(in_oklab,var(--err)_9%,transparent)] px-3.5 py-2.5 text-[12px] text-os-err">
                {notice}
              </div>
            )}
            {selected.stage === 'approval' && (
              <section className="mb-6">
                <Label rule>Draft actions</Label>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!armedSend ? (
                    <button onClick={() => setArmedSend(true)} disabled={busy != null} className={BTN_SOLID}>
                      <Send size={13} strokeWidth={1.8} /> Send as the verified sender
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={async () => {
                          const ok = await act('send', '/api/brand-deals/send', { dealId: selected.id });
                          if (ok) setArmedSend(false);
                        }}
                        disabled={busy != null}
                        className={BTN_SOLID}
                      >
                        {busy === 'send' ? 'Sending...' : 'Confirm send'}
                      </button>
                      <button onClick={() => setArmedSend(false)} disabled={busy != null} className={BTN_GHOST}>
                        Cancel
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => act('skip', '/api/brand-deals/override', { dealId: selected.id, outcome: 'skipped' })}
                    disabled={busy != null}
                    className={BTN_GHOST}
                  >
                    {busy === 'skip' ? 'Skipping...' : 'Skip'}
                  </button>
                  {draftText === null && (
                    <button
                      onClick={async () => {
                        setBusy('draft-load');
                        setNotice(null);
                        try {
                          const r = await fetch(`/api/brand-deals/draft?id=${selected.id}`);
                          const b = await r.json();
                          if (b.ok) setDraftText(b.draft.body);
                          else setNotice(b.error || 'could not load the draft');
                        } catch (e) {
                          setNotice(String(e));
                        } finally {
                          setBusy(null);
                        }
                      }}
                      disabled={busy != null}
                      className={BTN_GHOST}
                    >
                      {busy === 'draft-load' ? 'Loading...' : 'Edit draft'}
                    </button>
                  )}
                </div>
                {draftText !== null && (
                  <div className="mt-3">
                    <textarea
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      rows={10}
                      className="w-full resize-y rounded-md-t border border-os-border bg-os-bg p-3 font-mono text-[12px] leading-relaxed text-os-text outline-none focus:border-os-border-strong"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={async () => {
                          const ok = await act('draft-save', '/api/brand-deals/draft', {
                            dealId: selected.id,
                            text: draftText,
                          });
                          if (ok) setDraftText(null);
                        }}
                        disabled={busy != null || !draftText.trim()}
                        className={BTN_SOLID}
                      >
                        {busy === 'draft-save' ? 'Saving...' : 'Save draft'}
                      </button>
                      <button onClick={() => setDraftText(null)} disabled={busy != null} className={BTN_GHOST}>
                        Cancel
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-os-dim">
                      Recipient, subject, and thread are locked in code — an edit can never redirect the email.
                    </p>
                  </div>
                )}
              </section>
            )}
            <section className="mb-6">
              <Label rule>Outcome</Label>
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    ['open', 'Reopen'],
                    ['won', 'Mark won'],
                    ['lost', 'Mark lost'],
                  ] as Array<[DealOutcome, string]>
                ).map(([o, label]) => (
                  <button
                    key={o}
                    onClick={() => act(`outcome-${o}`, '/api/brand-deals/override', { dealId: selected.id, outcome: o })}
                    disabled={busy != null || selected.outcome === o}
                    className={
                      selected.outcome === o
                        ? 'inline-flex items-center rounded-full bg-os-accent px-3.5 py-1.5 text-[12px] font-semibold text-black'
                        : BTN_GHOST
                    }
                  >
                    {busy === `outcome-${o}` ? '...' : label}
                  </button>
                ))}
              </div>
              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-os-muted">Quote</span>
                <input
                  value={quoteInput}
                  onChange={(e) => setQuoteInput(e.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  placeholder="USD"
                  className="w-[110px] rounded-md-t border border-os-border bg-os-bg px-2.5 py-1.5 font-mono text-[12.5px] tabular-nums outline-none focus:border-os-border-strong"
                />
                <button
                  onClick={() =>
                    act('quote', '/api/brand-deals/override', {
                      dealId: selected.id,
                      amountUsd: quoteInput ? Number(quoteInput) : null,
                    })
                  }
                  disabled={busy != null}
                  className={BTN_GHOST}
                >
                  {busy === 'quote' ? 'Saving...' : 'Set'}
                </button>
                <span className="font-mono text-[10.5px] text-os-dim">
                  {selected.quotedUsd != null
                    ? selected.quoteSource === 'manual'
                      ? 'set manually'
                      : 'parsed from the thread'
                    : 'no quote detected'}
                </span>
              </div>
              <p className="mt-2.5 text-[11px] text-os-dim">
                Outcome and quote are GladOS tracking only — they never email anyone.
              </p>
            </section>
            {selected.summary && (
              <section className="mb-6">
                <Label rule>Summary</Label>
                <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-os-muted">{selected.summary}</p>
              </section>
            )}
            <section>
              <div className="flex items-center gap-3">
                <Label>Email chain</Label>
                {selected.chain.length > 0 && (
                  <span className="font-mono text-[11.5px] tabular-nums tracking-normal text-os-muted">{selected.chain.length}</span>
                )}
                <span className="h-px flex-1 bg-os-border" />
              </div>
              {selected.chain.length === 0 && (
                <p className="mt-3 text-[12px] text-os-dim">No cached chain for this deal (sent before chain caching existed).</p>
              )}
              <div className="mt-3 flex flex-col gap-2">
                {selected.chain.map((m, i) => (
                  <details
                    key={i}
                    open={i >= selected.chain.length - 2}
                    className="rounded-md-t border border-os-border bg-os-surface px-3.5 py-2.5"
                  >
                    <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3">
                      <span className="truncate text-[12.5px] font-medium">{m.who}</span>
                      <span className="shrink-0 whitespace-nowrap font-mono text-[10.5px] text-os-dim">{m.date}</span>
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-os-muted">{m.body}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>
        </aside>
      )}
    </div>
  );
}
