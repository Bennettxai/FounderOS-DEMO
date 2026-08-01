'use client';

/**
 * The funnel as a circle — the journey runs outside → in. Seven acquisition
 * wedges around the rim (Instagram incl. paid ads, YouTube, newsletter, X,
 * LinkedIn, forms, word of mouth); concentric stage rings pull leads inward;
 * the center core is the purchase. Every node is a client: it enters outside
 * the rim in its wedge, spirals in through the rings it really visited, then
 * drifts alive inside its current band. Same node language as the flow view —
 * size = likelihood, hue = entry wedge, fade-to-red = quiet decay, green =
 * converted (and converted nodes leave their wedge for the shared core:
 * inside is inside).
 */
import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { DECAY_DAYS, DECAY_FADE_START, FUNNEL_STAGES } from '@/lib/funnel';
import { ACQUISITIONS, type FunnelRadialModel, type FunnelRadialNode } from '@/lib/funnel-radial';
import { decayedColor, decayedOpacity, easeInOut, rnd, smoothK } from '@/lib/funnel-viz';
import { FunnelNodeCard } from '@/components/FunnelNodeCard';

const W = 1100;
const H = 680;
const CX = W / 2;
const CY = H / 2;
const TAU = Math.PI * 2;
const SEG_COUNT = ACQUISITIONS.length;
const SEG_SPAN = TAU / SEG_COUNT;
/** Nodes keep this angular margin off a wedge boundary (wobble stays inside). */
const SEG_INSET = 0.13;
const TOP = -Math.PI / 2; // wedge 0 starts at 12 o'clock

/** Stage ring radii, outermost (first touch) → the converted core. */
const RING = [288, 228, 170, 114, 48];

/** One hue per acquisition wedge — s4 (phosphor green) is skipped so no
 * wedge ever wears the conversion color. */
const WEDGE_COLOR = [
  'var(--funnel-s0)',
  'var(--funnel-s1)',
  'var(--funnel-s2)',
  'var(--funnel-s3)',
  'var(--funnel-s5)',
  'var(--funnel-s6)',
];

const ENTER_DELAY = 500; // ms before the first node departs
const HOP_MS = 950; // ring-to-ring travel time
const DWELL_MS = 420; // pause at intermediate rings
const staggerMs = (count: number) => Math.min(340, 5000 / Math.max(1, count));

type Pos = { x: number; y: number };
const GOLDEN = 2.399963;

// rounded to 2 decimals: Math.cos/sin differ in the last ULPs between V8
// builds (Node SSR vs browser), and hydration diffs cx/cy as prop mismatches
const polar = (a: number, r: number): Pos => ({
  x: Math.round((CX + Math.cos(a) * r) * 100) / 100,
  y: Math.round((CY + Math.sin(a) * r) * 100) / 100,
});

/** The fixed angle node i holds inside its wedge (jittered, never on a spoke). */
const wedgeAngle = (n: FunnelRadialNode, i: number): number =>
  TOP + n.segment * SEG_SPAN + SEG_INSET + (SEG_SPAN - 2 * SEG_INSET) * rnd(i, 11);

/**
 * The radius a node holds for a given ring: inside the band between its ring
 * and the next one in, likelihood pulling it deeper (hot ICP fit sits closer
 * to the purchase). Ring 4 = the core disc, likelihood ignored — they bought.
 */
function bandRadius(n: FunnelRadialNode, i: number, ring: number): number {
  if (ring >= RING.length - 1) return 6 + rnd(i, 12) * (RING[4] - 16);
  const outer = RING[ring] - 8;
  const inner = RING[ring + 1] + 12;
  const depth = 0.15 + 0.6 * (n.likelihood / 100) + rnd(i, 1) * 0.2;
  return outer - (outer - inner) * Math.min(0.95, depth);
}

/** Where node i drifts once it has arrived: alive, but held inside its band. */
function orbitTarget(n: FunnelRadialNode, i: number, tMs: number): Pos {
  if (n.currentRing >= RING.length - 1) {
    // converted: free slow orbit inside the shared core — they're in
    const a = i * GOLDEN + tMs * 0.00005 * (rnd(i, 3) > 0.5 ? 1 : -1);
    return polar(a, bandRadius(n, i, 4));
  }
  const wobble = Math.sin(tMs * (0.00018 + rnd(i, 2) * 0.00014) + rnd(i, 4) * TAU) * 0.09;
  const breath = Math.sin(tMs * 0.0009 + i * 1.3) * 2.4;
  return polar(wedgeAngle(n, i) + wobble, bandRadius(n, i, n.currentRing) + breath);
}

/** The entry replay: spiral inward through the rings this lead really visited. */
function replayPos(n: FunnelRadialNode, i: number, tMs: number, stagger: number): Pos | null {
  const a = wedgeAngle(n, i);
  let t = tMs - (ENTER_DELAY + i * stagger);
  if (t <= 0) return polar(a, RING[0] + 46 + rnd(i, 5) * 26); // waiting outside the rim
  const stops = [RING[0] + 46, ...n.rings.map((ring) => bandRadius(n, i, ring))];
  const twist = (rnd(i, 8) > 0.5 ? 1 : -1) * 0.07; // slight spiral, not a straight dive
  // shortest angular path into the core — never the long way around the circle
  const coreDelta = ((((i * GOLDEN) % TAU) - a + TAU * 1.5) % TAU) - Math.PI;
  for (let leg = 0; leg < stops.length - 1; leg++) {
    if (t < HOP_MS) {
      const u = easeInOut(t / HOP_MS);
      const toCore = n.rings[leg] >= RING.length - 1;
      const angle = toCore
        ? a + coreDelta * u // the last hop bends into the core
        : a + Math.sin(u * Math.PI) * twist;
      return polar(angle, stops[leg] + (stops[leg + 1] - stops[leg]) * u);
    }
    t -= HOP_MS;
    if (t < DWELL_MS) return polar(a, stops[leg + 1]);
    t -= DWELL_MS;
  }
  return null; // replay finished — hand over to the orbit
}

export function FunnelRadial({
  model,
  initialLeadId,
}: {
  model: FunnelRadialModel;
  /** Deep link (?lead=) — the attention rail pins this lead's dossier. */
  initialLeadId?: string | null;
}) {
  const { nodes, segments } = model;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // rail clicks navigate with ?lead= — pin that lead's dossier
  useEffect(() => {
    if (initialLeadId && nodes.some((n) => n.id === initialLeadId)) setSelectedId(initialLeadId);
  }, [initialLeadId, nodes]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, SVGGElement>());
  const posRef = useRef(new Map<string, Pos>());

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
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      // no motion: place every node exactly where it lives
      nodes.forEach((n, i) => {
        const { x, y } = orbitTarget(n, i, 0);
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
      const k = smoothK(nowMs - last);
      last = nowMs;
      nodes.forEach((n, i) => {
        const el = nodeRefs.current.get(n.id);
        if (!el) return;
        const target = replayPos(n, i, t, stagger) ?? orbitTarget(n, i, t);
        const prev = posRef.current.get(n.id) ?? target;
        const next = { x: prev.x + (target.x - prev.x) * k, y: prev.y + (target.y - prev.y) * k };
        posRef.current.set(n.id, next);
        el.setAttribute('transform', `translate(${next.x.toFixed(1)}, ${next.y.toFixed(1)})`);
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [nodes]);

  if (nodes.length === 0) {
    return <p className="py-6 text-center font-mono text-[11.5px] text-os-dim">No journeys for this filter yet.</p>;
  }

  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  // hover-or-pinned node → the top readout (click first, else the hovered one)
  const anchorNode = selected ?? (hoverId ? nodes.find((n) => n.id === hoverId) ?? null : null);
  const convertedTotal = segments.reduce((sum, s) => sum + s.converted, 0);

  return (
    <div ref={rootRef} className="funnel-space-root relative">
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

      {/* hover readout — what the cursor is on, listed at the top, no click */}
      {anchorNode && (
        <div className="pointer-events-none absolute left-2 top-1.5 z-20 flex items-baseline gap-2 font-mono">
          <span className="text-[12px] font-semibold text-os-text">{anchorNode.name}</span>
          <span className="text-[9.5px] uppercase tracking-[0.12em] text-os-dim">
            {anchorNode.likelihood}% · {anchorNode.daysSinceLastTouch}d quiet
          </span>
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label="Clients spiralling from their acquisition source into the conversion core"
        onClick={() => setSelectedId(null)}
      >
        {/* stage rings — the journey's depth markers, outside → in */}
        {RING.slice(0, -1).map((r, s) => (
          <g key={`ring-${s}`}>
            <circle cx={CX} cy={CY} r={r} fill="none" stroke="var(--border)" strokeDasharray="2 6" />
            <text
              x={CX + 9}
              y={CY - r + 13}
              fill="var(--text-3)"
              fontSize={9}
              fontFamily="var(--font-mono)"
              style={{ textTransform: 'uppercase', letterSpacing: '0.14em' }}
            >
              {FUNNEL_STAGES[s].label}
            </text>
          </g>
        ))}

        {/* wedge spokes + rim labels */}
        {segments.map((seg, sIdx) => {
          const boundary = TOP + sIdx * SEG_SPAN;
          const mid = boundary + SEG_SPAN / 2;
          const lp = polar(mid, RING[0] + 24);
          const cos = Math.cos(mid);
          const anchor = cos > 0.35 ? 'start' : cos < -0.35 ? 'end' : 'middle';
          return (
            <g key={seg.id}>
              <line
                x1={polar(boundary, RING[4] + 12).x}
                y1={polar(boundary, RING[4] + 12).y}
                x2={polar(boundary, RING[0]).x}
                y2={polar(boundary, RING[0]).y}
                stroke="var(--border)"
                strokeOpacity={0.7}
              />
              <circle cx={polar(mid, RING[0]).x} cy={polar(mid, RING[0]).y} r={2.5} fill={WEDGE_COLOR[sIdx]} />
              <text
                x={lp.x}
                y={Math.round((lp.y + Math.sin(mid) * 7 + 3) * 100) / 100}
                textAnchor={anchor}
                fill={seg.count > 0 ? 'var(--text-2)' : 'var(--text-3)'}
                fontSize={10.5}
                fontFamily="var(--font-mono)"
                style={{ textTransform: 'uppercase', letterSpacing: '0.14em' }}
              >
                {seg.label} · {seg.count}
                {seg.converted > 0 && (
                  <tspan fill="var(--ok)"> ✓{seg.converted}</tspan>
                )}
              </text>
            </g>
          );
        })}

        {/* the core — inside is where they bought */}
        <circle
          className="funnel-hub-ring"
          cx={CX}
          cy={CY}
          r={RING[4] + 10}
          fill="none"
          stroke="var(--ok)"
          strokeOpacity={0.45}
          strokeDasharray="3 7"
        />
        <circle cx={CX} cy={CY} r={RING[4]} fill="var(--surface-2)" stroke="var(--ok)" strokeOpacity={0.55} strokeWidth={1.2} />
        <text
          x={CX}
          y={CY - 2}
          textAnchor="middle"
          fill="var(--text-2)"
          fontSize={10}
          fontFamily="var(--font-mono)"
          style={{ textTransform: 'uppercase', letterSpacing: '0.18em' }}
        >
          converted
        </text>
        <text x={CX} y={CY + 14} textAnchor="middle" fill="var(--ok)" fontSize={13} fontFamily="var(--font-mono)">
          {convertedTotal}
        </text>

        {/* the clients */}
        {nodes.map((n, i) => {
          const color = decayedColor(WEDGE_COLOR[n.segment], n.decay, n.state === 'converted');
          const emphasized = hoverId === n.id || selectedId === n.id;
          const pulses = n.state === 'converted' || (n.relationship === 'hot' && n.decay < 0.5);
          const start = polar(wedgeAngle(n, i), RING[0] + 46);
          return (
            <g
              key={n.id}
              ref={(el) => {
                if (el) nodeRefs.current.set(n.id, el);
                else nodeRefs.current.delete(n.id);
              }}
              transform={`translate(${start.x.toFixed(1)}, ${start.y.toFixed(1)})`}
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
              <circle
                r={n.radius + 2.5}
                fill="none"
                stroke={color}
                strokeWidth={0.8}
                opacity={emphasized ? 0.9 : 0.35 * decayedOpacity(n.decay)}
                strokeDasharray={n.relationship === 'cold' ? '2 3' : undefined}
              />
              {n.relationship === 'hot' && (
                <circle r={n.radius + 5} fill="none" stroke={color} strokeWidth={0.6} opacity={0.25 * decayedOpacity(n.decay)} />
              )}
              <circle r={n.radius} fill={color} stroke="var(--bg)" strokeWidth={1} opacity={emphasized ? 1 : decayedOpacity(n.decay)} />
              {emphasized && (
                <text y={-n.radius - 9} textAnchor="middle" fill="var(--text)" fontSize={11} fontFamily="var(--font-mono)" style={{ pointerEvents: 'none' }}>
                  {n.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {selected && <FunnelNodeCard node={selected} onClose={() => setSelectedId(null)} />}

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wide text-os-dim">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--funnel-s1)' }} /> hue = where they came from
        </span>
        <span>rings run outside → in · center = purchase</span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: 'color-mix(in oklab, var(--err) 70%, var(--funnel-s1))', opacity: 0.6 }}
          />{' '}
          fades red after {DECAY_FADE_START}d quiet → archive at {DECAY_DAYS}d
        </span>
        <span className="ml-auto">untracked = word of mouth until Trakyo UTMs land · click a node</span>
      </div>
    </div>
  );
}
