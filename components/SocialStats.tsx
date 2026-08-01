import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

export function formatFollowers(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('en-US');
}

export function formatPct(n: number | null): string {
  if (n === null) return '—';
  const rounded = Math.abs(n) < 10 ? n.toFixed(2) : n.toFixed(1);
  return `${n >= 0 ? '+' : ''}${rounded}%`;
}

/** Growth chip — em-dash when history is too short to compute, never a fake 0. */
export function GrowthBadge({ label, value }: { label: string; value: number | null }) {
  const Icon = value === null ? Minus : value >= 0 ? TrendingUp : TrendingDown;
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-os-border px-2 py-1">
      <Icon className={`h-3 w-3 ${value === null ? 'text-os-dim' : 'text-os-text'}`} />
      <span className={`text-xs font-semibold ${value === null ? 'text-os-dim' : 'text-os-text'}`}>
        {formatPct(value)}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-os-dim">{label}</span>
    </div>
  );
}

/** Tiny grayscale bar series of follower history. */
export function Sparkline({ series }: { series: { date: string; followers: number }[] }) {
  if (series.length === 0) {
    return <div className="text-[10px] text-os-dim">no history yet — syncs daily</div>;
  }
  const min = Math.min(...series.map((s) => s.followers));
  const max = Math.max(...series.map((s) => s.followers));
  return (
    <div className="flex h-8 items-end gap-px" title={`${series.length} snapshots`}>
      {series.map((s) => {
        const pct = max === min ? 100 : 30 + ((s.followers - min) / (max - min)) * 70;
        return (
          <div
            key={s.date}
            className="w-1.5 rounded-sm bg-os-text/70"
            style={{ height: `${pct}%` }}
          />
        );
      })}
    </div>
  );
}

/** Small accent bar chart (rising-opacity), as in the by-platform cards. */
export function MiniBars({ bars }: { bars: number[] }) {
  const max = Math.max(...bars, 1);
  return (
    <div className="flex h-[30px] items-end gap-[3px]">
      {bars.map((b, i) => (
        <div
          key={i}
          className="w-1.5 rounded-[1px] bg-os-accent"
          style={{ height: `${Math.max(8, (b / max) * 100)}%`, opacity: 0.35 + (i / bars.length) * 0.65 }}
        />
      ))}
    </div>
  );
}
