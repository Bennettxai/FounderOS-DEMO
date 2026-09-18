'use client';

import { useMemo, useState } from 'react';
import { chartGeometry } from '@/lib/trading-chart';
import type { TradeActivity, TradingAccountSnapshot } from '@/lib/schemas';

/**
 * The agent graph: one account's value over time with the agent's trades marked
 * on the line. Hand-rolled SVG, no chart library — deliberately eager (the
 * bundle contract only defers the heavy canvas graphs).
 *
 * Monolith Signal: one white series, hairline axes, square marks. Colour is
 * reserved for status, so only the change readout goes green/red; buys and
 * sells are told apart by fill (filled square vs hollow), never by hue alone.
 */

const W = 720;
const H = 168;
/** Sideways bleed so edge marks aren't clipped by the viewBox. */
const GUTTER = 6;

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

const clock = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function AgentTradeChart({
  history,
  trades,
}: {
  history: TradingAccountSnapshot[];
  trades: TradeActivity[];
}) {
  const geo = useMemo(() => chartGeometry(history, trades, { w: W, h: H, pad: 10 }), [history, trades]);
  const [hover, setHover] = useState<number | null>(null);

  if (!geo) {
    return (
      <div
        style={{ aspectRatio: `${W + GUTTER * 2} / ${H}` }}
        className="flex items-center justify-center rounded-md-t border border-dashed border-os-border px-6 text-center"
      >
        <p className="font-mono text-[11px] leading-relaxed text-os-dim">
          No value series yet. The graph draws itself once the agent has pushed a second snapshot.
        </p>
      </div>
    );
  }

  const up = geo.changeUsd >= 0;
  const active = hover === null ? null : geo.points[hover];

  return (
    <div className="relative">
      <style>{`@keyframes tc-draw { to { stroke-dashoffset: 0; } }`}</style>
      <svg
        // Bleed the box out sideways so a trade marker or the hover dot sitting
        // on the first/last sample is drawn whole instead of half-clipped.
        viewBox={`${-GUTTER} 0 ${W + GUTTER * 2} ${H}`}
        className="w-full"
        style={{ aspectRatio: `${W + GUTTER * 2} / ${H}` }}
        role="img"
        aria-label={`Agentic account value, ${usd(geo.firstUsd)} to ${usd(geo.lastUsd)} across ${geo.points.length} samples`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - box.left) / box.width) * (W + GUTTER * 2) - GUTTER;
          let best = 0;
          geo.points.forEach((p, i) => {
            if (Math.abs(p.x - x) < Math.abs(geo.points[best].x - x)) best = i;
          });
          setHover(best);
        }}
      >
        {/* recessive baseline + midline, hairline like the rest of the chrome */}
        {[0.5, 1].map((f) => (
          <line
            key={f}
            x1={-GUTTER}
            x2={W + GUTTER}
            y1={H * f}
            y2={H * f}
            stroke="var(--border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={geo.area} fill="var(--accent)" opacity="0.07" />
        {/* the line draws itself in, like the Brand Deals step-line */}
        <path
          d={geo.line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: 1, animation: 'tc-draw 1.6s cubic-bezier(.2,.7,.2,1) .4s both' }}
        />

        {/* the agent's trades, pinned to the line: filled = buy, hollow = sell */}
        {geo.markers.map((m) => (
          <rect
            key={m.trade.id}
            x={m.x - 4}
            y={m.y - 4}
            width="8"
            height="8"
            fill={m.trade.action === 'buy' ? 'var(--accent)' : 'var(--surface)'}
            stroke="var(--accent)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          >
            <title>{`${m.trade.action.toUpperCase()} ${m.trade.quantity} ${m.trade.symbol} @ ${usd(m.trade.priceUsd)}`}</title>
          </rect>
        ))}

        {active && (
          <>
            <line
              x1={active.x}
              x2={active.x}
              y1="0"
              y2={H}
              stroke="var(--border-strong)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={active.x} cy={active.y} r="3.5" fill="var(--accent)" />
          </>
        )}
      </svg>

      {/* endpoints read as text so the series is never colour-alone */}
      <div className="mt-1 flex items-baseline justify-between font-mono text-[9.5px] uppercase tracking-[0.18em] text-os-dim">
        <span>{clock(geo.points[0].at)}</span>
        <span className={up ? 'text-os-ok' : 'text-os-err'}>
          {up ? '+' : '-'}
          {usd(Math.abs(geo.changeUsd))} ({up ? '+' : ''}
          {geo.changePct}%)
        </span>
        <span>{clock(geo.points[geo.points.length - 1].at)}</span>
      </div>

      {active && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-ctl border border-os-border-strong bg-os-surface px-2 py-1 font-mono text-[10px] tabular-nums text-os-text"
          style={{ left: `${((active.x + GUTTER) / (W + GUTTER * 2)) * 100}%` }}
        >
          {usd(active.valueUsd)} · <span className="text-os-dim">{clock(active.at)}</span>
        </div>
      )}
    </div>
  );
}
