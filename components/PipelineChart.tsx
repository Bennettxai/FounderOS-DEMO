'use client';

/**
 * PipelineChart: the "Pipeline" widget's design from the Slab brand-deals
 * slab (imported), lifted out so any set of stages or categories
 * can get the same hero treatment: column headers (42px numeral + label +
 * mono $ line, each a working filter button) above an SVG of hatched,
 * gradient-filled step columns that fade out at the bottom via a mask, with
 * an optional AI-style search bar melting out of the chart base.
 */

import { useEffect, useState } from 'react';

export type PipelineStage = {
  label: string;
  value: number;
  /** Optional dollar figure for the mono line under the numeral. */
  usd?: number;
  /** Text shown next to the value in the tooltip pill over the active column. */
  note?: string;
  /** Dim this column's header (e.g. it doesn't match an active search) without removing it. */
  dim?: boolean;
};

const EASE = 'cubic-bezier(.2,.7,.2,1)';

/** Ease-out cubic count-up shared by every stat numeral on the slab. */
export function useCountUp(target: number, dur = 1400): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(target * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}

/** The exact caret-blink animation shorthand for a search-bar slot's cursor span. */
export const CARET_ANIMATION = 'pc-caret 1.1s step-end infinite';

function AnimatedNumeral({ value, format, masked }: { value: number; format: (v: number) => string; masked?: boolean }) {
  const v = useCountUp(value);
  return <span style={masked ? { filter: 'blur(7px)', userSelect: 'none' } : undefined}>{format(v)}</span>;
}

function MaybeMasked({ text, masked }: { text: string; masked?: boolean }) {
  return <span style={masked ? { filter: 'blur(7px)', userSelect: 'none' } : undefined}>{text}</span>;
}

export interface PipelineChartProps<T extends PipelineStage> {
  stages: T[];
  /** Index of the stage whose column renders solid/filled and drives the tooltip. */
  active: number;
  onSelect?: (stage: T, index: number) => void;
  /** Formats the big numeral (defaults to a plain rounded integer, like a count). */
  formatValue?: (value: number) => string;
  /** Formats the mono `usd` line (defaults to `$12,345`). */
  formatUsd?: (value: number) => string;
  /** Blur every rendered figure (numeral, mono line, tooltip): a hide-values mode. */
  maskValues?: boolean;
  /** Renders inside the gradient backdrop-blur wrapper melting out of the chart base. */
  searchSlot?: React.ReactNode;
  numeralSize?: number;
  svgHeight?: number;
  showAxis?: boolean;
  showTooltip?: boolean;
  contentClassName?: string;
  className?: string;
}

export function PipelineChart<T extends PipelineStage>({
  stages,
  active,
  onSelect,
  formatValue = (v) => String(Math.round(v)),
  formatUsd = (v) => `$${Math.round(v).toLocaleString('en-US')}`,
  maskValues = false,
  searchSlot,
  numeralSize = 42,
  svgHeight = 220,
  showAxis = true,
  showTooltip = true,
  contentClassName = 'px-6 pt-4',
  className = '',
}: PipelineChartProps<T>) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  const W = 1000;
  const SVG_H = svgHeight;
  const H = SVG_H + 40;
  const AXIS = showAxis ? 44 : 0;
  const colW = (W - AXIS) / Math.max(stages.length, 1);
  const barW = colW * 0.62;
  const h = (v: number) => (v === 0 ? 10 : 34 + (v / max) * (H - 54));
  const x0 = (i: number) => AXIS + i * colW + 4;
  const ticks = showAxis ? [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f)) : [];
  const activeStage: T | undefined = stages[active];
  const activeTopPx = activeStage ? ((H - h(activeStage.value)) / H) * SVG_H : 0;

  return (
    <div className={className}>
      <style>{`
        @keyframes pc-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes pc-fadein { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pc-caret { 0%, 45% { opacity: 1; } 55%, 100% { opacity: 0; } }
      `}</style>
      <div className={contentClassName}>
        {/* column headers: numerals rule the card; every header is a working filter button */}
        <div className="grid" style={{ gridTemplateColumns: `repeat(${stages.length}, 1fr)`, marginLeft: `${(AXIS / W) * 100}%` }}>
          {stages.map((s, i) => {
            const isActive = i === active;
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => onSelect?.(s, i)}
                className={`pressable px-5 pb-3 text-left hover:bg-[color-mix(in_oklab,var(--text)_4%,transparent)] ${
                  i > 0 ? 'border-l border-os-border' : ''
                }`}
                style={{ opacity: s.dim && !isActive ? 0.4 : 1 }}
              >
                <div className={`text-[12.5px] ${isActive ? 'text-os-muted' : 'text-os-dim'}`}>{s.label}</div>
                <div
                  className={`mt-0.5 font-semibold leading-none tabular-nums tracking-[-0.03em] ${isActive ? '' : 'text-os-dim'}`}
                  style={{ fontSize: numeralSize }}
                >
                  <AnimatedNumeral value={s.value} format={formatValue} masked={maskValues} />
                </div>
                {s.usd !== undefined && (
                  <div className={`mt-1 font-mono text-[11.5px] tabular-nums ${isActive ? 'text-os-accent' : 'text-os-dim'}`}>
                    <MaybeMasked text={formatUsd(s.usd)} masked={maskValues} />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div
          className="relative"
          style={{
            maskImage: 'linear-gradient(to bottom, black 74%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 74%, transparent 100%)',
          }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ height: SVG_H }} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <pattern id="pc-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="9" height="9" fill="color-mix(in oklab, var(--accent) 14%, transparent)" />
                <rect width="3.5" height="9" fill="color-mix(in oklab, var(--accent) 42%, transparent)" />
              </pattern>
              <linearGradient id="pc-solid" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--accent)" />
                <stop offset="1" stopColor="color-mix(in oklab, var(--accent) 55%, var(--pc-shade))" />
              </linearGradient>
              <linearGradient id="pc-fadeg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
                <stop offset="1" stopColor="#fff" stopOpacity="0.14" />
              </linearGradient>
              <mask id="pc-fade">
                <rect width={W} height={H} fill="url(#pc-fadeg)" />
              </mask>
            </defs>
            {/* y-axis ticks ground the block heights */}
            {showAxis &&
              ticks.map((t, i) => {
                const y = H - h(t) + (t === 0 ? 10 : 0);
                return (
                  <g key={i}>
                    <text x={AXIS - 10} y={y + 3} textAnchor="end" fontSize="11" fill="var(--text-3)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {t}
                    </text>
                    <line x1={AXIS} x2={W} y1={y} y2={y} stroke="var(--border)" strokeWidth="0.5" opacity="0.5" />
                  </g>
                );
              })}
            {/* one <g> per stage: block + its short ramp step-face to the next */}
            {stages.map((s, i) => {
              const isActive = i === active;
              const bx = x0(i);
              const top = H - h(s.value);
              const next = stages[i + 1];
              const rampEnd = next ? x0(i + 1) : null;
              const nextTop = next ? H - h(next.value) : 0;
              const fill = isActive ? 'url(#pc-solid)' : 'url(#pc-hatch)';
              const body = (
                <g key={s.label}>
                  <rect
                    x={bx}
                    y={top}
                    width={barW}
                    height={H - top}
                    rx={isActive ? 3 : 0}
                    fill={fill}
                    style={{ transformBox: 'fill-box', transformOrigin: 'bottom', animation: `pc-grow .8s ${EASE} ${200 + i * 110}ms both` }}
                  />
                  {rampEnd !== null && (
                    <polygon
                      points={`${bx + barW},${top} ${rampEnd},${nextTop} ${rampEnd},${H} ${bx + barW},${H}`}
                      fill={fill}
                      opacity={isActive ? 0.5 : 0.55}
                      style={{ animation: `pc-fadein .9s ${EASE} ${380 + i * 110}ms both` }}
                    />
                  )}
                </g>
              );
              return isActive ? body : <g key={s.label} mask="url(#pc-fade)">{body}</g>;
            })}
            {/* capsule caps floating above each bar */}
            {stages.map((s, i) => (
              <rect
                key={`cap-${s.label}`}
                x={x0(i) + barW / 2 - 16}
                y={H - h(s.value) - 12}
                width="32"
                height="6"
                rx="3"
                fill={i === active ? 'var(--accent)' : 'color-mix(in oklab, var(--text) 25%, transparent)'}
                style={{ animation: `pc-fadein .5s ${EASE} ${700 + i * 90}ms both` }}
              />
            ))}
          </svg>
          {/* tooltip pill anchored just above the active stage's top edge */}
          {showTooltip && activeStage?.note && (
            <div
              className="pointer-events-none absolute flex items-center gap-2 whitespace-nowrap rounded-full border border-os-border px-3.5 py-1.5 text-[12px] backdrop-blur"
              style={(() => {
                // clamp near the edges: a centered pill over the first or
                // last column half-clips outside the card
                const centerPct = ((AXIS + active * colW + 4 + barW / 2) / W) * 100;
                const tx = centerPct < 15 ? '0%' : centerPct > 85 ? '-100%' : '-50%';
                return {
                  left: `${centerPct}%`,
                  top: Math.max(6, activeTopPx - 40),
                  transform: `translateX(${tx})`,
                  background: 'color-mix(in oklab, var(--bg) 72%, transparent)',
                  boxShadow: '0 8px 24px -10px rgba(0,0,0,.6)',
                  animation: `pc-fadein .6s ${EASE} 1100ms both`,
                };
              })()}
            >
              <span className="font-semibold tabular-nums">
                <MaybeMasked text={formatValue(activeStage.value)} masked={maskValues} />
              </span>
              <span className="text-os-muted">{activeStage.note}</span>
            </div>
          )}
        </div>
      </div>

      {/* AI prompt bar melting out of the chart base, no top edge */}
      {searchSlot && (
        <div className="relative z-[2] mx-6 -mt-12">
          <div
            className="rounded-[16px] p-3 backdrop-blur"
            style={{
              background:
                'linear-gradient(180deg, transparent, color-mix(in oklab, var(--accent) 9%, transparent) 40%, color-mix(in oklab, var(--accent) 12%, transparent))',
            }}
          >
            {searchSlot}
          </div>
        </div>
      )}
    </div>
  );
}
