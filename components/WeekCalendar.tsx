import { Video } from 'lucide-react';
import type { CalEvent } from '@/lib/connectors/gcal';
import { assignLanes, hourBounds, type Interval } from '@/lib/calendar-layout';

const HOUR_PX = 46;
const GUTTER = 50;

type Account = { name: string; color: string };

function localMidnight(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function fmtHour(h: number): string {
  const ampm = h < 12 || h === 24 ? 'AM' : 'PM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${ampm}`;
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

type Placed = { ev: CalEvent; startMin: number; endMin: number };

/** 7-day week grid: days across the top, hours down the side, meetings placed
    at their times and colored per account. Events with a video link join on
    click. Times render in the machine's local timezone. */
export function WeekCalendar({ events, accounts, nowISO }: { events: CalEvent[]; accounts: Account[]; nowISO: string }) {
  const now = new Date(nowISO);
  const base = localMidnight(now);

  // 7 day columns starting today.
  const columns = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return { date: d, key: dayKey(d) };
  });
  const colIndex = new Map(columns.map((c, i) => [c.key, i]));

  // Bucket events into their day column; split timed vs all-day.
  const timedByDay: Placed[][] = columns.map(() => []);
  const allDayByDay: CalEvent[][] = columns.map(() => []);
  for (const ev of events) {
    const s = new Date(ev.start);
    const idx = colIndex.get(dayKey(s));
    if (idx === undefined) continue;
    if (ev.allDay) {
      allDayByDay[idx].push(ev);
      continue;
    }
    const e = ev.end ? new Date(ev.end) : new Date(s.getTime() + 30 * 60_000);
    const startMin = s.getHours() * 60 + s.getMinutes();
    const crossesDay = dayKey(e) !== dayKey(s);
    let endMin = crossesDay ? 24 * 60 : e.getHours() * 60 + e.getMinutes();
    if (endMin <= startMin) endMin = Math.min(24 * 60, startMin + 30);
    timedByDay[idx].push({ ev, startMin, endMin });
  }

  const allTimed: Interval[] = timedByDay.flat().map((p) => ({ startMin: p.startMin, endMin: p.endMin }));
  const { loHour, hiHour } = hourBounds(allTimed);
  const bodyHeight = (hiHour - loHour) * HOUR_PX;
  const hours = Array.from({ length: hiHour - loHour }, (_, i) => loHour + i);
  const gridCols = `${GUTTER}px repeat(7, minmax(96px, 1fr))`;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowTop = (nowMin / 60 - loHour) * HOUR_PX;
  const showNow = nowMin / 60 >= loHour && nowMin / 60 <= hiHour;

  const hasAllDay = allDayByDay.some((d) => d.length > 0);

  return (
    <div>
      {/* legend: every calendar → its color */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {accounts.map((a) => (
          <div key={a.name} className="flex items-center gap-1.5 font-mono text-[10.5px] text-os-muted">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: a.color }} />
            {a.name}
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg-t border border-os-border bg-os-surface">
        {/* day headers */}
        <div className="grid border-b border-os-border" style={{ gridTemplateColumns: gridCols }}>
          <div />
          {columns.map((c, i) => {
            const today = i === 0;
            return (
              <div key={c.key} className={`border-l border-os-border px-2 py-2 text-center ${today ? 'bg-[var(--accent-soft)]' : ''}`}>
                <div className={`font-mono text-[9.5px] uppercase tracking-[0.12em] ${today ? 'text-os-accent' : 'text-os-dim'}`}>
                  {c.date.toLocaleDateString([], { weekday: 'short' })}
                </div>
                <div className={`text-[15px] font-semibold ${today ? 'text-os-accent' : 'text-os-text'}`}>{c.date.getDate()}</div>
              </div>
            );
          })}
        </div>

        {/* all-day band (only when present) */}
        {hasAllDay && (
          <div className="grid border-b border-os-border" style={{ gridTemplateColumns: gridCols }}>
            <div className="flex items-center justify-end pr-2 font-mono text-[9px] uppercase tracking-[0.1em] text-os-dim">all-day</div>
            {allDayByDay.map((list, i) => (
              <div key={i} className="flex flex-col gap-1 border-l border-os-border p-1">
                {list.map((ev) => (
                  <AllDayChip key={ev.id} ev={ev} />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* timed grid */}
        <div className="grid" style={{ gridTemplateColumns: gridCols }}>
          {/* hour gutter */}
          <div className="relative" style={{ height: bodyHeight }}>
            {hours.map((h, i) => (
              <div key={h} className="absolute right-2 -translate-y-1/2 font-mono text-[9px] text-os-dim" style={{ top: i * HOUR_PX }}>
                {i === 0 ? '' : fmtHour(h)}
              </div>
            ))}
          </div>

          {/* day columns */}
          {timedByDay.map((dayEvents, i) => {
            const lanes = assignLanes(dayEvents.map((p) => ({ startMin: p.startMin, endMin: p.endMin })));
            return (
              <div key={columns[i].key} className="relative border-l border-os-border" style={{ height: bodyHeight }}>
                {/* hour gridlines */}
                {hours.map((h, hi) => (
                  <div key={h} className="absolute inset-x-0 border-t border-os-border/50" style={{ top: hi * HOUR_PX }} />
                ))}
                {/* now line in today's column */}
                {i === 0 && showNow && (
                  <div className="absolute inset-x-0 z-10 border-t-2 border-os-accent" style={{ top: nowTop }}>
                    <span className="absolute -left-1 -top-[3px] h-1.5 w-1.5 rounded-full bg-os-accent" />
                  </div>
                )}
                {/* events */}
                {dayEvents.map((p, j) => (
                  <EventBlock key={p.ev.id} placed={p} lane={lanes[j]} loHour={loHour} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AllDayChip({ ev }: { ev: CalEvent }) {
  const Tag = ev.joinUrl ? 'a' : 'div';
  return (
    <Tag
      {...(ev.joinUrl ? { href: ev.joinUrl, target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="block truncate rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold text-os-ink"
      style={{ background: ev.color }}
      title={`${ev.title} · ${ev.account}`}
    >
      {ev.title}
    </Tag>
  );
}

function EventBlock({ placed, lane, loHour }: { placed: Placed; lane: { lane: number; lanes: number }; loHour: number }) {
  const { ev, startMin, endMin } = placed;
  const top = (startMin / 60 - loHour) * HOUR_PX;
  const height = Math.max(22, ((endMin - startMin) / 60) * HOUR_PX - 3);
  const widthPct = 100 / lane.lanes;
  const Tag = ev.joinUrl ? 'a' : 'div';
  const compact = height < 38;
  return (
    <Tag
      {...(ev.joinUrl ? { href: ev.joinUrl, target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`group absolute overflow-hidden rounded-[4px] border-l-[3px] px-1.5 py-1 ${ev.joinUrl ? 'cursor-pointer' : ''}`}
      style={{
        top,
        height,
        left: `calc(${lane.lane * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        borderLeftColor: ev.color,
        background: `color-mix(in srgb, ${ev.color} 16%, var(--surface))`,
      }}
      title={`${ev.title} · ${ev.account}${ev.joinUrl ? ' · click to join' : ''}`}
    >
      <div className="flex items-center gap-1">
        <span className="truncate text-[11px] font-semibold leading-tight text-os-text">{ev.title}</span>
        {ev.joinUrl && <Video className="ml-auto h-3 w-3 shrink-0 text-os-accent" />}
      </div>
      {!compact && (
        <div className="mt-0.5 truncate font-mono text-[9px] text-os-dim">
          {fmtTime(ev.start)} · {ev.account}
        </div>
      )}
    </Tag>
  );
}
