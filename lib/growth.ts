/**
 * Generic growth math over a dated value series — shared by social followers
 * and the email list. Series must be sorted oldest → newest. Returns honest
 * nulls (never a fake zero) when history is too short to compute.
 */

export type GrowthPoint = { capturedAt: string; value: number };

const DAY_MS = 86_400_000;

function dateMs(yyyyMmDd: string): number {
  return Date.parse(`${yyyyMmDd}T00:00:00Z`);
}

/**
 * Current value and the baseline at/before the trailing window start, or null
 * when no snapshot reaches back that far (or the baseline is zero).
 */
export function windowDelta(points: GrowthPoint[], days: number): { current: number; baseline: number } | null {
  if (points.length < 2) return null;
  const latest = points[points.length - 1];
  const windowStart = dateMs(latest.capturedAt) - days * DAY_MS;
  const baseline = [...points].reverse().find((p) => dateMs(p.capturedAt) <= windowStart);
  if (!baseline || baseline.value === 0) return null;
  return { current: latest.value, baseline: baseline.value };
}

/** Percentage growth over the trailing window, or null without enough history. */
export function growthOver(points: GrowthPoint[], days: number): number | null {
  const delta = windowDelta(points, days);
  if (!delta) return null;
  return ((delta.current - delta.baseline) / delta.baseline) * 100;
}

/** Percentage growth from the first to the last point. */
export function growthAllTime(points: GrowthPoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.value === 0) return null;
  return ((last.value - first.value) / first.value) * 100;
}

/**
 * Combine several dated series (each sorted oldest → newest) into one summed
 * series over the union of their dates. Each channel's most recent value at or
 * before a given date is carried forward, so channels sampled on different days
 * still aggregate cleanly. A channel contributes nothing before its first point.
 */
export function mergeSeriesSum(seriesList: GrowthPoint[][]): GrowthPoint[] {
  const dates = [...new Set(seriesList.flatMap((s) => s.map((p) => p.capturedAt)))].sort();
  const out: GrowthPoint[] = [];
  for (const date of dates) {
    let sum = 0;
    let any = false;
    for (const series of seriesList) {
      let carried: number | null = null;
      for (const p of series) {
        if (p.capturedAt <= date) carried = p.value;
        else break;
      }
      if (carried !== null) {
        sum += carried;
        any = true;
      }
    }
    if (any) out.push({ capturedAt: date, value: sum });
  }
  return out;
}
