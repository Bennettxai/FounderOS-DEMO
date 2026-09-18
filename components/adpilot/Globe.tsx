'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoPoint } from '@/lib/adpilot';

/**
 * The AdPilot globe: dot-matrix earth from real coastline samples
 * (public/adpilot/globe-dots.json), black ocean, a wide atmospheric red
 * bleed behind the horizon, teardrop pins where leads book from, and glass
 * label chips on the top cities (projected each frame, hidden when they
 * rotate behind the planet). Drag to rotate with inertia; idles into a slow
 * spin. All motion is camera/inertia: the data never fakes movement.
 *
 * Plain 2D canvas, no WebGL library: the production host
 * builds from main without installing new dependencies, so this file owns
 * its own orthographic projection instead of pulling three.js.
 */

type Props = {
  geo: GeoPoint[];
  height?: number;
};

const TILT = 0.32;
/** The canvas overhangs the layout slot by this much on top and bottom. */
const OVERHANG = 40;
const CHIP_COUNT = 6;
const RED = '255, 52, 72';
const PIN = '#ff4557';
const PIN_CORE = '#8f1520';

type Vec = { x: number; y: number; z: number };

/** Unit vector on the sphere: +y north, +z toward the viewer at yaw 0. */
function latLngToVec(lat: number, lng: number): Vec {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lng * Math.PI) / 180;
  return { x: Math.cos(phi) * Math.cos(lambda), y: Math.sin(phi), z: -Math.cos(phi) * Math.sin(lambda) };
}

/** Rotate about Y (yaw) then about X (pitch): the same order the old world group used. */
function rotate(v: Vec, yaw: number, pitch: number): Vec {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = v.x * cy + v.z * sy;
  const z1 = -v.x * sy + v.z * cy;
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const y2 = v.y * cx - z1 * sx;
  const z2 = v.y * sx + z1 * cx;
  return { x: x1, y: y2, z: z2 };
}

function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, h: number) {
  // Teardrop, tip anchored at (x, y): head circle, tapered tip, darker core.
  const headR = h * 0.23;
  const headY = y - h + headR + h * 0.06;
  ctx.fillStyle = PIN;
  ctx.beginPath();
  ctx.arc(x, headY, headR, Math.PI * 0.93, Math.PI * 0.07, false);
  ctx.quadraticCurveTo(x + headR * 0.55, headY + headR * 1.15, x, y);
  ctx.quadraticCurveTo(x - headR * 0.55, headY + headR * 1.15, x - headR * Math.cos(Math.PI * 0.07), headY + headR * Math.sin(Math.PI * 0.07));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PIN_CORE;
  ctx.beginPath();
  ctx.arc(x, headY, headR * 0.42, 0, Math.PI * 2);
  ctx.fill();
}

export function Globe({ geo, height = 560 }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const geoRef = useRef(geo);
  geoRef.current = geo;
  const [tooltip, setTooltip] = useState<{ x: number; y: number; g: GeoPoint } | null>(null);
  const [ready, setReady] = useState(false);
  const chipRefs = useRef<(HTMLDivElement | null)[]>([]);

  // The labeled cities: top N by leads for the current selection.
  const chipCities = useMemo(() => [...geo].sort((a, b) => b.leads - a.leads).slice(0, CHIP_COUNT), [geo]);
  const chipRef = useRef(chipCities);
  chipRef.current = chipCities;

  useEffect(() => {
    const mount = mountRef.current;
    const canvas = canvasRef.current;
    if (!mount || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvasH = height + OVERHANG * 2;
    let w = mount.clientWidth;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = mount.clientWidth;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(canvasH * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${canvasH}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // Landmass dot matrix from the baked coastline samples.
    let land: Vec[] = [];
    let disposed = false;
    fetch('/adpilot/globe-dots.json')
      .then((r) => r.json())
      .then((dots: [number, number][]) => {
        if (disposed) return;
        land = dots.map(([lat, lng]) => latLngToVec(lat, lng));
        setReady(true);
      })
      .catch(() => setReady(true)); // globe still renders body + atmosphere + pins

    // Drag rotation with inertia + idle spin.
    let yaw = 0;
    let pitch = TILT;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let velocity = reduced ? 0 : 0.0016;
    let idleTimer = 0;
    // Projected pin hit areas from the last frame, for hover picking.
    let hits: Array<{ x: number; y: number; r: number; g: GeoPoint }> = [];

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        yaw += dx * 0.005;
        pitch = Math.max(-0.9, Math.min(0.9, pitch + dy * 0.0028));
        velocity = dx * 0.0006;
        idleTimer = 0;
      }
      const rect = canvas.getBoundingClientRect();
      const mountRect = mount.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const hit = hits.find((h) => Math.hypot(px - h.x, py - h.y) <= h.r);
      if (hit) {
        setTooltip({ x: e.clientX - mountRect.left, y: e.clientY - mountRect.top, g: hit.g });
        canvas.style.cursor = 'pointer';
      } else {
        setTooltip(null);
        canvas.style.cursor = dragging ? 'grabbing' : 'grab';
      }
    };
    const onUp = () => {
      dragging = false;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!dragging && !reduced) {
        yaw += velocity;
        idleTimer += 1;
        if (idleTimer > 120) velocity += (0.0016 - velocity) * 0.02;
        else velocity *= 0.985;
      }

      const cx = w / 2;
      const cy = canvasH / 2;
      const R = Math.min(w, canvasH) * 0.36; // atmosphere stays inside 88% of the canvas
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, canvasH);

      // One continuous atmosphere: a wide soft bleed behind the horizon...
      const bleed = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.3);
      bleed.addColorStop(0, `rgba(${RED}, 0.55)`);
      bleed.addColorStop(0.35, `rgba(${RED}, 0.16)`);
      bleed.addColorStop(1, `rgba(${RED}, 0)`);
      ctx.fillStyle = bleed;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.3, 0, Math.PI * 2);
      ctx.fill();
      // ...the black body...
      ctx.fillStyle = '#05080a';
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      // ...and a bright fresnel limb on the body, peaking at the horizon.
      const limb = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R);
      limb.addColorStop(0, `rgba(${RED}, 0)`);
      limb.addColorStop(0.75, `rgba(${RED}, 0.12)`);
      limb.addColorStop(1, `rgba(${RED}, 0.6)`);
      ctx.fillStyle = limb;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // Land dots: front hemisphere only, dimming toward the horizon.
      const dot = Math.max(1, R * 0.0065);
      for (const p of land) {
        const v = rotate(p, yaw, pitch);
        if (v.z <= 0) continue;
        const a = 0.25 + 0.67 * v.z;
        ctx.fillStyle = `rgba(168, 162, 159, ${a.toFixed(3)})`;
        ctx.fillRect(cx + v.x * R - dot / 2, cy - v.y * R - dot / 2, dot, dot);
      }

      // Pins with a soft ground halo, sized by leads; tip anchored on the surface.
      const points = geoRef.current;
      const max = Math.max(...points.map((g) => g.leads), 1);
      hits = [];
      for (const g of points) {
        const v = rotate(latLngToVec(g.lat, g.lng), yaw, pitch);
        if (v.z <= 0) continue;
        const x = cx + v.x * R * 1.002;
        const y = cy - v.y * R * 1.002;
        const s = (0.052 + 0.03 * Math.sqrt(g.leads / max)) * R;
        const halo = ctx.createRadialGradient(x, y, 0, x, y, s * 0.8);
        halo.addColorStop(0, 'rgba(255,69,87,0.75)');
        halo.addColorStop(0.4, 'rgba(255,69,87,0.22)');
        halo.addColorStop(1, 'rgba(255,69,87,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(x, y, s * 0.8, 0, Math.PI * 2);
        ctx.fill();
        drawPin(ctx, x, y, s);
        hits.push({ x, y: y - s * 0.7, r: Math.max(8, s * 0.3), g });
      }

      // Project the labeled cities; hide behind-horizon and clipped chips.
      chipRef.current.forEach((g, i) => {
        const el = chipRefs.current[i];
        if (!el) return;
        const v = rotate(latLngToVec(g.lat, g.lng), yaw, pitch);
        const x = cx + v.x * R * 1.01;
        const y = cy - v.y * R * 1.01 - OVERHANG;
        // keep chips fully inside the hero slot: clipped labels read broken
        const inBounds = x > 60 && x < w - 216 && y > 26 && y < height - 14; // 216 = floater column
        // Stagger anchors left/right of the pin so clustered cities don't stack.
        const side = i % 2 === 0 ? `translate(${Math.round(x + 12)}px, ${Math.round(y - 30)}px)` : `translate(${Math.round(x - 12)}px, ${Math.round(y - 46)}px) translateX(-100%)`;
        el.style.transform = side;
        el.style.opacity = v.z > 0 && inBounds ? '1' : '0';
      });
    };
    frame();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [height]);

  return (
    <div
      ref={mountRef}
      className="relative w-full touch-none transition-[opacity,transform] duration-[1100ms] ease-out"
      // overflow stays visible so the overhanging canvas can breathe
      style={{ height, opacity: ready ? 1 : 0, transform: ready ? 'scale(1)' : 'scale(0.965)' }}
    >
      <canvas ref={canvasRef} className="absolute left-0 z-0" style={{ top: -OVERHANG }} aria-hidden="true" />
      {/* Top-city label chips, driven by the render loop (no re-renders). */}
      {chipCities.map((g, i) => (
        <div
          key={`${g.city}-${g.country}`}
          ref={(el) => {
            chipRefs.current[i] = el;
          }}
          className="pointer-events-none absolute left-0 top-0 z-20 flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[rgba(255,69,87,0.28)] bg-[#0a0507e6] px-2.5 py-1 opacity-0 transition-opacity duration-200"
        >
          <span className="text-[12px] text-os-text">{g.city}</span>
          <span className="text-[11px] tabular-nums text-os-muted">{g.leads} leads</span>
        </div>
      ))}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-30 rounded-[9px] border border-[rgba(255,69,87,0.35)] bg-[#0a0507ee] px-3 py-2"
          style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
        >
          <div className="text-[12.5px] text-os-text">
            {tooltip.g.city}, {tooltip.g.country}
          </div>
          <div className="text-[11.5px] text-os-muted">
            {tooltip.g.leads} leads · {tooltip.g.bookings} booked
          </div>
        </div>
      )}
    </div>
  );
}
