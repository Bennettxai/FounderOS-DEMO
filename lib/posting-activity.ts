// Pure helpers that turn real published-post history into the per-day,
// per-platform data the social charts plot. No DB, no network — easy to test.

export type PostDay = { date: string; platforms: string[] };

export type PostingActivityDay = {
  date: string;
  /** platform -> number of posts that day (cross-posts count for each platform) */
  counts: Record<string, number>;
  /** sum across platforms */
  total: number;
};

const DAY_MS = 86_400_000;

/** Every YYYY-MM-DD from start to end inclusive (UTC). [] if start > end. */
export function dateAxis(start: string, end: string): string[] {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(s) || !Number.isFinite(e) || s > e) return [];
  const out: string[] = [];
  for (let t = s; t <= e; t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Bucket real posts into a per-day, per-platform count over `axis`. A post
    cross-posted to N platforms counts once for each of them. Posts whose date
    isn't on the axis are dropped. */
export function bucketPostingByDay(posts: PostDay[], axis: string[]): PostingActivityDay[] {
  const onAxis = new Set(axis);
  const byDate = new Map<string, Record<string, number>>(axis.map((d) => [d, {}]));
  for (const post of posts) {
    if (!onAxis.has(post.date)) continue;
    const counts = byDate.get(post.date)!;
    for (const platform of post.platforms) {
      counts[platform] = (counts[platform] ?? 0) + 1;
    }
  }
  return axis.map((date) => {
    const counts = byDate.get(date)!;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { date, counts, total };
  });
}

/** A value per axis day, carrying the last known value forward across gaps;
    null for axis days before the first known point. */
export function forwardFill(points: { date: string; value: number }[], axis: string[]): (number | null)[] {
  const byDate = new Map(points.map((p) => [p.date, p.value]));
  let last: number | null = null;
  return axis.map((date) => {
    if (byDate.has(date)) last = byDate.get(date)!;
    return last;
  });
}

export type PlatformPostSeries = { key: string; points: { date: string; count: number }[]; total: number };

/** One per-platform posting series over the trailing `days` ending on `today`,
    bucketed from real post history. Returns a series for each requested platform
    key (zero-filled when it didn't post) so callers can decorate with
    label/color. Used by the home posting graph. */
export function postSeriesFromDays(
  posts: PostDay[],
  today: string,
  days: number,
  platforms: string[],
): PlatformPostSeries[] {
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const axis = dateAxis(start.toISOString().slice(0, 10), today);
  const buckets = bucketPostingByDay(posts, axis);
  return platforms.map((key) => {
    const points = buckets.map((d) => ({ date: d.date, count: d.counts[key] ?? 0 }));
    return { key, points, total: points.reduce((sum, p) => sum + p.count, 0) };
  });
}

/** Platforms that appear in the given posts, ordered by `preferred` first then
    any extras alphabetically — keeps stacked-bar colors stable. */
export function platformsPresent(posts: PostDay[], preferred: string[]): string[] {
  const seen = new Set(posts.flatMap((p) => p.platforms));
  const ordered = preferred.filter((p) => seen.has(p));
  const extras = [...seen].filter((p) => !preferred.includes(p)).sort();
  return [...ordered, ...extras];
}
