/**
 * Shared math for the two funnel canvases (flow + radial). Pure and
 * client-safe — everything here must stay deterministic across SSR and
 * client so first paint never mismatches (no Math.random, no Date).
 */

/** Deterministic per-node noise — stable across SSR + client. Quantized to
 * 4 decimals because Math.sin differs in the last ULPs between V8 builds
 * (Node vs browser), which hydration diffs as a prop mismatch. */
export const rnd = (i: number, salt: number): number => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return Math.round((x - Math.floor(x)) * 10000) / 10000;
};

export const easeInOut = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

export const usd = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * Frame-rate independent smoothing factor: the fraction of remaining distance
 * to close after `dtMs` with time constant `tauMs` (1 − e^(−dt/τ)). A fixed
 * per-frame lerp converges twice as fast at 120 Hz as at 60 Hz; this feels
 * identical everywhere. dt is clamped so a background-tab return glides
 * instead of teleporting.
 */
export const smoothK = (dtMs: number, tauMs = 110): number =>
  1 - Math.exp(-Math.min(Math.max(dtMs, 0), 64) / tauMs);

/**
 * A node wears its cluster's hue and fades continuously toward red as contact
 * ages (sqrt easing so early decay reads perceptibly); conversion is the one
 * permanent color: green.
 */
export const decayedColor = (baseVar: string, decay: number, converted: boolean): string =>
  converted
    ? 'var(--ok)'
    : decay > 0
      ? `color-mix(in oklab, var(--err) ${Math.round(Math.sqrt(decay) * 85)}%, ${baseVar})`
      : baseVar;

/** The node itself decays: it dims as it ages out. */
export const decayedOpacity = (decay: number): number => 0.95 - decay * 0.45;

/* ---------------- Orbit flow view (hubs left → right) ---------------- */

/**
 * Crowded hubs breathe wider: the orbit band around a stage hub scales with
 * how many leads live there, so a dozen seeded clients keep the tight
 * constellation while the ~100-lead first-touch cluster of the live pipeline
 * spreads into a readable field instead of a packed donut.
 */
export const orbitSpread = (clusterCount: number): number =>
  Math.min(2.4, Math.max(1, Math.sqrt(clusterCount / 12)));
