'use client';

import { useRef, useState } from 'react';
import {
  nearestPillarLayer,
  radarPoint,
  type PillarAxis,
  type PillarLayerKey,
} from '@/lib/pillar-radar';

/**
 * The pillar spider chart (FounderOS-style): one axis per department over a
 * three-level hex grid, with the overall-health polygon plus the three signals
 * it's built from (roster active / run recency / SOP coverage) as their own
 * layers. The layers pile up, so hovering the chart SIFTS between them: the
 * layer nearest the cursor isolates (full colour + per-pillar value badges)
 * while the rest fade back. Hover a legend chip to lock onto a layer directly.
 */

const S = 520; // viewBox square
const C = S / 2;
const R = 172; // outer grid radius
const LABEL_R = R + 44;

type Layer = { key: PillarLayerKey; label: string; color: string; dash?: string; fill?: boolean };
const LAYERS: Layer[] = [
  { key: 'score', label: 'Overall health', color: 'var(--text)', fill: true },
  { key: 'roster', label: 'Roster active', color: 'var(--funnel-s0)' },
  { key: 'freshness', label: 'Run recency', color: 'var(--funnel-s1)', dash: '6 4' },
  { key: 'sop', label: 'SOP coverage', color: 'var(--funnel-s2)', dash: '2 4' },
];

export function PillarRadar({
  axes, health, warnings,
}: {
  axes: PillarAxis[];
  health: number | null;
  warnings: number;
}) {
  const n = Math.max(1, axes.length);
  const gridLevels = [1 / 3, 2 / 3, 1];
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<PillarLayerKey | null>(null);

  const ring = (k: number) => Array.from({ length: n }, (_, i) => radarPoint(i, n, R * k, C).join(',')).join(' ');
  const polyFor = (key: PillarLayerKey) =>
    axes.map((a, i) => radarPoint(i, n, (Math.max(5, a[key]) / 100) * R, C).join(',')).join(' ');

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * S;
    const y = ((e.clientY - rect.top) / rect.height) * S;
    setActive(nearestPillarLayer({ x, y }, axes, R, C));
  };

  // opacity of a layer given the current hover: at rest everything shows; while
  // sifting the active layer is bold and the rest recede to a whisper.
  const layerOpacity = (l: Layer) => (active === null ? (l.fill ? 1 : 0.85) : active === l.key ? 1 : 0.08);
  const activeLayer = LAYERS.find((l) => l.key === active) ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="grid flex-1 place-items-center">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${S} ${S}`}
          className="block w-full max-w-[500px]"
          role="img"
          aria-label="Pillar health radar — hover to sift between layers"
          onMouseMove={onMove}
          onMouseLeave={() => setActive(null)}
        >
          {/* three-level hex grid + spokes */}
          {gridLevels.map((k) => (
            <polygon key={k} points={ring(k)} fill="none" stroke="var(--border-strong)" strokeWidth={1} opacity={k === 1 ? 0.9 : 0.5} />
          ))}
          {axes.map((a, i) => {
            const [x, y] = radarPoint(i, n, R, C);
            return <line key={a.id} x1={C} y1={C} x2={x} y2={y} stroke="var(--border-strong)" strokeWidth={1} opacity={0.4} />;
          })}

          {/* layered series — draw the active one LAST so it sits on top */}
          {[...LAYERS].sort((a, b) => Number(a.key === active) - Number(b.key === active)).map((layer) => {
            const on = active === layer.key;
            const op = layerOpacity(layer);
            return (
              <g key={layer.key} style={{ transition: 'opacity 0.15s' }} opacity={op}>
                <polygon
                  points={polyFor(layer.key)}
                  fill={layer.fill && active === null ? layer.color : on ? layer.color : 'none'}
                  fillOpacity={layer.fill && active === null ? 0.07 : on ? 0.1 : 0}
                  stroke={layer.color}
                  strokeWidth={on ? 3 : layer.fill ? 2.4 : 1.8}
                  strokeDasharray={on ? undefined : layer.dash}
                  strokeLinejoin="round"
                />
                {axes.map((a, i) => {
                  const [x, y] = radarPoint(i, n, (Math.max(5, a[layer.key]) / 100) * R, C);
                  return <circle key={a.id} cx={x} cy={y} r={on ? 5.5 : layer.fill ? 5 : 3.4} fill={layer.color} />;
                })}
                {/* per-pillar value badges, only for the layer being sifted */}
                {on &&
                  axes.map((a, i) => {
                    const [x, y] = radarPoint(i, n, (Math.max(5, a[layer.key]) / 100) * R, C);
                    const out = radarPoint(i, n, (Math.max(5, a[layer.key]) / 100) * R + 15, C);
                    return (
                      <text key={a.id} x={out[0]} y={out[1]} textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-mono)" fontSize={12} fontWeight={700} fill={layer.color}>
                        {a[layer.key]}
                      </text>
                    );
                  })}
              </g>
            );
          })}

          {/* pillar labels around the rim */}
          {axes.map((a, i) => {
            const [x, y] = radarPoint(i, n, LABEL_R, C);
            const anchor = Math.abs(x - C) < 8 ? 'middle' : x > C ? 'start' : 'end';
            return (
              <text key={a.id} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" fontFamily="var(--font-mono)" fontSize={15} letterSpacing="0.28em" fill="var(--text-3)">
                {a.label.toUpperCase().replace('/GROWTH', '')}
              </text>
            );
          })}
        </svg>
      </div>

      {/* legend — hover a chip to lock the layer; the active one lifts */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-4 font-mono text-[9.5px] uppercase tracking-[0.14em]">
        {LAYERS.map((layer) => {
          const on = active === layer.key;
          const dim = active !== null && !on;
          return (
            <button
              key={layer.key}
              onMouseEnter={() => setActive(layer.key)}
              onMouseLeave={() => setActive(null)}
              className={`flex items-center gap-1.5 transition-opacity ${dim ? 'opacity-30' : ''} ${on ? 'text-os-text' : 'text-os-dim'}`}
            >
              <svg width="18" height="6" aria-hidden>
                <line x1="0" y1="3" x2="18" y2="3" stroke={layer.color} strokeWidth={on ? 3 : layer.fill ? 2.6 : 1.8} strokeDasharray={on ? undefined : layer.dash} />
              </svg>
              {layer.label}
            </button>
          );
        })}
      </div>

      {/* the doctor line, or the sifted layer's name when hovering */}
      <div className="flex items-baseline justify-center gap-2 pb-4 pt-2 font-mono">
        {activeLayer ? (
          <span className="text-[11px] uppercase tracking-[0.16em]" style={{ color: activeLayer.color === 'var(--text)' ? 'var(--text)' : activeLayer.color }}>
            {activeLayer.label} · per pillar, 0 to 100
          </span>
        ) : (
          <>
            <span className="text-2xl font-semibold text-os-ok">{health ?? '—'}</span>
            <span className="text-[11px] text-os-dim">/ 100 health</span>
            {warnings > 0 && (
              <>
                <span className="text-os-border-strong">·</span>
                <span className="text-[11px] font-semibold text-os-warn">
                  {warnings} warning{warnings === 1 ? '' : 's'}
                </span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
