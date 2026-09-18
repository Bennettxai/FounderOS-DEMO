import type { Phase, RoadmapItem } from '@/lib/schemas';

export type QuarterGroup = { quarter: string; items: RoadmapItem[] };

export function groupRoadmapByQuarter(items: RoadmapItem[]): QuarterGroup[] {
  const byQuarter = new Map<string, RoadmapItem[]>();
  for (const item of items) {
    const bucket = byQuarter.get(item.quarter) ?? [];
    bucket.push(item);
    byQuarter.set(item.quarter, bucket);
  }
  // '2026-Q1' sorts chronologically as a plain string.
  return [...byQuarter.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarter, quarterItems]) => ({ quarter, items: quarterItems }));
}

/**
 * What is actually in flight right now, for the home console's focus panel.
 *
 * The panel used to take `groupRoadmapByQuarter(items)[0]`, the earliest
 * quarter on record, so it read "Now · 2026-Q2" for a whole year and listed
 * work that had long since shipped. Focus follows status: the `now` items, or
 * the `next` ones when nothing is in flight, labelled with the earliest
 * quarter they belong to.
 */
export function currentFocus(items: RoadmapItem[]): QuarterGroup | null {
  const live = items.filter((i) => i.status === 'now');
  const picked = live.length > 0 ? live : items.filter((i) => i.status === 'next');
  if (picked.length === 0) return null;
  const quarter = picked.map((i) => i.quarter).sort((a, b) => a.localeCompare(b))[0];
  return { quarter, items: picked };
}

export type PhaseProgress = {
  phase: Phase;
  items: RoadmapItem[];
  done: number;
  total: number;
  pct: number;
};

/**
 * A phase percentage is not decoration. Each roadmap row names the phase it
 * advances, so a phase card reads done/total of the rows it actually owns, and
 * marking one done on the board moves the bar. A phase nobody has filed work
 * under reads 0, never NaN.
 */
export function phaseProgress(phases: Phase[], items: RoadmapItem[]): PhaseProgress[] {
  return phases.map((phase) => {
    const owned = items.filter((i) => i.phaseId === phase.id);
    const done = owned.filter((i) => i.status === 'done').length;
    const total = owned.length;
    return { phase, items: owned, done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  });
}
