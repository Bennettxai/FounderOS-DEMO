'use client';

import { useEffect } from 'react';

/**
 * One document-level pointermove listener powers the whole hover-lens layer:
 * every [data-lens] element gets --lx/--ly (magnetic pull, px) and --rx/--ry
 * (tilt, deg) while the pointer is over it, and the nearest [data-spot]
 * ancestor gets --sx/--sy for its .spotlight radial, and :root gets --px/--py
 * (viewport coords) for the page-wide .spotlight.is-page layer. Controls
 * (data-lens="c") pull 4px, rows ("r") 2px. Disabled entirely under
 * prefers-reduced-motion.
 */
export function useLens() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let lensEl: HTMLElement | null = null;
    let spotEl: HTMLElement | null = null;
    const VARS = ['--lx', '--ly', '--rx', '--ry'];
    const reset = (el: HTMLElement) => VARS.forEach((v) => el.style.removeProperty(v));
    const dim = (el: HTMLElement) => {
      el.style.setProperty('--sx', '-999px');
      el.style.setProperty('--sy', '-999px');
    };
    const root = document.documentElement;
    const dimPage = () => {
      root.style.setProperty('--px', '-999px');
      root.style.setProperty('--py', '-999px');
    };
    const onMove = (e: PointerEvent) => {
      // the page-wide glow (.spotlight.is-page, fixed) reads viewport coords
      // off :root — the design mock puts data-spot on the whole screen
      root.style.setProperty('--px', e.clientX + 'px');
      root.style.setProperty('--py', e.clientY + 'px');
      const t = e.target as HTMLElement | null;
      const el = t?.closest?.('[data-lens]') as HTMLElement | null;
      if (el !== lensEl) {
        if (lensEl) reset(lensEl);
        lensEl = el;
      }
      if (el) {
        const r = el.getBoundingClientRect();
        const dx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
        const dy = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
        const k = el.dataset.lens === 'c' ? 4 : 2;
        el.style.setProperty('--lx', (dx * k).toFixed(1) + 'px');
        el.style.setProperty('--ly', (dy * k).toFixed(1) + 'px');
        el.style.setProperty('--ry', (dx * k * 0.75).toFixed(1) + 'deg');
        el.style.setProperty('--rx', (-dy * k * 0.75).toFixed(1) + 'deg');
      }
      const card = t?.closest?.('[data-spot]') as HTMLElement | null;
      if (card !== spotEl) {
        if (spotEl) dim(spotEl);
        spotEl = card;
      }
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--sx', e.clientX - r.left + 'px');
        card.style.setProperty('--sy', e.clientY - r.top + 'px');
      }
    };
    const onLeave = () => {
      dimPage();
      if (lensEl) {
        reset(lensEl);
        lensEl = null;
      }
      if (spotEl) {
        dim(spotEl);
        spotEl = null;
      }
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      dimPage();
    };
  }, []);
}

/** Mount once in the root layout; renders nothing. */
export function LensProvider() {
  useLens();
  return null;
}
