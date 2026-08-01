/**
 * The OS mark — the ring-and-S logo from Alex's Founder OS brand assets
 * (os-mark.png), recreated as a crisp inline vector so it scales and themes.
 * Ring proportions calibrated against the source PNG (r 30.8 / stroke 6.64
 * on a 100 box); the seam is the half-radius arc pair stood UPRIGHT as a
 * letter S — Alex's call (2026-07-13): the S runs vertical like the O,
 * never the lying-down wave. Brand red #ef4444 by default; pass `color` to
 * re-ink it. (And the OS logo only — never the "Founder" wordmark.)
 */
export function OsMark({ size = 34, color = '#ef4444', className }: { size?: number; color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} role="img" aria-label="Founder OS">
      <g fill="none" stroke={color} strokeWidth={6.64}>
        <circle cx={50} cy={50} r={30.8} />
        <path d="M 50 22.53 A 13.74 13.74 0 0 0 50 50 A 13.74 13.74 0 0 1 50 77.47" />
      </g>
    </svg>
  );
}
