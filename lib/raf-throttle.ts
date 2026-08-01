/**
 * Coalesce rapid calls so the wrapped fn runs at most once per animation frame
 * (falls back to a ~16ms timer off-browser, e.g. in tests/SSR). Used to cap
 * React re-renders to frame-rate while d3's force simulation ticks freely
 * underneath — the sim's physics are untouched; only the render is throttled.
 */
export function rafThrottle(fn: () => void): () => void {
  let scheduled = false;
  const schedule: (cb: () => void) => unknown =
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
  return () => {
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      fn();
    });
  };
}
