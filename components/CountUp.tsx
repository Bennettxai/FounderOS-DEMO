'use client';

import { useEffect, useRef, useState } from 'react';

/** 900ms ease-out count-in for the pulse tiles and the slab numerals. The
 *  final frame lands on the exact target (cents included); reduced motion
 *  lands instantly. */
export function useCountUp(target: number, ms = 900): number {
  const [value, setValue] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(t >= 1 ? target : Math.round(target * eased));
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return value;
}

/** How a counted number reads once it lands. Formatters live here, not in
 *  props, because a server page cannot hand a function to a client island. */
export type CountKind = 'int' | 'usd' | 'usdCents' | 'followers';

const FORMAT: Record<CountKind, (n: number) => string> = {
  int: (n) => String(Math.round(n)),
  usd: (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
  usdCents: (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }),
  followers: (n) => Math.round(n).toLocaleString('en-US'),
};

export function CountUp({ value, kind = 'int' }: { value: number; kind?: CountKind }) {
  return <>{FORMAT[kind](useCountUp(value))}</>;
}
