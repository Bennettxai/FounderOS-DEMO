/**
 * Bar-diagram geometry for follower history — pure math so the SVG component
 * just draws. Bars are normalized against a floor slightly below the series
 * minimum (follower counts move in small increments; a zero baseline would
 * render every bar identical), y ticks land on round values, and x labels
 * thin out so long histories stay legible.
 */

export type FollowerPoint = { date: string; followers: number };

export type FollowerBar = {
  date: string;
  followers: number;
  /** Height fraction (0, 1] of the plot area. */
  h: number;
  /** Follower change vs the previous snapshot; null for the first. */
  delta: number | null;
  /** Sparse axis label (MM-DD) or null when thinned out. */
  xLabel: string | null;
};

export type FollowerBarModel = {
  bars: FollowerBar[];
  /** Round-ish follower values spanning the data, bottom → top. */
  yTicks: number[];
  floor: number;
  ceil: number;
};

/** Round `n` to a clean step (1/2/5 × 10^k) for axis labels. */
function niceStep(range: number, ticks: number): number {
  const raw = range / Math.max(1, ticks);
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  for (const m of [1, 2, 5, 10]) if (raw <= m * mag) return m * mag;
  return 10 * mag;
}

export type PieItem = { key: string; label: string; value: number | null };

export type PieSlice = {
  key: string;
  label: string;
  value: number;
  /** Fraction of the whole (0–1]. */
  share: number;
  /** Degrees, 12 o'clock start (−90), clockwise. */
  startAngle: number;
  endAngle: number;
};

/** Audience-share slices — null/zero channels drop out, angles run clockwise
 * from 12 o'clock and always close the full circle. */
export function pieSlices(items: PieItem[]): PieSlice[] {
  const live = items.filter((i): i is PieItem & { value: number } => i.value != null && i.value > 0);
  const total = live.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return [];
  let angle = -90;
  return live.map((i) => {
    const share = i.value / total;
    const startAngle = angle;
    angle += share * 360;
    return { key: i.key, label: i.label, value: i.value, share, startAngle, endAngle: angle };
  });
}

export function followerBarModel(series: FollowerPoint[]): FollowerBarModel {
  if (series.length === 0) return { bars: [], yTicks: [], floor: 0, ceil: 0 };

  const values = series.map((p) => p.followers);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // floor sits a hair below the minimum so every bar is visible and growth
  // differences read; flat histories get a symmetric pad instead of zero range
  const pad = Math.max((max - min) * 0.15, max * 0.02, 1);
  const floor = Math.max(0, min - pad);
  const ceil = max;
  const span = Math.max(1, ceil - floor);

  const labelEvery = Math.max(1, Math.ceil(series.length / 8));
  const bars: FollowerBar[] = series.map((p, i) => ({
    date: p.date,
    followers: p.followers,
    h: Math.min(1, Math.max(0.02, (p.followers - floor) / span)),
    delta: i === 0 ? null : p.followers - series[i - 1].followers,
    xLabel: i % labelEvery === 0 || i === series.length - 1 ? p.date.slice(5) : null,
  }));

  const step = niceStep(span, 4);
  const yTicks: number[] = [];
  for (let v = Math.floor(floor / step) * step; v <= ceil + step; v += step) {
    if (v >= 0) yTicks.push(v);
    if (yTicks.length > 8) break;
  }

  return { bars, yTicks, floor, ceil };
}
