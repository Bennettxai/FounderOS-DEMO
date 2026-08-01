import { followerBarModel, type FollowerPoint } from '@/lib/social-chart';
import { formatFollowers } from '@/components/SocialStats';

/**
 * Follower history as a bar diagram — one bar per snapshot, y-axis on round
 * follower values, sparse date labels, hover a bar for the exact count and
 * change. Server-rendered SVG; growth tips green, dips red, the newest bar
 * runs full accent so "now" is unmistakable.
 */
export function FollowerBarChart({ series }: { series: FollowerPoint[] }) {
  const model = followerBarModel(series);
  if (model.bars.length === 0) {
    return <p className="mt-4 text-xs text-os-dim">No snapshots yet — counts appear once a sync or scrape records this account.</p>;
  }

  const W = 920;
  const H = 240;
  const AXIS_L = 58; // y labels gutter
  const AXIS_B = 22; // x labels strip
  const plotW = W - AXIS_L - 8;
  const plotH = H - AXIS_B - 10;
  const n = model.bars.length;
  const slot = plotW / n;
  const barW = Math.max(3, Math.min(26, slot * 0.62));
  const span = Math.max(1, model.ceil - model.floor);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-2 block w-full"
      role="img"
      aria-label="Follower count over time as a bar chart"
    >
      {/* y gridlines + labels on round follower values */}
      {model.yTicks.map((v) => {
        const y = 10 + plotH - ((v - model.floor) / span) * plotH;
        if (y < 6 || y > 10 + plotH + 1) return null;
        return (
          <g key={`yt-${v}`}>
            <line x1={AXIS_L} x2={W - 8} y1={y} y2={y} stroke="var(--border)" strokeDasharray="2 5" />
            <text x={AXIS_L - 8} y={y + 3} textAnchor="end" fill="var(--text-3)" fontSize={9} fontFamily="var(--font-mono)">
              {formatFollowers(v)}
            </text>
          </g>
        );
      })}

      {/* the bars */}
      {model.bars.map((b, i) => {
        const x = AXIS_L + i * slot + (slot - barW) / 2;
        const h = b.h * plotH;
        const y = 10 + plotH - h;
        const newest = i === n - 1;
        const tipColor = b.delta == null ? 'var(--accent)' : b.delta >= 0 ? 'var(--ok)' : 'var(--err)';
        return (
          <g key={b.date}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              fill="var(--accent)"
              opacity={newest ? 0.95 : 0.28 + b.h * 0.3}
            >
              <title>
                {`${b.date} · ${formatFollowers(b.followers)} followers${
                  b.delta == null ? '' : ` · ${b.delta >= 0 ? '+' : ''}${b.delta.toLocaleString('en-US')}`
                }`}
              </title>
            </rect>
            {/* delta tip: green gain, red dip */}
            <rect x={x} y={y - 2} width={barW} height={2} fill={tipColor} opacity={newest ? 1 : 0.8} />
            {b.xLabel && (
              <text
                x={x + barW / 2}
                y={H - 6}
                textAnchor="middle"
                fill="var(--text-3)"
                fontSize={8.5}
                fontFamily="var(--font-mono)"
              >
                {b.xLabel}
              </text>
            )}
          </g>
        );
      })}

      {/* baseline */}
      <line x1={AXIS_L} x2={W - 8} y1={10 + plotH} y2={10 + plotH} stroke="var(--border-strong)" />
    </svg>
  );
}
