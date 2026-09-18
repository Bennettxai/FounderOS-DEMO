'use client';

import { useState } from 'react';
import { AsyncButton } from '@/components/AsyncButton';
import { Chip } from '@/components/Pressable';
import { Badge, SectionHead, type BadgeTone } from '@/components/terminal';
import { groupRoadmapByQuarter, type PhaseProgress } from '@/lib/roadmap';
import type { RoadmapItem, RoadmapStatus } from '@/lib/schemas';

const STATUS_BADGE: Record<RoadmapStatus, { tone: BadgeTone; ghost: boolean; label: string }> = {
  done: { tone: 'ok', ghost: false, label: 'Done' },
  now: { tone: 'accent', ghost: false, label: 'Now' },
  next: { tone: 'warn', ghost: false, label: 'Next' },
  later: { tone: 'default', ghost: true, label: 'Later' },
};

const FILTERS = ['All', 'Done', 'Now', 'Next', 'Later'] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Mock 5h: the roadmap as one board you can actually work.
 *
 * A phase card is a lens row that selects, and its bar is done/total of the
 * roadmap rows that phase owns, so selecting a phase narrows the quarters to
 * the same rows the percentage was counted from. The status chips filter on
 * top of that. An item opens on click into its description and its two
 * controls, and "mark done" is a real PATCH: the route hands the whole board
 * back, so the bar it moved redraws from the write, not from a guess.
 */
export function RoadmapBoard({
  phases,
  items,
  departments,
}: {
  phases: PhaseProgress[];
  items: RoadmapItem[];
  departments: Record<string, string>;
}) {
  const [board, setBoard] = useState(items);
  const [phaseId, setPhaseId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('All');
  const [open, setOpen] = useState<string | null>(null);

  const owned = (id: string) => board.filter((i) => i.phaseId === id);
  const pctOf = (id: string) => {
    const rows = owned(id);
    if (rows.length === 0) return 0;
    return Math.round((rows.filter((i) => i.status === 'done').length / rows.length) * 100);
  };

  const visible = board.filter(
    (i) =>
      (phaseId === null || i.phaseId === phaseId) &&
      (filter === 'All' || i.status === (filter.toLowerCase() as RoadmapStatus)),
  );
  const quarters = groupRoadmapByQuarter(visible);

  const mark = async (item: RoadmapItem) => {
    const next: RoadmapStatus = item.status === 'done' ? 'now' : 'done';
    const res = await fetch('/api/roadmap', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: item.id, status: next }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setBoard((rows) => rows.map((r) => (r.id === item.id ? { ...r, status: next } : r)));
  };

  return (
    <div>
      <section className="mb-9">
        <SectionHead label="Phases" count={phases.length} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 ultra:grid-cols-6">
          {phases.map(({ phase, items: seeded }) => {
            const pct = pctOf(phase.id);
            const on = phaseId === phase.id;
            const rows = owned(phase.id);
            const doneN = rows.filter((i) => i.status === 'done').length;
            return (
              <div
                key={phase.id}
                data-lens="r"
                role="button"
                tabIndex={0}
                onClick={() => setPhaseId(on ? null : phase.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setPhaseId(on ? null : phase.id);
                }}
                className={`pressable is-row cursor-pointer rounded-panel border bg-os-surface px-[17px] py-[15px] ${
                  on ? 'border-[var(--accent-line)] bg-os-surface2' : 'border-os-border'
                }`}
              >
                <div className="mb-[7px] flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[10px] tracking-[0.18em] text-os-accent">
                    PHASE {String(phase.number).padStart(2, '0')}
                  </span>
                  <span className={`font-mono text-[9.5px] ${pct === 100 ? 'text-os-ok' : 'text-os-dim'}`}>
                    {pct}% · {doneN}/{rows.length}
                  </span>
                </div>
                <h2 className="text-sm font-bold">{phase.title}</h2>
                <ul className="mt-2.5 flex flex-col gap-1.5">
                  {(rows.length > 0 ? rows.map((r) => ({ key: r.id, text: r.title, done: r.status === 'done' })) : seeded.map((s) => ({ key: s.id, text: s.title, done: s.status === 'done' }))).map((it) => (
                    <li
                      key={it.key}
                      className={`flex items-baseline gap-2 text-[11.5px] ${
                        it.done ? 'text-os-dim line-through decoration-os-dim' : 'text-os-muted'
                      }`}
                    >
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-os-dim" />
                      {it.text}
                    </li>
                  ))}
                </ul>
                <div className="mt-2.5 h-[2px] overflow-hidden rounded-full bg-os-border">
                  <span
                    className="block h-full bg-os-text transition-[width] duration-[900ms] ease-[cubic-bezier(.22,.61,.36,1)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <SectionHead
        label="Quarter by quarter"
        right={
          <div className="flex shrink-0 gap-1">
            {FILTERS.map((f) => (
              <Chip key={f} data-lens="c" on={filter === f} onClick={() => setFilter(f)}>
                {f}
              </Chip>
            ))}
          </div>
        }
      />

      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4 ultra:grid-cols-6">
        {quarters.map(({ quarter, items: rows }) => {
          const doneN = rows.filter((r) => r.status === 'done').length;
          return (
            <section key={quarter}>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="font-mono text-xs font-semibold tracking-[0.12em]">
                  {quarter.replace('-', ' · ')}
                </span>
                <span className="font-mono text-[10px] text-os-dim">
                  {doneN}/{rows.length} done
                </span>
                <span className="h-px flex-1 bg-os-border" />
              </div>
              <div className="flex flex-col gap-2.5">
                {rows.map((item) => {
                  const badge = STATUS_BADGE[item.status];
                  const dept = item.departmentId ? departments[item.departmentId] : null;
                  const done = item.status === 'done';
                  const isOpen = open === item.id;
                  return (
                    <div
                      key={item.id}
                      data-lens="r"
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpen(isOpen ? null : item.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setOpen(isOpen ? null : item.id);
                      }}
                      className={`pressable is-row cursor-pointer rounded-panel border bg-os-surface px-[15px] py-3 ${
                        isOpen ? 'border-os-border-strong' : 'border-os-border'
                      } ${done ? 'opacity-[0.62]' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div
                          className={`text-[12.5px] font-semibold leading-snug ${done ? 'text-os-muted line-through decoration-os-dim' : ''}`}
                        >
                          {item.title}
                        </div>
                        <Badge tone={badge.tone} ghost={badge.ghost}>
                          {badge.label}
                        </Badge>
                      </div>
                      {isOpen && (
                        <>
                          <p className="mt-1.5 animate-enter text-[11px] leading-relaxed text-os-dim [text-wrap:pretty]">
                            {item.description}
                          </p>
                          <div
                            className="mt-2 flex animate-enter gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              data-lens="c"
                              className="pressable is-dark inline-flex h-[22px] items-center rounded-ctl border border-os-border bg-os-bg px-2 font-mono text-[10px] font-semibold text-os-muted"
                            >
                              open task
                            </button>
                            <AsyncButton
                              run={() => mark(item)}
                              tone="secondary"
                              busyLabel="saving"
                              doneLabel="saved"
                            >
                              {done ? 'mark now' : 'mark done'}
                            </AsyncButton>
                          </div>
                        </>
                      )}
                      {dept && (
                        <div className="mt-2.5 flex items-center gap-1.5 font-mono text-[9.5px] text-os-muted">
                          <span className="h-[5px] w-[5px] rounded-sm bg-os-accent" />
                          {dept}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
