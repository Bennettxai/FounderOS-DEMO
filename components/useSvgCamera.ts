'use client';

/**
 * The G-Brain radial's camera, extracted for reuse: hover leans
 * the scene toward the cursor (eased micro-zoom), trackpad pinch zooms at the
 * cursor, two-finger scroll pans, double-click resets. Attach the returned
 * refs to an <svg> (with a centered viewBox) and a wrapper <g>; everything is
 * written straight to the transform attribute from a rAF loop, so React never
 * re-renders for camera motion. Honors prefers-reduced-motion.
 *
 * Optional programmatic target (additive): callers can also drive
 * the camera in code via the returned `setTarget({x, y, s})`: e.g. Skills'
 * deep-zoom into a cluster. It writes straight into the same `user` state the
 * mouse/wheel handlers drive, so the existing rAF loop eases toward it with
 * no separate animation path; `setTarget(null)` resets to identity, same as
 * a double-click. Existing callers that only destructure `{ svgRef, camGRef }`
 * (G-Brain, KnowledgeCanvas) are unaffected: this is a new return key only.
 */

import { useCallback, useEffect, useRef } from 'react';

export type CameraTarget = { x: number; y: number; s: number };

export function useSvgCamera(viewBoxSpan: number, enabled = true, microZoom = 1.13, wheel = true) {
  // wheel=false keeps the hover glide but lets the page scroll through the
  // scene: the inline-embed contract (G-Brain set it, Skills follows it).
  // viewBoxSpan is the fallback when the element has no viewBox; the hook
  // reads the real one per event so non-square scenes anchor correctly.
  const svgRef = useRef<SVGSVGElement>(null);
  const camGRef = useRef<SVGGElement>(null);
  // Hoisted out of the effect so setTarget can reach the live camera state
  // across renders without retriggering the effect.
  const userRef = useRef({ s: 1, tx: 0, ty: 0 });

  const setTarget = useCallback((t: CameraTarget | null) => {
    const user = userRef.current;
    if (t) {
      user.s = t.s;
      user.tx = t.x;
      user.ty = t.y;
    } else {
      user.s = 1;
      user.tx = 0;
      user.ty = 0;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const svg = svgRef.current;
    if (!svg) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const user = userRef.current;
    const cam = { s: 1, tx: 0, ty: 0 };
    let cursor: { x: number; y: number } | null = null;

    const fitOf = (r: DOMRect) => {
      const vb = svg.viewBox.baseVal;
      const w = vb && vb.width > 0 ? vb.width : viewBoxSpan;
      const h = vb && vb.height > 0 ? vb.height : viewBoxSpan;
      return Math.min(r.width / w, r.height / h);
    };
    const toView = (e: { clientX: number; clientY: number }) => {
      const r = svg.getBoundingClientRect();
      const fit = fitOf(r);
      return { x: (e.clientX - r.left - r.width / 2) / fit, y: (e.clientY - r.top - r.height / 2) / fit };
    };
    // the scene can never leave the screen entirely: panning/zooming keeps
    // at least ~30% of the viewBox overlapping the viewport
    const clampPan = () => {
      const vb = svg.viewBox.baseVal;
      const w = vb && vb.width > 0 ? vb.width : viewBoxSpan;
      const h = vb && vb.height > 0 ? vb.height : viewBoxSpan;
      const maxTx = ((1 + user.s) * w) / 2 - w * 0.3;
      const maxTy = ((1 + user.s) * h) / 2 - h * 0.3;
      user.tx = Math.max(-maxTx, Math.min(maxTx, user.tx));
      user.ty = Math.max(-maxTy, Math.min(maxTy, user.ty));
    };
    const move = (e: MouseEvent) => {
      cursor = toView(e);
    };
    const leave = () => {
      cursor = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toView(e);
      if (e.ctrlKey || e.metaKey) {
        const s2 = Math.min(3, Math.max(0.7, user.s * Math.exp(-e.deltaY * 0.012)));
        user.tx = p.x - (s2 / user.s) * (p.x - user.tx);
        user.ty = p.y - (s2 / user.s) * (p.y - user.ty);
        user.s = s2;
      } else {
        const fit = fitOf(svg.getBoundingClientRect());
        user.tx -= e.deltaX / fit;
        user.ty -= e.deltaY / fit;
      }
      clampPan();
    };
    const dbl = () => {
      user.s = 1;
      user.tx = 0;
      user.ty = 0;
    };
    svg.addEventListener('mousemove', move);
    svg.addEventListener('mouseleave', leave);
    if (wheel) svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('dblclick', dbl);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const micro = !reduced && cursor ? microZoom : 1;
      const sT = user.s * micro;
      const txT = cursor ? micro * user.tx + (1 - micro) * cursor.x : user.tx;
      const tyT = cursor ? micro * user.ty + (1 - micro) * cursor.y : user.ty;
      const k = reduced ? 1 : 1 - Math.exp(-dt * 5);
      cam.s += (sT - cam.s) * k;
      cam.tx += (txT - cam.tx) * k;
      cam.ty += (tyT - cam.ty) * k;
      camGRef.current?.setAttribute('transform', `translate(${cam.tx.toFixed(2)} ${cam.ty.toFixed(2)}) scale(${cam.s.toFixed(4)})`);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      svg.removeEventListener('mousemove', move);
      svg.removeEventListener('mouseleave', leave);
      if (wheel) svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('dblclick', dbl);
    };
  }, [viewBoxSpan, enabled, microZoom, wheel]);

  return { svgRef, camGRef, setTarget };
}
