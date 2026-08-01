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
