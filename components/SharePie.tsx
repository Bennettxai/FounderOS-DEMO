import { pieSlices, type PieItem } from '@/lib/social-chart';

/** Slice hues ride the theme's funnel ramp — hues on colorways, greys on
 * Monolith where color is reserved for status. */
const SLICE_VARS = ['--funnel-s0', '--funnel-s1', '--funnel-s2', '--funnel-s3', '--funnel-s5', '--funnel-s6'];

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Donut arc path between two angles at radius r (ring thickness via stroke). */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  // full-circle slices need two arcs; cap just short to keep the path valid
  const sweep = Math.min(a1 - a0, 359.98);
  const x0 = cx + r * Math.cos(rad(a0));
  const y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a0 + sweep));
  const y1 = cy + r * Math.sin(rad(a0 + sweep));
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * Generic share donut: one slice per item, a headline figure at center, and
 * a legend with values + percentages. `format` renders both the center total
 * and legend values (followers, dollars, …). `framed` wraps it in its own
 * card; off when it lives inside another card.
 */
export function SharePie({
  items,
  total,
  centerLabel,
  format,
  framed = true,
  stacked = false,
  donutPx = 132,
  ariaLabel,
}: {
  items: PieItem[];
  total: number;
  centerLabel: string;
  format: (value: number) => string;
  framed?: boolean;
  /** Donut above legend (narrow columns) instead of side by side. */
  stacked?: boolean;
  /** Rendered donut diameter — bump it when the card has room to fill. */
  donutPx?: number;
  ariaLabel: string;
}) {
  const slices = pieSlices(items);
  if (slices.length === 0) {
    return <p className="py-4 text-center font-mono text-[10.5px] text-os-dim">Nothing to chart yet.</p>;
  }

  const S = 168;
  const C = S / 2;
  const R = 62;

  return (
    <div
      className={`flex ${stacked ? 'flex-col items-center gap-3' : 'items-center gap-4'} ${
        framed ? 'h-full rounded-lg-t border border-os-border bg-os-surface px-4 py-3' : ''
      }`}
    >
      <svg
        viewBox={`0 0 ${S} ${S}`}
        className="shrink-0"
        style={{ width: donutPx, height: donutPx }}
        role="img"
        aria-label={ariaLabel}
      >
        {slices.map((s, i) => (
          <path
            key={s.key}
            d={arcPath(C, C, R, s.startAngle + 0.6, s.endAngle - 0.6)}
            fill="none"
            stroke={`var(${SLICE_VARS[i % SLICE_VARS.length]})`}
            strokeWidth={17}
          >
            <title>{`${s.label} · ${format(s.value)} · ${(s.share * 100).toFixed(1)}%`}</title>
          </path>
        ))}
        <text x={C} y={C - 3} textAnchor="middle" fill="var(--text)" fontSize={15} fontWeight={700} fontFamily="var(--font-mono)" letterSpacing="-0.02em">
          {format(total)}
        </text>
        <text x={C} y={C + 13} textAnchor="middle" fill="var(--text-3)" fontSize={7.5} fontFamily="var(--font-mono)" style={{ textTransform: 'uppercase', letterSpacing: '0.18em' }}>
          {centerLabel}
        </text>
      </svg>

      <div className={`flex flex-col gap-1 ${stacked ? 'w-full' : 'min-w-0 flex-1'}`}>
        {slices.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2 font-mono text-[10px]">
            <span className="h-2 w-2 shrink-0" style={{ background: `var(${SLICE_VARS[i % SLICE_VARS.length]})` }} />
            <span className="min-w-0 flex-1 truncate uppercase tracking-[0.08em] text-os-dim">{s.label}</span>
            <span className="shrink-0 text-os-muted">{format(s.value)}</span>
            <span className="w-11 shrink-0 text-right text-os-text">{(s.share * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
