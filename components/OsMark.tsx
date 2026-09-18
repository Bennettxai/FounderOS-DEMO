/**
 * Reusable application mark.
 * Inline vector so it scales cleanly across the interface.
 */

export function OsMark({ size = 34, color = '#ef4444', className }: { size?: number; color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} role="img" aria-label="Startup">
      <g fill="none" stroke={color} strokeWidth={6.64}>
        <circle cx={50} cy={50} r={30.8} />
        <path d="M 50 22.53 A 13.74 13.74 0 0 0 50 50 A 13.74 13.74 0 0 1 50 77.47" />
      </g>
    </svg>
  );
}
