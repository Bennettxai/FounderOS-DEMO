'use client';

import { useEffect, useMemo, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import {
  bucketPostingByDay,
  dateAxis,
  forwardFill,
  platformsPresent,
  type PostDay,
  type PostingActivityDay,
} from '@/lib/posting-activity';

type Range = 7 | 30 | 60 | 'all';
const RANGES: Range[] = [7, 30, 60, 'all'];
const RANGE_LABEL: Record<string, string> = { '7': '7d', '30': '30d', '60': '60d', all: 'All' };

type AudPoint = { date: string; value: number };

// Stack/legend order; colors mirror lib/social PLATFORM_COLORS (kept local so
// this client component never pulls the node-only connector graph into the
// browser bundle) + a Facebook entry the server palette doesn't track.
const PREFERRED = ['instagram', 'tiktok', 'twitter', 'youtube', 'linkedin', 'facebook'];
const COLORS: Record<string, string> = {
  instagram: '#e1306c',
  tiktok: '#25f4ee',
  twitter: '#1d9bf0',
  youtube: '#ff4d4d',
  linkedin: '#0a85c2',
  facebook: '#1877f2',
};
const LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  twitter: 'Twitter / X',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
};
const colorFor = (p: string): string => COLORS[p] ?? 'var(--accent)';
const labelFor = (p: string): string => LABELS[p] ?? p.charAt(0).toUpperCase() + p.slice(1);

function fmtDay(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
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

/** The two charts + shared hover crosshair/tooltip. `axis` drives BOTH the
    audience line and the stacked posting bars, so one cursor reads across them.
    Hover a day → see the audience value and exactly which platforms posted. */
function ChartPair({
  axis,
  audienceVals,
  days,
  platforms,
  audClass,
  postClass,
}: {
  axis: string[];
  audienceVals: (number | null)[];
  days: PostingActivityDay[];
  platforms: string[];
  audClass: string;
  postClass: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = axis.length;

  const W = 760;
  const HA = 200; // audience viewBox height
  const HP = 120; // posting viewBox height
  const PAD = 12;
  const xAt = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2);

  // audience scale (only over known values)
  const known = audienceVals.filter((v): v is number => v != null);
  const aMax = known.length ? Math.max(...known) : 1;
  const aMin = known.length ? Math.min(...known) : 0;
  const yA = (v: number) => HA - PAD - ((v - aMin) / Math.max(1, aMax - aMin)) * (HA - 2 * PAD);
  const firstKnown = audienceVals.findIndex((v) => v != null);
  const audPts =
    firstKnown < 0 ? [] : audienceVals.map((v, i) => (v == null ? null : ([xAt(i), yA(v)] as const))).filter(Boolean) as [number, number][];
  const audLine = audPts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

  // posting scale
  const dayMax = Math.max(1, ...days.map((d) => d.total));
  const slot = n > 0 ? W / n : W;
  const barW = Math.max(1.5, Math.min(16, slot * 0.7));
  const innerHP = HP - 8;

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    setHover(Math.min(n - 1, Math.max(0, Math.round(frac * (n - 1)))));
  };

  const overlay = (
    <div className="absolute inset-0 cursor-crosshair" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
  );

  const crosshair = (h: number) =>
    hover != null ? <line x1={xAt(hover)} x2={xAt(hover)} y1={0} y2={h} stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.5" /> : null;

  const hoverDay = hover != null ? days[hover] : null;
  const tooltipLeft = hover != null && n > 1 ? (hover / (n - 1)) * 100 : 50;
  const hoverEntries = hoverDay ? platforms.filter((p) => (hoverDay.counts[p] ?? 0) > 0) : [];

  return (
    <div className="relative">
      {/* audience */}
      <div className={audClass}>
        <svg viewBox={`0 0 ${W} ${HA}`} preserveAspectRatio="none" className="block h-full w-full">
          <defs>
            <linearGradient id="ac-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.33, 0.66].map((g) => (
            <line key={g} x1="0" x2={W} y1={HA - PAD - g * (HA - 2 * PAD)} y2={HA - PAD - g * (HA - 2 * PAD)} stroke="var(--border)" strokeDasharray="2 4" />
          ))}
          {audPts.length > 1 && <path d={`${audLine} L${audPts[audPts.length - 1][0]},${HA} L${audPts[0][0]},${HA} Z`} fill="url(#ac-area)" />}
          {audPts.length > 1 && <path d={audLine} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />}
          {crosshair(HA)}
          {hover != null && audienceVals[hover] != null && (
            <circle cx={xAt(hover)} cy={yA(audienceVals[hover]!)} r="3.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          )}
          {audPts.length > 0 && hover == null && (
            <circle cx={audPts[audPts.length - 1][0]} cy={audPts[audPts.length - 1][1]} r="3.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          )}
        </svg>
      </div>

      <div className="mt-1.5 flex justify-between font-mono text-[9.5px] text-os-dim">
        <span>{axis[0] ? fmtDay(axis[0]) : ''}</span>
        <span>today</span>
      </div>

      <div className="my-3.5 h-px bg-os-border" />

      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">Posting consistency</span>
        <span className="font-mono text-[11px] text-os-muted">
          {days.reduce((s, d) => s + d.total, 0)} posts · {platforms.length} platforms
        </span>
      </div>

      {/* posting (stacked per platform) */}
      <div className={postClass}>
        <svg viewBox={`0 0 ${W} ${HP}`} preserveAspectRatio="none" className="block h-full w-full">
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1="0" x2={W} y1={g * HP} y2={g * HP} stroke="var(--border)" strokeDasharray="2 4" />
          ))}
          {days.map((d, i) => {
            const cx = xAt(i) - barW / 2;
            if (d.total === 0) return <rect key={d.date} x={cx} y={HP - 2} width={barW} height={2} rx="1" fill="var(--accent)" opacity={0.14} />;
            let yCursor = HP;
            return (
              <g key={d.date} opacity={hover == null || hover === i ? 1 : 0.4}>
                {platforms.map((p) => {
                  const c = d.counts[p] ?? 0;
                  if (c === 0) return null;
                  const h = (c / dayMax) * innerHP;
                  yCursor -= h;
                  return <rect key={p} x={cx} y={yCursor} width={barW} height={Math.max(1, h - 0.6)} rx="1" fill={colorFor(p)} />;
                })}
              </g>
            );
          })}
          {crosshair(HP)}
        </svg>
      </div>

      <div className="mt-1.5 flex justify-between font-mono text-[9.5px] text-os-dim">
        <span>{axis[0] ? fmtDay(axis[0]) : ''}</span>
        <span>today</span>
      </div>

      {/* shared hover surface (spans both charts) + floating tooltip */}
      {overlay}
      {hover != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2"
          style={{ left: `${Math.min(88, Math.max(12, tooltipLeft))}%` }}
        >
          <div className="min-w-[150px] rounded-sm-t border border-os-border-strong bg-os-bg/95 px-2.5 py-2 font-mono shadow-lg backdrop-blur-sm">
            <div className="mb-1 flex items-center justify-between gap-3 text-[10px] text-os-dim">
              <span>{axis[hover] ? fmtDay(axis[hover]) : ''}</span>
              <span className="text-os-muted">
                {audienceVals[hover] != null ? audienceVals[hover]!.toLocaleString('en-US') : '—'} aud
              </span>
            </div>
            {hoverEntries.length === 0 ? (
              <div className="text-[10px] text-os-dim">no posts</div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {hoverEntries.map((p) => (
                  <div key={p} className="flex items-center gap-1.5 text-[10.5px] text-os-text">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorFor(p) }} />
                    <span className="flex-1">{labelFor(p)}</span>
                    {(hoverDay!.counts[p] ?? 0) > 1 && <span className="text-os-dim">×{hoverDay!.counts[p]}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlatformLegend({ platforms, days }: { platforms: string[]; days: PostingActivityDay[] }) {
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const d of days) for (const p of platforms) t[p] = (t[p] ?? 0) + (d.counts[p] ?? 0);
    return t;
  }, [platforms, days]);
  if (platforms.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {platforms.map((p) => (
        <div key={p} className="flex items-center gap-1.5 font-mono text-[10.5px]">
          <span className="h-2 w-2 rounded-full" style={{ background: colorFor(p) }} />
          <span className="text-os-muted">{labelFor(p)}</span>
          <span className="text-os-dim">{totals[p] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

/** Left-column charts: combined audience line + per-platform posting bars on one
    shared 7/30/60/all toggle and a shared hover cursor. The expand control opens
    a fullscreen view of the same two charts. */
export function AudienceConsistency({
  audience,
  postDays,
  today,
  aside,
}: {
  audience: AudPoint[];
  postDays: PostDay[];
  today: string;
  /** Rendered as a right-hand column sharing the card with the charts. */
  aside?: React.ReactNode;
}) {
  const [range, setRange] = useState<Range>(30);
  const [expanded, setExpanded] = useState(false);

  const { axis, audienceVals, days, platforms, net } = useMemo(() => {
    const dates = [...audience.map((a) => a.date), ...postDays.map((p) => p.date)].sort();
    const earliest = dates[0] ?? today;
    const end = today;
    let start: string;
    if (range === 'all') start = earliest;
    else {
      const d = new Date(`${end}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - (range - 1));
      start = d.toISOString().slice(0, 10);
    }
    const axis = dateAxis(start, end);
    const audienceVals = forwardFill(
      audience.map((a) => ({ date: a.date, value: a.value })),
      axis,
    );
    const inRangePosts = postDays.filter((p) => p.date >= start && p.date <= end);
    const days = bucketPostingByDay(inRangePosts, axis);
    const platforms = platformsPresent(inRangePosts, PREFERRED);
    const known = audienceVals.filter((v): v is number => v != null);
    const net = known.length > 1 ? known[known.length - 1] - known[0] : 0;
    return { axis, audienceVals, days, platforms, net };
  }, [audience, postDays, today, range]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  const netLabel = (
    <span className={`font-mono text-[11px] ${net >= 0 ? 'text-os-ok' : 'text-os-err'}`}>
      {net >= 0 ? '▲' : '▼'} {net >= 0 ? '+' : ''}
      {net.toLocaleString('en-US')} net
    </span>
  );

  return (
    <div className="rounded-lg-t border border-os-border bg-os-surface px-5 py-[18px]">
      {/* the charts share the card with the aside (audience pie) — the pie
          rides shotgun on the right, not slammed underneath */}
      <div className={aside ? 'grid gap-6 lg:grid-cols-[1.55fr_1fr]' : ''}>
        <div className="flex min-w-0 flex-col">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">Combined audience</span>
            <div className="flex items-center gap-2.5">
              {netLabel}
              <RangeChips value={range} onChange={setRange} />
              <button
                onClick={() => setExpanded(true)}
                aria-label="Expand to fullscreen"
                title="Fullscreen"
                className="flex h-[22px] w-[22px] items-center justify-center rounded-sm-t border border-os-border text-os-dim transition-colors hover:border-os-border-strong hover:text-os-accent"
              >
                <Maximize2 className="h-3 w-3" />
              </button>
            </div>
          </div>

          <ChartPair
            axis={axis}
            audienceVals={audienceVals}
            days={days}
            platforms={platforms}
            audClass="min-h-[140px] grow-[1.6] basis-[140px]"
            postClass="min-h-[84px] grow basis-[84px]"
          />

          <PlatformLegend platforms={platforms} days={days} />
        </div>

        {aside && (
          <div className="flex min-w-0 flex-col justify-center max-lg:mt-4 max-lg:border-t max-lg:border-os-border max-lg:pt-4 lg:border-l lg:border-os-border lg:pl-6">
            {aside}
          </div>
        )}
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm sm:p-6"
          onClick={() => setExpanded(false)}
        >
          <div
            className="flex max-h-[94vh] w-[min(1240px,96vw)] flex-col overflow-hidden rounded-lg-t border border-os-border-strong bg-os-bg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-os-border px-5 py-3.5">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">social</div>
                <div className="mt-0.5 text-[15px] font-semibold">Combined audience &amp; posting consistency</div>
              </div>
              <div className="flex items-center gap-3">
                <RangeChips value={range} onChange={setRange} />
                <button
                  onClick={() => setExpanded(false)}
                  aria-label="Close"
                  className="flex h-7 w-7 items-center justify-center rounded-sm-t border border-os-border text-os-dim transition-colors hover:border-os-border-strong hover:text-os-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">Combined audience</span>
                {netLabel}
              </div>
              <ChartPair
                axis={axis}
                audienceVals={audienceVals}
                days={days}
                platforms={platforms}
                audClass="h-[clamp(240px,40vh,420px)]"
                postClass="h-[clamp(160px,26vh,300px)]"
              />
              <PlatformLegend platforms={platforms} days={days} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
