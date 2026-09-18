'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, type AnimationEvent, type CSSProperties, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Hierarchy, HierarchyIndex, HContainer, HGroup } from '@/lib/blueprint/hierarchy';
import { KIND_ICON } from '@/lib/blueprint/hierarchy';
import { fitAllCam, fitTopCam, flyToCam, GRID, rep, roundedPath, zoomCam, type Box, type Cam, type DrawnEdge, type Layout } from '@/lib/blueprint/hierarchy-layout';
import { HierarchyNode } from './HierarchyNode';
import { iconFor } from './icons';

export type FocusMode = { mode: 'none' } | { mode: 'filter'; match: Set<string> } | { mode: 'focus'; selected: string; hot: Set<string> };

export interface CanvasHandle {
  fitAll: (animate?: boolean) => void;
  fitTop: () => void;
  flyTo: (id: string, s: number) => void;
  zoomBy: (f: number) => void;
  /** run a flare along a structural edge; resolves when it arrives */
  runFlare: (edgeId: string, ms?: number) => Promise<void>;
}

interface Props {
  h: Hierarchy;
  idx: HierarchyIndex;
  layout: Layout;
  spine: DrawnEdge[];
  focusEdges: DrawnEdge[];
  focusColor: string | null;
  focus: FocusMode;
  lit: Set<string>;
  onSelect: (id: string | null) => void;
  onToggle: (id: string) => void;
  onFly: (id: string) => void;
}

const EASE = (t: number) => 1 - Math.pow(1 - t, 5);

/**
 * The stage: containers, frames and cards as positioned HTML over two SVG
 * layers (structural traces below, the selection's relations on top), a
 * pan/zoom camera that mutates the world transform directly (no React
 * render per frame), and the perf rules learned on the concept: the dot
 * grid lives in screen space, `will-change` only on the world, blur and
 * backdrop filters drop while the camera moves.
 */
export const HierarchyCanvas = forwardRef<CanvasHandle, Props>(function HierarchyCanvas({ h, idx, layout, spine, focusEdges, focusColor, focus, lit, onSelect, onToggle, onFly }, ref) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const flareRef = useRef<SVGGElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLDivElement>(null);
  const cam = useRef<Cam>({ x: 0, y: 0, s: 1 });
  const anim = useRef<number | null>(null);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panning = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const mounted = useRef<Set<string>>(new Set());
  const firstRender = useRef(true);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const view = () => ({ w: canvasRef.current?.clientWidth ?? 1200, h: canvasRef.current?.clientHeight ?? 800 });

  const applyCam = useCallback(() => {
    const c = canvasRef.current;
    const w = worldRef.current;
    if (!c || !w) return;
    const { x, y, s } = cam.current;
    w.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    if (pctRef.current) pctRef.current.textContent = `${Math.round(s * 100)}%`;
    let pitch = GRID * s;
    while (pitch < 18) pitch *= 2; // double the pitch when dots would crowd
    c.style.setProperty('--gs', `${pitch}px`);
    c.style.setProperty('--gox', `${((x % pitch) + pitch) % pitch}px`);
    c.style.setProperty('--goy', `${((y % pitch) + pitch) % pitch}px`);
    c.style.setProperty('--ga', String(Math.max(0.35, Math.min(1, (s - 0.15) / 0.5))));
    c.classList.add('is-moving');
    if (moveTimer.current) clearTimeout(moveTimer.current);
    moveTimer.current = setTimeout(() => c.classList.remove('is-moving'), 180);
  }, []);

  const tween = useCallback(
    (to: Cam, dur = 620) => {
      if (anim.current) cancelAnimationFrame(anim.current);
      const from = { ...cam.current };
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / dur);
        const k = EASE(t);
        cam.current = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, s: from.s + (to.s - from.s) * k };
        applyCam();
        if (t < 1) anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    },
    [applyCam],
  );

  useImperativeHandle(
    ref,
    () => ({
      fitAll: (animate = true) => {
        const { w, h: hh } = view();
        const to = fitAllCam(layoutRef.current, w, hh);
        if (animate) tween(to);
        else {
          cam.current = to;
          applyCam();
        }
      },
      fitTop: () => {
        cam.current = fitTopCam(layoutRef.current, view().w);
        applyCam();
      },
      flyTo: (id, s) => {
        const b = rep(layoutRef.current, idx, id);
        if (!b) return;
        const { w, h: hh } = view();
        tween(flyToCam(b, s, w, hh));
      },
      zoomBy: (f) => {
        const { w, h: hh } = view();
        tween(zoomCam(cam.current, f, w / 2, hh / 2), 260);
      },
      runFlare: (edgeId, ms = 560) =>
        new Promise<void>((resolve) => {
          const world = worldRef.current;
          const layer = flareRef.current;
          if (!world || !layer) return resolve();
          const path = world.querySelector<SVGPathElement>(`.bh-edge[data-id="${edgeId}"] .line`);
          if (!path) return resolve();
          const len = path.getTotalLength();
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c.setAttribute('class', 'bh-flare');
          c.setAttribute('r', '9');
          layer.appendChild(c);
          const t0 = performance.now();
          const step = (now: number) => {
            const t = Math.min(1, (now - t0) / ms);
            const p = path.getPointAtLength(len * t);
            c.setAttribute('cx', String(p.x));
            c.setAttribute('cy', String(p.y));
            if (t < 1) requestAnimationFrame(step);
            else {
              c.remove();
              resolve();
            }
          };
          requestAnimationFrame(step);
        }),
    }),
    [applyCam, idx, tween],
  );

  // first view + resize: fit the width, anchor the top
  useLayoutEffect(() => {
    cam.current = fitTopCam(layout, view().w);
    applyCam();
    const onResize = () => {
      cam.current = fitTopCam(layoutRef.current, view().w);
      applyCam();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    firstRender.current = false;
  }, []);

  // ── pointer: pan, zoom, glow spot ───────────────────────────────────
  const isChrome = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('.bh-node, .bh-frame-head, .bh-ch');
  const onPointerDown = (ev: RPointerEvent<HTMLDivElement>) => {
    if (ev.button !== 0 || isChrome(ev.target)) return;
    panning.current = { x: ev.clientX, y: ev.clientY, cx: cam.current.x, cy: cam.current.y, moved: false };
    canvasRef.current?.classList.add('is-panning');
    canvasRef.current?.setPointerCapture(ev.pointerId);
  };
  const onPointerMove = (ev: RPointerEvent<HTMLDivElement>) => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    if (spotRef.current) spotRef.current.style.transform = `translate(${ev.clientX - r.left}px, ${ev.clientY - r.top}px)`;
    const p = panning.current;
    if (!p) return;
    const dx = ev.clientX - p.x;
    const dy = ev.clientY - p.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) p.moved = true;
    cam.current.x = p.cx + dx;
    cam.current.y = p.cy + dy;
    applyCam();
  };
  const onPointerUp = (ev: RPointerEvent<HTMLDivElement>) => {
    const p = panning.current;
    if (p && !p.moved && !isChrome(ev.target)) onSelect(null);
    panning.current = null;
    canvasRef.current?.classList.remove('is-panning');
  };
  const onWheel = (ev: RWheelEvent<HTMLDivElement>) => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    if (ev.ctrlKey || ev.metaKey) cam.current = zoomCam(cam.current, Math.exp(-ev.deltaY * 0.01), ev.clientX - r.left, ev.clientY - r.top);
    else {
      cam.current.x -= ev.deltaX;
      cam.current.y -= ev.deltaY;
    }
    applyCam();
  };
  // wheel must be non-passive to stop the page from scrolling under the map
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const stop = (e: WheelEvent) => e.preventDefault();
    c.addEventListener('wheel', stop, { passive: false });
    return () => c.removeEventListener('wheel', stop);
  }, []);

  const onDoubleClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    const n = (ev.target as HTMLElement).closest<HTMLElement>('.bh-node');
    if (n?.dataset.id) onFly(n.dataset.id);
  };
  const onNodesClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    const n = (ev.target as HTMLElement).closest<HTMLElement>('.bh-node');
    if (!n?.dataset.id) return;
    if (n.dataset.mode === 'g') onToggle(n.dataset.id);
    else onSelect(n.dataset.id);
  };
  const onFramesClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    const head = (ev.target as HTMLElement).closest<HTMLElement>('.bh-frame-head');
    if (!head) return;
    const id = head.parentElement?.dataset.id;
    if (!id) return;
    if ((ev.target as HTMLElement).closest('.bh-fc')) onToggle(id);
    else onSelect(id);
  };
  const onFramesDoubleClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    const head = (ev.target as HTMLElement).closest<HTMLElement>('.bh-frame-head');
    const id = head?.parentElement?.dataset.id;
    if (id) onToggle(id);
  };
  const onContainersClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    const head = (ev.target as HTMLElement).closest<HTMLElement>('.bh-ch');
    const id = head?.parentElement?.dataset.id;
    if (id) onSelect(id);
  };

  // ── focus classes ───────────────────────────────────────────────────
  const stateClass = (id: string, isContainer: boolean): string => {
    const parts: string[] = [];
    if (lit.has(id)) parts.push('is-lit');
    if (focus.mode === 'filter') {
      const hit = isContainer || focus.match.has(id);
      if (!hit) parts.push('is-dim');
      else if (!isContainer) parts.push('is-match');
    } else if (focus.mode === 'focus') {
      if (id === focus.selected) parts.push('is-selected');
      else if (focus.hot.has(id)) parts.push('is-hot');
      else parts.push('is-dim');
    }
    return parts.join(' ');
  };
  const edgesDim = focus.mode !== 'none';

  const onAnimEnd = (e: AnimationEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const id = el.dataset.id;
    if (!id) return;
    mounted.current.add(id);
    el.classList.remove('is-enter', 'is-new');
  };

  const containers: Box[] = [];
  const frames: Box[] = [];
  const nodes: Box[] = [];
  for (const b of layout.boxes.values()) {
    if (b.kind === 'container') containers.push(b);
    else if (b.kind === 'frame') frames.push(b);
    else nodes.push(b);
  }

  const renderEdge = (e: DrawnEdge, i: number, extraCls: string) => {
    const d = roundedPath(e.pts);
    const p0 = e.pts[0];
    const pn = e.pts[e.pts.length - 1];
    const style = e.color ? ({ '--ec': e.color } as CSSProperties) : undefined;
    if (e.bare) {
      return (
        <g key={`${e.id}-${i}`} className={`bh-edge ${e.cls} ${extraCls}`} data-id={e.id}>
          <path className="glow" d={d} />
          <path className="line" d={d} />
        </g>
      );
    }
    const a = e.pts[e.pts.length - 2] ?? p0;
    const m = { x: (a.x + pn.x) / 2, y: (a.y + pn.y) / 2 };
    return (
      <g key={`${e.id}-${i}`} className={`bh-edge ${e.cls} ${extraCls}`} data-id={e.id} style={style}>
        <path className="glow" d={d} />
        <path className="line" d={d} />
        <path className="flow" d={d} />
        <circle className="port" cx={p0.x} cy={p0.y} r={4} />
        <circle className="port" cx={pn.x} cy={pn.y} r={4} />
        {e.plus && (
          <>
            <circle className="port" cx={m.x} cy={m.y} r={6} />
            <path className="port-plus" d={`M ${m.x - 3} ${m.y} H ${m.x + 3} M ${m.x} ${m.y - 3} V ${m.y + 3}`} />
          </>
        )}
      </g>
    );
  };

  const focusStyle = focusColor ? ({ '--ec': focusColor } as CSSProperties) : undefined;

  return (
    <div ref={canvasRef} className="bh-canvas" tabIndex={0} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={onWheel} onDoubleClick={onDoubleClick}>
      <div ref={spotRef} className="bh-glow-spot" />
      <div ref={worldRef} className="bh-world">
        <svg className="bh-edges" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="bh-flare">
              <stop offset="0" stopColor="var(--bh-flare)" />
              <stop offset="0.35" stopColor="var(--accent)" stopOpacity="0.85" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g>{spine.map((e, i) => renderEdge(e, i, `${edgesDim ? 'is-dim' : ''} ${lit.has(e.id) ? 'is-lit' : ''}`))}</g>
          <g ref={flareRef} />
        </svg>
        <div className="bh-layer" onClick={onContainersClick}>
          {containers.map((b) => {
            const c = b.it as HContainer;
            const Icon = iconFor(c.icon || 'server');
            return (
              <div key={b.id} className={`bh-container k-${c.kind} ${stateClass(b.id, true)}`} data-id={b.id} style={{ width: `${b.w}px`, height: `${b.h}px`, transform: `translate(${b.x}px, ${b.y}px)` }}>
                {c.kind !== 'operator' && (
                  <div className="bh-ch">
                    <span className="bh-ci">
                      <Icon />
                    </span>
                    <div>
                      <div className="bh-ct">{c.name}</div>
                      <div className="bh-cs">{c.sub}</div>
                    </div>
                  </div>
                )}
                {c.kind !== 'operator' && Object.keys(c.facts).length > 0 && (
                  <div className="bh-cf">
                    {Object.entries(c.facts).map(([k, v]) => (
                      <span key={k}>
                        {k} · {v}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="bh-layer" onClick={onFramesClick} onDoubleClick={onFramesDoubleClick}>
          {frames.map((b) => {
            const g = b.it as HGroup;
            const Icon = iconFor(g.icon || KIND_ICON[g.kind]);
            return (
              <div key={b.id} className={`bh-frame k-${g.kind} ${stateClass(b.id, false)}`} data-id={b.id} style={{ width: `${b.w}px`, height: `${b.h}px`, transform: `translate(${b.x}px, ${b.y}px)`, '--c': `var(--bh-k-${g.kind}, var(--text-2))` } as CSSProperties}>
                <div className="bh-frame-head">
                  <span className="bh-fi">
                    <Icon />
                  </span>
                  <span className="bh-ft">{g.name}</span>
                  <span className="bh-fs">{g.sub}</span>
                  <span className="bh-fc">
                    {g.badge ? <span className={`bh-gb s-${g.status ?? ''}`}>{g.badge}</span> : <span className="n">{idx.countLeaves(g)}</span>}
                    <ChevronDown />
                  </span>
                </div>
                <div className="bh-frame-band" />
              </div>
            );
          })}
        </div>
        <div className="bh-layer" onClick={onNodesClick}>
          {nodes.map((b, i) => {
            const fresh = !mounted.current.has(b.id);
            const enter = fresh ? (firstRender.current ? 'is-enter' : 'is-new') : '';
            const delay = fresh && firstRender.current ? `${Math.min(i * 12, 600)}ms` : undefined;
            return <HierarchyNode key={b.id} box={b} className={`${enter} ${stateClass(b.id, false)}`} enterDelay={delay} onAnimationEnd={onAnimEnd} />;
          })}
        </div>
        <svg className="bh-edges bh-edges-top" xmlns="http://www.w3.org/2000/svg" style={focusStyle}>
          <g>{focusEdges.map((e, i) => renderEdge({ ...e, color: e.color ?? focusColor ?? undefined }, i, 'is-anim'))}</g>
        </svg>
        <div className="bh-layer bh-labels">
          {spine.map((e, i) =>
            e.label && e.labelAt ? (
              <div key={`${e.id}-${i}`} className={`bh-pill ${e.cls} ${edgesDim ? 'is-dim' : ''} ${lit.has(e.id) ? 'hot' : ''}`} data-edge={e.id} style={{ left: `${e.labelAt.x}px`, top: `${e.labelAt.y}px` }}>
                {e.label}
              </div>
            ) : null,
          )}
          {focusEdges.map((e, i) =>
            e.label && e.labelAt ? (
              <div key={`${e.id}-${i}`} className="bh-pill dyn" style={{ left: `${e.labelAt.x}px`, top: `${e.labelAt.y}px`, ...(focusStyle ?? {}) }}>
                {e.label}
              </div>
            ) : null,
          )}
        </div>
      </div>
      <div className="bh-hud bh-hud-zoom">
        <button type="button" className="pressable bh-hud-btn" aria-label="Zoom in" onClick={() => tween(zoomCam(cam.current, 1.25, view().w / 2, view().h / 2), 260)}>
          <PlusIcon />
        </button>
        <button type="button" className="pressable bh-hud-btn" aria-label="Zoom out" onClick={() => tween(zoomCam(cam.current, 0.8, view().w / 2, view().h / 2), 260)}>
          <MinusIcon />
        </button>
        <div ref={pctRef} className="bh-hud-pct">
          100%
        </div>
      </div>
    </div>
  );
});

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M5 12h14" />
    </svg>
  );
}

export { rep };
