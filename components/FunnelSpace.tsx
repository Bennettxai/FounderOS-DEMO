'use client';

/**
 * The funnel as an open space, not a chart — the radial's living-orbit
 * language laid out left → right. Five section hubs sit along the spine
 * (conversion hub largest); every client is a node that enters at first
 * touch, travels hub-to-hub along its real journey, then ORBITS the section
 * it's in now — each lead circling its stage hub at its own pace and
 * direction. Crowded hubs breathe wider (orbitSpread) so the live pipeline's
 * ~100-lead first-touch cluster reads as a field, not a packed donut.
 *
 * Node language: size = likelihood-to-buy · ring = relationship (hot/warm/
 * cold) · hue = current stage, fade-to-red = quiet decay, green = converted.
 * Hover a node for its name, click to pin the full journey card.
 */
import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { DECAY_DAYS, DECAY_FADE_START, FUNNEL_STAGES, type FunnelSpaceNode } from '@/lib/funnel';
import { decayedColor, decayedOpacity, easeInOut, orbitSpread, rnd, smoothK, usd } from '@/lib/funnel-viz';
import { FunnelNodeCard } from '@/components/FunnelNodeCard';
import type { FunnelSummary } from '@/lib/schemas';

const W = 1100;
const H = 460;
const CY = H / 2 - 14; // spine sits slightly above center; labels live below
const HUB_X0 = 100;
const HUB_GAP = (W - 200) / (FUNNEL_STAGES.length - 1);
const hubX = (i: number) => HUB_X0 + i * HUB_GAP;
const hubR = (i: number) => (i === FUNNEL_STAGES.length - 1 ? 34 : 24);

/** One hue per stage cluster — the reference is an Notes-style graph. */
const SEGMENT_COLOR = ['var(--funnel-s0)', 'var(--funnel-s1)', 'var(--funnel-s2)', 'var(--funnel-s3)', 'var(--funnel-s4)'];

const nodeColor = (n: FunnelSpaceNode) => decayedColor(SEGMENT_COLOR[n.currentHub], n.decay, n.state === 'converted');
const nodeOpacity = (n: FunnelSpaceNode) => decayedOpacity(n.decay);

const ENTER_DELAY = 500; // ms before the first node departs
const HOP_MS = 950; // hub-to-hub travel time
const DWELL_MS = 420; // pause at intermediate hubs
const PULSES = 9;

/** Departures stagger, but a live 90-deal pipeline must fully enter within ~5s. */
const staggerMs = (count: number) => Math.min(340, 5000 / Math.max(1, count));

type Pos = { x: number; y: number };

/** Golden angle — sunflower spread keeps any cluster evenly constellated. */
const GOLDEN = 2.399963;

/**
 * Where node i lives once it has arrived: a visible orbit around its stage
 * hub — each lead circles at its own pace and direction, ICP fit pulling the
 * hottest closest. `spread` widens the band with cluster population, and the
 * ellipse flattens as it widens so wide orbits never wash over the hub labels.
 */
function orbitTarget(n: FunnelSpaceNode, i: number, tMs: number, spread: number): Pos {
  const speed = (0.0001 + rnd(i, 2) * 0.00012) * (rnd(i, 3) > 0.5 ? 1 : -1);
  const a = i * GOLDEN + rnd(i, 4) * 0.5 + tMs * speed;
  const r = hubR(n.currentHub) + 5 + ((1 - n.likelihood / 100) * 20 + rnd(i, 1) * 7) * spread;
  const yFlat = 0.85 / Math.sqrt(spread);
  return {
    x: hubX(n.currentHub) + Math.cos(a) * r + Math.sin(tMs * 0.0007 + i * 2.1) * 1.6,
    y: CY + Math.sin(a) * r * yFlat + Math.sin(tMs * 0.0009 + i * 1.3) * 2.2,
  };
}

/** Position on the entry replay: hub-to-hub hops with dwells, arcing slightly. */
function replayPos(n: FunnelSpaceNode, i: number, tMs: number, stagger: number): Pos | null {
  let t = tMs - (ENTER_DELAY + i * stagger);
  if (t <= 0) return { x: hubX(n.hubs[0]) - 60 - rnd(i, 5) * 30, y: CY + (rnd(i, 6) - 0.5) * 80 };
  for (let leg = 0; leg < n.hubs.length - 1; leg++) {
    if (t < HOP_MS) {
      const u = easeInOut(t / HOP_MS);
      const x0 = hubX(n.hubs[leg]);
      const x1 = hubX(n.hubs[leg + 1]);
      return {
        x: x0 + (x1 - x0) * u,
        y: CY - Math.sin(u * Math.PI) * (18 + rnd(i, 7) * 22) * (rnd(i, 8) > 0.5 ? 1 : -1),
      };
    }
    t -= HOP_MS;
    if (t < DWELL_MS) {
      const hub = n.hubs[leg + 1];
      return { x: hubX(hub), y: CY };
    }
    t -= DWELL_MS;
  }
  return null; // replay finished — hand over to the orbit
}

export function FunnelSpace({
  nodes,
  summary,
  initialLeadId,
}: {
  nodes: FunnelSpaceNode[];
  summary: FunnelSummary;
  /** Deep link (?lead=) — the attention rail pins this lead's dossier. */
  initialLeadId?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, SVGGElement>());
  const pulseRefs = useRef(new Map<number, SVGCircleElement>());
  const posRef = useRef(new Map<string, Pos>());

  // rail clicks navigate with ?lead= — pin that lead's dossier
  useEffect(() => {
    if (initialLeadId && nodes.some((n) => n.id === initialLeadId)) setSelectedId(initialLeadId);
  }, [initialLeadId, nodes]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // drop eased positions for nodes that left the data (filter changes)
    const ids = new Set(nodes.map((n) => n.id));
    for (const k of [...posRef.current.keys()]) if (!ids.has(k)) posRef.current.delete(k);
    // each node orbits inside a band sized by how crowded its hub is
    const counts = new Map<number, number>();
    for (const n of nodes) counts.set(n.currentHub, (counts.get(n.currentHub) ?? 0) + 1);
    const spread = (n: FunnelSpaceNode) => orbitSpread(counts.get(n.currentHub) ?? 0);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      // no motion: place every node exactly where it lives (pulses stay dark)
      nodes.forEach((n, i) => {
        const { x, y } = orbitTarget(n, i, 0, spread(n));
        nodeRefs.current.get(n.id)?.setAttribute('transform', `translate(${x.toFixed(1)}, ${y.toFixed(1)})`);
      });
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    let last = t0;

    const stagger = staggerMs(nodes.length);
    const frame = (nowMs: number) => {
      const t = nowMs - t0;
      // frame-rate independent easing toward the target — hand-offs
      // (replay → orbit) glide identically at 60 and 120 Hz, never snap
      const k = smoothK(nowMs - last);
      last = nowMs;
      nodes.forEach((n, i) => {
        const el = nodeRefs.current.get(n.id);
        if (!el) return;
        const target = replayPos(n, i, t, stagger) ?? orbitTarget(n, i, t, spread(n));
        const prev = posRef.current.get(n.id) ?? target;
        const next = { x: prev.x + (target.x - prev.x) * k, y: prev.y + (target.y - prev.y) * k };
        posRef.current.set(n.id, next);
        el.setAttribute('transform', `translate(${next.x.toFixed(1)}, ${next.y.toFixed(1)})`);
      });
      for (let p = 0; p < PULSES; p++) {
        const el = pulseRefs.current.get(p);
        if (!el) continue;
        const leg = p % (FUNNEL_STAGES.length - 1);
        const u = (t * (0.00008 + rnd(p, 9) * 0.00005) + rnd(p, 10)) % 1;
        el.setAttribute('cx', String(hubX(leg) + (hubX(leg + 1) - hubX(leg)) * u));
        el.setAttribute('cy', String(CY + Math.sin(u * Math.PI * 2 + p) * 2));
        el.setAttribute('opacity', String(0.5 * Math.sin(u * Math.PI)));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [nodes]);

  if (nodes.length === 0) {
    return <p className="py-6 text-center font-mono text-[11.5px] text-os-dim">No journeys for this filter yet.</p>;
  }

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div ref={rootRef} className="funnel-space-root relative">
      {/* fullscreen — the space is built to be filmed */}
      <button
        onClick={() => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void rootRef.current?.requestFullscreen();
        }}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        className="absolute right-1 top-1 z-20 rounded-sm-t border border-os-border bg-os-surface2 p-1.5 text-os-dim transition-colors hover:border-os-border-strong hover:text-os-text"
      >
        {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label="Clients orbiting their funnel stage from first touch to conversion"
        onClick={() => setSelectedId(null)}
      >
        {/* spine the data pulses travel */}
        <line x1={hubX(0)} x2={hubX(FUNNEL_STAGES.length - 1)} y1={CY} y2={CY} stroke="var(--border)" />
        {Array.from({ length: PULSES }, (_, p) => (
          <circle
            key={`pulse-${p}`}
            ref={(el) => {
              if (el) pulseRefs.current.set(p, el);
              else pulseRefs.current.delete(p);
            }}
            r={1.8}
            fill="var(--funnel-warm)"
            opacity={0}
          />
        ))}

        {/* section hubs — the funnel's stations, each tinted its segment hue */}
        {FUNNEL_STAGES.map((s, i) => {
          const r = hubR(i);
          const seg = SEGMENT_COLOR[i];
          const row = summary.stages[i];
          return (
            <g key={s.id}>
              <circle className="funnel-hub-ring" cx={hubX(i)} cy={CY} r={r + 10} fill="none" stroke={seg} strokeOpacity={0.45} strokeDasharray="3 7" style={{ animationDelay: `${i * 0.6}s` }} />
              <circle cx={hubX(i)} cy={CY} r={r} fill="var(--surface-2)" stroke={seg} strokeOpacity={0.6} strokeWidth={1.2} />
              <circle cx={hubX(i)} cy={CY} r={2.5} fill={seg} />
              {/* titles live ABOVE the cluster so orbiting nodes never cover them */}
              <text x={hubX(i)} y={CY - r - 52} textAnchor="middle" fill="var(--text-2)" fontSize={10.5} fontFamily="var(--font-mono)" style={{ textTransform: 'uppercase', letterSpacing: '0.16em' }}>
                {s.label}
              </text>
              <text x={hubX(i)} y={CY - r - 36} textAnchor="middle" fill="var(--text-3)" fontSize={10} fontFamily="var(--font-mono)">
                {row ? `${row.total}${row.conversionFromPrev != null ? ` · ${row.conversionFromPrev}%` : ''}` : ''}
              </text>
            </g>
          );
        })}

        {/* the clients */}
        {nodes.map((n, i) => {
          const color = nodeColor(n);
          const emphasized = hoverId === n.id || selectedId === n.id;
          // Calm constellation: only wins and fresh hot leads breathe.
          const pulses = n.state === 'converted' || (n.relationship === 'hot' && n.decay < 0.5);
          return (
            <g
              key={n.id}
              ref={(el) => {
                if (el) nodeRefs.current.set(n.id, el);
                else nodeRefs.current.delete(n.id);
              }}
              transform={`translate(${hubX(n.hubs[0]) - 60}, ${CY})`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId((cur) => (cur === n.id ? null : n.id));
              }}
            >
              {pulses && (
                <circle
                  className="funnel-halo"
                  r={n.radius + 3}
                  fill="none"
                  stroke={color}
                  style={{
                    animationDelay: `${(i % 6) * 0.4}s`,
                    animationDuration: n.state === 'converted' ? '3.4s' : '2.6s',
                  }}
                />
              )}
              {/* relationship ring: hot = double, warm = solid, cold = dashed */}
              <circle r={n.radius + 2.5} fill="none" stroke={color} strokeWidth={0.8} opacity={emphasized ? 0.9 : 0.35 * nodeOpacity(n)} strokeDasharray={n.relationship === 'cold' ? '2 3' : undefined} />
              {n.relationship === 'hot' && <circle r={n.radius + 5} fill="none" stroke={color} strokeWidth={0.6} opacity={0.25 * nodeOpacity(n)} />}
              <circle r={n.radius} fill={color} stroke="var(--bg)" strokeWidth={1} opacity={emphasized ? 1 : nodeOpacity(n)} />
              {(emphasized) && (
                <text y={-n.radius - 9} textAnchor="middle" fill="var(--text)" fontSize={11} fontFamily="var(--font-mono)" style={{ pointerEvents: 'none' }}>
                  {n.name}
                  {n.state === 'converted' && n.amountUsd != null ? ` · ${usd(n.amountUsd)}` : ''}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* pinned journey card — shared with the radial view */}
      {selected && <FunnelNodeCard node={selected} onClose={() => setSelectedId(null)} />}

      {/* node language legend */}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wide text-os-dim">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--funnel-s1)' }} /> hue = its stage
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: 'color-mix(in oklab, var(--err) 70%, var(--funnel-s1))', opacity: 0.6 }}
          />{' '}
          fades red after {DECAY_FADE_START}d quiet → archive at {DECAY_DAYS}d
        </span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--ok)]" /> converted</span>
        <span className="ml-auto">size + closeness = ICP fit · movement resets the clock · click a node</span>
      </div>
    </div>
  );
}
