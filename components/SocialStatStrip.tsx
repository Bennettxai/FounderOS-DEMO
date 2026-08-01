'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, MessageSquare, TrendingDown, TrendingUp, X } from 'lucide-react';
import type { SocialGrowth } from '@/lib/schemas';
import type { DmThread } from '@/lib/social';
import { InstagramDmInbox } from '@/components/InstagramDmInbox';

type Range = 7 | 30 | 60 | 'all';
const RANGES: Range[] = [7, 30, 60, 'all'];
const RANGE_LABEL: Record<string, string> = { '7': '7d', '30': '30d', '60': '60d', all: 'All' };
const RANGE_KEY: Record<string, keyof SocialGrowth> = { '7': 'd7', '30': 'd30', '60': 'd60', all: 'allTime' };

type SeriesPoint = { date: string; value: number };
type LabelledSeries = { key: string; label: string; color: string; points: SeriesPoint[] };

function fmtPct(n: number | null): string {
  if (n === null || Number.isNaN(n)) return '—';
  const r = Math.abs(n) < 10 ? n.toFixed(2) : n.toFixed(1);
  return `${n >= 0 ? '+' : ''}${r}%`;
}
function fmtNum(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('en-US');
}
function pctClass(n: number | null): string {
  return n === null ? 'text-os-muted' : n >= 0 ? 'text-os-ok' : 'text-os-err';
}

function dateMinusDays(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function inRange(points: SeriesPoint[], range: Range): SeriesPoint[] {
  if (range === 'all' || points.length === 0) return points;
  const start = dateMinusDays(points[points.length - 1].date, range);
  return points.filter((p) => p.date >= start);
}
function growthOf(points: SeriesPoint[]): number | null {
  if (points.length < 2 || points[0].value === 0) return null;
  return ((points[points.length - 1].value - points[0].value) / points[0].value) * 100;
}

/** Range chips: [7d][30d][60d][All] */
function RangeChips({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex gap-1">
      {RANGES.map((r) => (
        <button
          key={String(r)}
          onClick={(e) => {
            e.stopPropagation();
            onChange(r);
          }}
          className={`rounded-sm-t border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] transition-colors ${
            value === r
              ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-os-accent'
              : 'border-os-border text-os-dim hover:border-os-border-strong hover:text-os-muted'
          }`}
        >
          {RANGE_LABEL[String(r)]}
        </button>
      ))}
    </div>
  );
}

/** Minimal multi-series line chart over the selected range. */
function LineChart({ series, range }: { series: LabelledSeries[]; range: Range }) {
  const W = 820;
  const H = 280;
  const pad = { l: 8, r: 8, t: 14, b: 18 };
  const ranged = series.map((s) => ({ ...s, points: inRange(s.points, range) }));
  const allPts = ranged.flatMap((s) => s.points);
  if (allPts.length === 0) return <div className="py-16 text-center font-mono text-xs text-os-dim">no history in range</div>;

  const dates = [...new Set(allPts.map((p) => p.date))].sort();
  const xByDate = new Map(dates.map((d, i) => [d, i]));
  const xMax = Math.max(1, dates.length - 1);
  const vals = allPts.map((p) => p.value);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const x = (d: string) => pad.l + (xByDate.get(d)! / xMax) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-64 w-full">
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + g * (H - pad.t - pad.b)} y2={pad.t + g * (H - pad.t - pad.b)} stroke="var(--border)" strokeWidth="1" />
      ))}
      {ranged.map((s) =>
        s.points.length === 0 ? null : (
          <g key={s.key}>
            <polyline
              points={s.points.map((p) => `${x(p.date)},${y(p.value)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={x(s.points[s.points.length - 1].date)} cy={y(s.points[s.points.length - 1].value)} r="3" fill={s.color} />
          </g>
        ),
      )}
    </svg>
  );
}

function StatPopout({
  metric,
  onClose,
}: {
  metric: 'audience' | 'dms';
  onClose: () => void;
}) {
  const [data, setData] = useState<LabelledSeries[] | null>(null);
  const [range, setRange] = useState<Range>(30);
  const [active, setActive] = useState<Set<string>>(new Set(metric === 'audience' ? ['all'] : ['total']));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/social/series?metric=${metric}`)
      .then((r) => r.json())
      .then((body: { series: LabelledSeries[] }) => {
        if (!cancelled) setData(body.series ?? []);
      })
      .catch(() => !cancelled && setData([]));
    return () => {
      cancelled = true;
    };
  }, [metric]);

  const shown = useMemo(() => (data ?? []).filter((s) => active.has(s.key)), [data, active]);
  const title = metric === 'audience' ? 'Audience growth' : 'Total DMs';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-os-bg/70 p-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-3xl overflow-hidden rounded-lg-t border border-os-border-strong bg-os-surface shadow-[0_24px_80px_-16px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-os-border px-5 py-3.5">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold">{title}</h2>
            <RangeChips value={range} onChange={setRange} />
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-sm-t border border-os-border text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-5">
          {data === null ? (
            <div className="py-20 text-center font-mono text-xs text-os-dim">loading history…</div>
          ) : (
            <>
              {metric === 'audience' && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {data.map((s) => {
                    const on = active.has(s.key);
                    return (
                      <button
                        key={s.key}
                        onClick={() =>
                          setActive((prev) => {
                            const next = new Set(prev);
                            next.has(s.key) ? next.delete(s.key) : next.add(s.key);
                            return next;
                          })
                        }
                        className={`flex items-center gap-1.5 rounded-sm-t border px-2 py-1 font-mono text-[10px] transition-colors ${
                          on ? 'border-os-border-strong text-os-text' : 'border-os-border text-os-dim hover:text-os-muted'
                        }`}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: on ? s.color : 'var(--text-3)' }} />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              )}

              <LineChart series={shown} range={range} />

              <div className="mt-4 flex flex-col gap-1.5">
                {shown.map((s) => {
                  const pts = inRange(s.points, range);
                  const g = growthOf(pts);
                  const latest = pts.at(-1)?.value ?? null;
                  return (
                    <div key={s.key} className="flex items-center gap-2.5 text-[12px]">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="min-w-0 flex-1 truncate">{s.label}</span>
                      <span className="font-mono text-os-muted">{fmtNum(latest)}</span>
                      <span className={`w-20 text-right font-mono font-semibold ${pctClass(g)}`}>{fmtPct(g)}</span>
                    </div>
                  );
                })}
                {shown.length === 0 && <div className="font-mono text-[11px] text-os-dim">select a series to plot</div>}
              </div>
              <p className="mt-4 font-mono text-[10px] text-os-dim">
                {RANGE_LABEL[String(range)]} window · {metric === 'dms' ? 'DM totals are seeded dummy until a source is wired' : 'email tracks the real Beehiiv subscriber count (Alex’s Newsletter)'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** A clickable metric tile with range chips (Audience Growth / Total DMs). */
function MetricTile({
  label,
  headline,
  headlineClass = '',
  sub,
  range,
  onRange,
  onOpen,
}: {
  label: string;
  headline: string;
  headlineClass?: string;
  sub: React.ReactNode;
  range: Range;
  onRange: (r: Range) => void;
  onOpen: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      className="hoverable group flex cursor-pointer flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2 text-left"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">{label}</span>
        <ArrowUpRight className="h-3 w-3 text-os-dim opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-mono text-[16px] font-semibold leading-none tracking-[-0.02em] ${headlineClass}`}>{headline}</span>
        <span className="min-w-0 truncate font-mono text-[9.5px] text-os-dim">{sub}</span>
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <RangeChips value={range} onChange={onRange} />
      </div>
    </div>
  );
}

/** Wide modal that expands the DM tile into the full Instagram inbox with a
    reply box — the "answer DMs from here" view. */
function DmInboxPopout({ threads, nowMs, onClose }: { threads: DmThread[]; nowMs: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-os-bg/70 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-lg-t border border-os-border-strong bg-os-surface shadow-[0_24px_80px_-16px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-os-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-os-accent" />
            <h2 className="text-sm font-bold">Instagram DMs</h2>
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-sm-t border border-os-border text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="p-5">
          <InstagramDmInbox threads={threads} nowMs={nowMs} />
        </div>
      </div>
    </div>
  );
}

/** The tile that replaces the old "Top platform" metric: DM management. Click
    expands into the inbox popout. Headline surfaces what needs a reply. */
function DmTile({ unreplied, total, onOpen }: { unreplied: number; total: number; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      className="hoverable group flex cursor-pointer flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2 text-left"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">Instagram DMs</span>
        <ArrowUpRight className="h-3 w-3 text-os-dim opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-mono text-[16px] font-semibold leading-none tracking-[-0.02em] ${unreplied > 0 ? 'text-os-warn' : ''}`}>
          {unreplied > 0 ? `${unreplied} to reply` : `${total} threads`}
        </span>
        <span className="min-w-0 truncate font-mono text-[9.5px] text-os-dim">{total} conversations</span>
      </div>
      <span className="flex items-center gap-1.5 font-mono text-[9.5px] text-os-dim">
        <MessageSquare className="h-3 w-3" /> open inbox · reply here
      </span>
    </div>
  );
}

export function SocialStatStrip({
  audienceTotal,
  audienceGrowth,
  totalDms,
  dmGrowth,
  platformsCount,
  dmThreads,
  nowMs,
}: {
  audienceTotal: number;
  audienceGrowth: SocialGrowth;
  totalDms: number;
  dmGrowth: SocialGrowth;
  platformsCount: number;
  dmThreads: DmThread[];
  nowMs: number;
}) {
  const [audRange, setAudRange] = useState<Range>(30);
  const [dmRange, setDmRange] = useState<Range>(30);
  const [popout, setPopout] = useState<'audience' | 'dms' | 'inbox' | null>(null);

  const audPct = audienceGrowth[RANGE_KEY[String(audRange)]];
  const dmPct = dmGrowth[RANGE_KEY[String(dmRange)]];
  const unreplied = dmThreads.filter((t) => t.unreplied).length;

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {/* Total reach — static (design package) */}
        <div className="flex flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">Total reach</span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[20px] font-semibold leading-none tracking-[-0.02em]">{fmtNum(audienceTotal)}</span>
            <span className="min-w-0 truncate font-mono text-[9.5px] text-os-dim">{platformsCount} platforms + email</span>
          </div>
        </div>

        {/* Audience growth — interactive (kept exactly) */}
        <MetricTile
          label="Audience growth"
          headline={fmtPct(audPct)}
          headlineClass={pctClass(audPct)}
          sub={`${fmtNum(audienceTotal)} total audience`}
          range={audRange}
          onRange={setAudRange}
          onOpen={() => setPopout('audience')}
        />

        {/* Total DMs — interactive (kept exactly) */}
        <MetricTile
          label="Total DMs"
          headline={fmtNum(totalDms)}
          sub={
            <span className="flex items-center gap-1">
              <span className={pctClass(dmPct)}>{fmtPct(dmPct)}</span>
              {dmPct != null &&
                (dmPct >= 0 ? <TrendingUp className="h-3 w-3 text-os-ok" /> : <TrendingDown className="h-3 w-3 text-os-err" />)}
              <span>· {RANGE_LABEL[String(dmRange)]}</span>
            </span>
          }
          range={dmRange}
          onRange={setDmRange}
          onOpen={() => setPopout('dms')}
        />

        {/* Instagram DMs — replaces the retired "Top platform" tile. Click to
            expand into the inbox and answer DMs. */}
        <DmTile unreplied={unreplied} total={dmThreads.length} onOpen={() => setPopout('inbox')} />
      </div>

      {(popout === 'audience' || popout === 'dms') && <StatPopout metric={popout} onClose={() => setPopout(null)} />}
      {popout === 'inbox' && <DmInboxPopout threads={dmThreads} nowMs={nowMs} onClose={() => setPopout(null)} />}
    </>
  );
}
