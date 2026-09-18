'use client';

import { useState } from 'react';
import { Label } from '@/components/terminal';
import { Chip } from '@/components/Pressable';

type DayPoint = { date: string; count: number };
type Range = 7 | 14 | 30;
const RANGES: Range[] = [7, 14, 30];

const fmtShort = (iso: string) =>
  new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .toLowerCase();

/** Agent-run volume from the real run log: range chips slice the trailing
    30 days the page hands over, per-day bars answer hover with the day's
    number, and zero days keep an honest 2px stub instead of vanishing. */
export function RunVolumeCard({ data }: { data: DayPoint[] }) {
  const [range, setRange] = useState<Range>(14);
  const [hovered, setHovered] = useState<string | null>(null);
  const shown = data.slice(-range);
  const windowRuns = shown.reduce((s, p) => s + p.count, 0);
  const max = Math.max(1, ...shown.map((p) => p.count));
  const hot = hovered ? shown.find((p) => p.date === hovered) : null;

  return (
    <div className="rounded-lg-t border border-os-border bg-os-surface p-5 xl:col-span-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Agent run volume · {range}d</Label>
        <div className="flex items-center gap-1.5">
          <span className="mr-1 font-mono text-[11px] text-os-muted">{windowRuns} runs</span>
          {RANGES.map((r) => (
            <Chip key={r} on={range === r} onClick={() => setRange(r)}>
              {r}d
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-end gap-[3px]" style={{ height: 170 }}>
        {shown.map((p) => {
          const on = hovered === p.date;
          const h = Math.max(2, (p.count / max) * 154);
          return (
            <div
              key={p.date}
              className="flex h-full flex-1 items-end"
              onMouseEnter={() => setHovered(p.date)}
              onMouseLeave={() => setHovered(null)}
            >
              <div
                className="w-full rounded-sm-t bg-os-accent transition-[opacity] duration-150"
                style={{ height: `${h}px`, opacity: on ? 1 : hovered ? 0.35 : p.count === 0 ? 0.25 : 0.7 }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between font-mono text-[9.5px] uppercase tracking-[0.12em] text-os-dim">
        <span>{fmtShort(shown[0].date)}</span>
        <span className={hot ? 'text-os-text' : ''}>
          {hot ? `${hot.count} runs · ${fmtShort(hot.date)}` : 'hover a day'}
        </span>
        <span>today</span>
      </div>
    </div>
  );
}
