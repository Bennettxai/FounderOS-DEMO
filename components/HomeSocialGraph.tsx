'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Maximize2, X } from 'lucide-react';

type Range = 7 | 30 | 60 | 'all';
const RANGES: Range[] = [7, 30, 60, 'all'];
const RANGE_LABEL: Record<string, string> = { '7': '7d', '30': '30d', '60': '60d', all: 'All' };

type SeriesPoint = { date: string; value: number };
type LabelledSeries = { key: string; label: string; color: string; points: SeriesPoint[] };
type PostSeries = { key: string; label: string; color: string; points: { date: string; count: number }[]; total: number };

function fmtNum(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('en-US');
}
function fmtPct(n: number | null): string {
  if (n === null || Number.isNaN(n)) return '—';
  const r = Math.abs(n) < 10 ? n.toFixed(2) : n.toFixed(1);
  return `${n >= 0 ? '+' : ''}${r}%`;
}
function pctClass(n: number | null): string {
  return n === null ? 'text-os-muted' : n >= 0 ? 'text-os-ok' : 'text-os-err';
}
function dateMinusDays(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function inRange<T extends { date: string }>(points: T[], range: Range): T[] {
  if (range === 'all' || points.length === 0) return points;
  const start = dateMinusDays(points[points.length - 1].date, range);
  return points.filter((p) => p.date >= start);
}
function growthOf(points: SeriesPoint[]): number | null {
  if (points.length < 2 || points[0].value === 0) return null;
  return ((points[points.length - 1].value - points[0].value) / points[0].value) * 100;
}

function RangeChips({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex gap-1">
      {RANGES.map((r) => (
        <button
          key={String(r)}
          onClick={() => onChange(r)}
          className={`rounded-sm-t border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
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

function ToggleChips({
  items,
  active,
  onToggle,
}: {
  items: { key: string; label: string; color: string }[];
  active: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => {
        const on = active.has(s.key);
        return (
          <button
            key={s.key}
            onClick={() => onToggle(s.key)}
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
  );
}

/** Combined-audience line plot, shared by the inline card and the modal. */
function AudienceChart({
  series,
  range,
  active,
  className = 'h-72',
}: {
  series: LabelledSeries[];
  range: Range;
  active: Set<string>;
  className?: string;
}) {
  const W = 1000;
  const H = 300;
  const pad = { l: 10, r: 10, t: 16, b: 18 };
  const shown = series.filter((s) => active.has(s.key));
  const ranged = shown.map((s) => ({ ...s, points: inRange(s.points, range) }));
  const allPts = ranged.flatMap((s) => s.points);
  const dates = [...new Set(allPts.map((p) => p.date))].sort();
  const xMax = Math.max(1, dates.length - 1);
  const xByDate = new Map(dates.map((d, i) => [d, i]));
  const vals = allPts.map((p) => p.value);
  let lo = vals.length ? Math.min(...vals) : 0;
  let hi = vals.length ? Math.max(...vals) : 1;
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const x = (d: string) => pad.l + (xByDate.get(d)! / xMax) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`w-full ${className}`}>
      {[0.2, 0.4, 0.6, 0.8].map((g) => (
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
      {allPts.length === 0 && (
        <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--text-3)" fontFamily="var(--font-mono)" fontSize="13">
          select a channel to plot
        </text>
      )}
    </svg>
  );
}

/** Posting-consistency stacked bars (one segment per active platform/day). */
function PostingChart({
  posting,
  range,
  active,
  className = 'h-44',
}: {
  posting: PostSeries[];
  range: Range;
  active: Set<string>;
  className?: string;
}) {
  const W = 1000;
  const H = 200;
  const pad = { l: 6, r: 6, t: 8, b: 10 };
  const shown = posting
    .filter((s) => active.has(s.key))
    .map((s) => ({ ...s, m: new Map(inRange(s.points, range).map((p) => [p.date, p.count])) }));
  const dates = [...new Set(shown.flatMap((s) => [...s.m.keys()]))].sort();
  const dayMax = Math.max(1, ...dates.map((d) => shown.reduce((sum, s) => sum + (s.m.get(d) ?? 0), 0)));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const slot = dates.length > 0 ? innerW / dates.length : innerW;
  const barW = Math.max(1.5, Math.min(16, slot * 0.72));
  const unit = innerH / dayMax;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`w-full ${className}`}>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + g * innerH} y2={pad.t + g * innerH} stroke="var(--border)" strokeDasharray="2 4" />
      ))}
      {dates.map((d, i) => {
        const cx = pad.l + i * slot + (slot - barW) / 2;
        let yCursor = H - pad.b;
        const total = shown.reduce((sum, s) => sum + (s.m.get(d) ?? 0), 0);
        if (total === 0) {
          return <rect key={d} x={cx} y={H - pad.b - 2} width={barW} height={2} rx="1" fill="var(--accent)" opacity={0.14} />;
        }
        return (
          <g key={d}>
            {shown.map((s) => {
              const c = s.m.get(d) ?? 0;
              if (c === 0) return null;
              const h = c * unit;
              yCursor -= h;
              return <rect key={s.key} x={cx} y={yCursor} width={barW} height={Math.max(1, h - 0.6)} rx="1" fill={s.color} opacity={0.9} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}

/** Fullscreen analytics — combined audience + posting consistency, shared
    platform toggles and one 7/30/60/all range, with per-channel breakdown. */
function AnalyticsModal({
  audience,
  posting,
  initialRange,
  initialActive,
  onClose,
}: {
  audience: LabelledSeries[];
  posting: PostSeries[];
  initialRange: Range;
  initialActive: Set<string>;
  onClose: () => void;
}) {
  const [range, setRange] = useState<Range>(initialRange);
  const [active, setActive] = useState<Set<string>>(initialActive);
  const toggle = (key: string) =>
    setActive((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Toggle chips = audience channels (incl. all/email) ∪ platforms (already in
  // audience), so one row drives both charts.
  const chipItems = audience.map((s) => ({ key: s.key, label: s.label, color: s.color }));
  const postShown = posting.filter((s) => active.has(s.key));
  const postTotal = postShown.reduce((sum, s) => sum + inRange(s.points, range).reduce((a, p) => a + p.count, 0), 0);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-[min(1240px,96vw)] flex-col overflow-hidden rounded-lg-t border border-os-border-strong bg-os-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-os-border px-5 py-3.5">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">social analytics</div>
            <div className="mt-0.5 text-[15px] font-semibold">Audience &amp; posting consistency</div>
          </div>
          <div className="flex items-center gap-3">
            <RangeChips value={range} onChange={setRange} />
            <Link href="/social" className="flex items-center gap-1 font-mono text-[11px] text-os-dim transition-colors hover:text-os-accent">
              Open Social <ArrowUpRight className="h-3 w-3" />
            </Link>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-sm-t border border-os-border text-os-dim transition-colors hover:border-os-border-strong hover:text-os-text"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* shared platform toggles */}
        <div className="border-b border-os-border px-5 py-3">
          <ToggleChips items={chipItems} active={active} onToggle={toggle} />
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* combined audience */}
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">Combined audience</span>
            <span className="font-mono text-[10px] text-os-dim">{RANGE_LABEL[String(range)]}</span>
          </div>
          <AudienceChart series={audience} range={range} active={active} className="h-[clamp(220px,34vh,360px)]" />
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 xl:grid-cols-4">
            {audience.map((s) => {
              const pts = inRange(s.points, range);
              const g = growthOf(pts);
              const latest = pts.at(-1)?.value ?? null;
              return (
                <div key={s.key} className={`flex items-center gap-2 text-[12px] ${active.has(s.key) ? '' : 'opacity-45'}`}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  <span className="font-mono text-os-muted">{fmtNum(latest)}</span>
                  <span className={`w-16 text-right font-mono font-semibold ${pctClass(g)}`}>{fmtPct(g)}</span>
                </div>
              );
            })}
          </div>

          <div className="my-5 h-px bg-os-border" />

          {/* posting consistency */}
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">Posting consistency</span>
            <span className="font-mono text-[11px] text-os-muted">
              {postTotal} posts · {RANGE_LABEL[String(range)]}
            </span>
          </div>
          <PostingChart posting={posting} range={range} active={active} className="h-[clamp(150px,24vh,240px)]" />
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 xl:grid-cols-5">
            {posting.map((s) => {
              const ranged = inRange(s.points, range);
              const total = ranged.reduce((a, p) => a + p.count, 0);
              const days = ranged.filter((p) => p.count > 0).length;
              return (
                <div key={s.key} className={`flex items-center gap-2 text-[12px] ${active.has(s.key) ? '' : 'opacity-45'}`}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  <span className="font-mono text-os-muted">{total}</span>
                  <span className="w-16 text-right font-mono text-os-dim">{days}d active</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The fully built-out social graph: every channel plotted over the range,
    with an Expand affordance into the fullscreen audience + posting modal. */
export function HomeSocialGraph({ series, posting = [] }: { series: LabelledSeries[]; posting?: PostSeries[] }) {
  const [range, setRange] = useState<Range>('all');
  const [open, setOpen] = useState(false);
  // Default: every individual channel on (the aggregate "all" is opt-in so it
  // doesn't flatten the smaller platforms).
  const [active, setActive] = useState<Set<string>>(
    () => new Set(series.filter((s) => s.key !== 'all').map((s) => s.key)),
  );
  const toggle = (key: string) =>
    setActive((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const chipItems = useMemo(() => series.map((s) => ({ key: s.key, label: s.label, color: s.color })), [series]);

  return (
    <section className="rounded-lg-t border border-os-border bg-os-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">Social media · audience over time</span>
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 font-mono text-[11px] text-os-dim transition-colors hover:text-os-accent"
          >
            <Maximize2 className="h-3 w-3" /> Expand
          </button>
        </div>
        <RangeChips value={range} onChange={setRange} />
      </div>

      {/* channel toggles */}
      <div className="mb-3">
        <ToggleChips items={chipItems} active={active} onToggle={toggle} />
      </div>

      <button onClick={() => setOpen(true)} className="block w-full cursor-zoom-in" aria-label="Expand social analytics">
        <AudienceChart series={series} range={range} active={active} />
      </button>

      {/* legend: latest count + growth per series, over the range */}
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 xl:grid-cols-4">
        {series.map((s) => {
          const pts = inRange(s.points, range);
          const g = growthOf(pts);
          const latest = pts.at(-1)?.value ?? null;
          return (
            <div key={s.key} className={`flex items-center gap-2 text-[12px] ${active.has(s.key) ? '' : 'opacity-45'}`}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <span className="font-mono text-os-muted">{fmtNum(latest)}</span>
              <span className={`w-16 text-right font-mono font-semibold ${pctClass(g)}`}>{fmtPct(g)}</span>
            </div>
          );
        })}
      </div>

      {open && (
        <AnalyticsModal
          audience={series}
          posting={posting}
          initialRange={range === 'all' ? 30 : range}
          initialActive={active}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}
