import type { RoadmapItem } from '@/lib/schemas';

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
