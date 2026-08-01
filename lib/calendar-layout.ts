/**
 * Pure geometry for the week calendar — kept out of the React component so the
 * fiddly bits (overlap lanes, the visible hour window) are unit-testable and
 * timezone-independent. Inputs are minutes-from-local-midnight; the component
 * computes those from each event's local Date and renders the result.
 */

export type Interval = { startMin: number; endMin: number };
export type Lane = { lane: number; lanes: number };

/**
 * Assign side-by-side lanes to overlapping events (Google-Calendar style).
 * Events that don't overlap a cluster render full width; within a cluster of
 * mutually-overlapping events each gets its own lane and `lanes` is the cluster
 * width. Result is aligned to the input order.
 */
export function assignLanes(items: Interval[]): Lane[] {
  const order = items.map((it, i) => ({ ...it, i })).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const result: Lane[] = new Array(items.length);
  let cluster: { i: number; startMin: number; endMin: number; lane: number }[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const lanes = Math.max(...cluster.map((c) => c.lane)) + 1;
    for (const c of cluster) result[c.i] = { lane: c.lane, lanes };
    cluster = [];
  };

  for (const ev of order) {
    if (ev.startMin >= clusterEnd) {
      flush();
      clusterEnd = ev.endMin;
    } else {
      clusterEnd = Math.max(clusterEnd, ev.endMin);
    }
    // first lane whose previous event has ended
    const laneEnds: number[] = [];
    for (const c of cluster) laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? -Infinity, c.endMin);
    let lane = 0;
    while (laneEnds[lane] !== undefined && laneEnds[lane] > ev.startMin) lane++;
    cluster.push({ i: ev.i, startMin: ev.startMin, endMin: ev.endMin, lane });
  }
  flush();
  return result;
}

/** Visible hour window [loHour, hiHour) covering all events, min span enforced. */
export function hourBounds(
  items: Interval[],
  { minSpanHours = 8, defaultLo = 8, defaultHi = 18 }: { minSpanHours?: number; defaultLo?: number; defaultHi?: number } = {},
): { loHour: number; hiHour: number } {
  if (items.length === 0) return { loHour: defaultLo, hiHour: defaultHi };
  let loHour = Math.max(0, Math.floor(Math.min(...items.map((i) => i.startMin)) / 60));
  let hiHour = Math.min(24, Math.ceil(Math.max(...items.map((i) => i.endMin)) / 60));
  if (hiHour - loHour < minSpanHours) {
    hiHour = Math.min(24, loHour + minSpanHours);
    loHour = Math.max(0, hiHour - minSpanHours);
  }
  return { loHour, hiHour };
}
