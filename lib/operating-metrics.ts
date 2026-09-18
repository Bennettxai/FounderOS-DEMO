/**
 * Operating-metric tiles for the Analytics top strip. Pure partition: a tile is
 * "live" only when a connector handed back a real positive value; everything
 * else (null, zero, awaiting creds) falls to "pending" with an honest dash.
 * No seeded numbers — the page feeds these from real connector reads.
 */

export type MetricInput = {
  id: string;
  label: string;
  unit: string;
  source: string; // small bottom-right caption — 'Zernio', 'Attio', 'pending creds', …
  value: number | null; // null/<=0 ⇒ pending
  delta?: number; // movement; omit/0 ⇒ flat (no arrow)
  deltaPct?: boolean; // render the delta as a percentage?
};

export type MetricTile = {
  id: string;
  label: string;
  unit: string;
  source: string;
  value: number;
  delta: number;
  deltaPct: boolean;
  live: boolean;
};

function normalise(m: MetricInput, live: boolean): MetricTile {
  return {
    id: m.id,
    label: m.label,
    unit: m.unit,
    source: m.source,
    value: m.value ?? 0,
    delta: m.delta ?? 0,
    deltaPct: m.deltaPct ?? false,
    live,
  };
}

export function splitMetrics(inputs: MetricInput[]): { live: MetricTile[]; pending: MetricTile[] } {
  const live: MetricTile[] = [];
  const pending: MetricTile[] = [];
  for (const m of inputs) {
    const isLive = m.value != null && m.value > 0;
    (isLive ? live : pending).push(normalise(m, isLive));
  }
  return { live, pending };
}

/** The snapshot writer's minimal surface (db.metricSnapshots satisfies it). */
export type MetricSnapshotWriter = { record(metricId: string, value: number, capturedAt: string): void };

/** Persist one sweep of live metric values; honest-pending nulls are skipped
 *  (a missing key must never write a fake zero into history). Returns how
 *  many metrics were recorded. */
export function recordOperatingSnapshots(
  writer: MetricSnapshotWriter,
  inputs: MetricInput[],
  capturedAt: string,
): number {
  let n = 0;
  for (const m of inputs) {
    if (m.value == null) continue;
    writer.record(m.id, m.value, capturedAt);
    n += 1;
  }
  return n;
}

/** Sparkline series: real per-day history once at least two points exist;
 *  until then, the deterministic placeholder shape (stable per id + value,
 *  never random) so tiles read consistently while history accrues. */
export function sparkSeries(history: number[], id: string, value: number): number[] {
  if (history.length >= 2) return history;
  const seed = [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return Array.from({ length: 7 }, (_, i) => {
    const wobble = ((seed * (i + 3)) % 17) / 17 - 0.5;
    return Math.max(0, value * (0.82 + 0.18 * (i / 6) + wobble * 0.08));
  });
}
