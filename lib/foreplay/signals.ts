import type { AnalyticsDay, ForeplayAd } from '@/lib/foreplay/client';

/**
 * Adscout's signal engine: pure functions over store snapshots, no network.
 * These are the derived facts that make the raw feeds worth watching:
 *
 *  - new_launch        an ad started running since the last sync
 *  - winner            a LIVE ad crossed a longevity threshold (21/30/60d) -
 *                      longevity is the one honest public proxy for spend
 *  - killed            an ad that was live last sync has been turned off
 *  - velocity_spike /  day-over-day active-ads count moved ≥30% against the
 *    velocity_drop     trailing 7-day mean (launch burst / kill-off)
 */

export type SignalType = 'new_launch' | 'winner' | 'killed' | 'velocity_spike' | 'velocity_drop';

export type Signal = {
  type: SignalType;
  brandId: string;
  brandName: string;
  adId?: string;
  message: string;
  at: string; // ISO timestamp of the sync that produced it
};

export const WINNER_THRESHOLD_DAYS = [21, 30, 60] as const;

const DAY_SECONDS = 86_400;

export function daysRunning(ad: ForeplayAd): number {
  return Math.floor((ad.running_duration?.seconds ?? 0) / DAY_SECONDS);
}

/** Transcript filler that isn't a hook: silence-only captures and stubs. */
const JUNK_HOOKS = /^(thanks for watching|you|\.+|music)\W*$/i;

/** First transcript sentence of an ad: the hook line, when there is one. */
export function hookLine(ad: ForeplayAd): string | null {
  const first = ad.timestamped_transcription?.[0]?.sentence?.trim();
  const line = first || ad.full_transcription?.split(/[.!?]/)[0]?.trim() || '';
  if (!line || line.length < 8 || JUNK_HOOKS.test(line)) return null;
  return line;
}

export function diffBrandAds(args: {
  brandId: string;
  brandName: string;
  prev: ForeplayAd[];
  next: ForeplayAd[];
  at: string;
}): Signal[] {
  const { brandId, brandName, prev, next, at } = args;
  const prevById = new Map(prev.map((a) => [a.id, a]));
  const signals: Signal[] = [];

  for (const ad of next) {
    const before = prevById.get(ad.id);
    const days = daysRunning(ad);
    const hook = hookLine(ad);
    // Empty-string headlines are common: ?? alone lets them through.
    const headline = ad.headline?.trim();
    const label = hook ? `"${hook.slice(0, 80)}"` : headline || ad.display_format?.trim() || 'ad';

    if (!before) {
      // First sight. Only call it a launch when it's actually young: a brand
      // added to the watchlist arrives with its whole back catalog.
      if (ad.live && days <= 7) {
        signals.push({ type: 'new_launch', brandId, brandName, adId: ad.id, at, message: `${brandName} launched ${label}` });
      }
      continue;
    }

    const daysBefore = daysRunning(before);
    for (const threshold of WINNER_THRESHOLD_DAYS) {
      if (ad.live && daysBefore < threshold && days >= threshold) {
        signals.push({
          type: 'winner',
          brandId,
          brandName,
          adId: ad.id,
          at,
          message: `${brandName}: ${label} crossed ${threshold} days and is still live`,
        });
      }
    }
    if (before.live && ad.live === false) {
      signals.push({ type: 'killed', brandId, brandName, adId: ad.id, at, message: `${brandName} killed ${label} after ${days} days` });
    }
  }
  return signals;
}

/** ≥30% move in active ads vs the trailing 7-day mean (needs ≥4 days history). */
export function velocitySignal(args: {
  brandId: string;
  brandName: string;
  series: AnalyticsDay[];
  at: string;
}): Signal | null {
  const { brandId, brandName, series, at } = args;
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 4) return null;
  const latest = sorted[sorted.length - 1];
  const window = sorted.slice(-8, -1);
  const mean = window.reduce((sum, d) => sum + d.active_count, 0) / window.length;
  if (mean < 3) return null; // too small a base to call anything a spike
  const delta = (latest.active_count - mean) / mean;
  if (Math.abs(delta) < 0.3) return null;
  const pct = Math.round(delta * 100);
  return {
    type: delta > 0 ? 'velocity_spike' : 'velocity_drop',
    brandId,
    brandName,
    at,
    message: `${brandName} active ads ${pct > 0 ? '+' : ''}${pct}% vs 7-day mean (${latest.active_count} live on ${latest.date})`,
  };
}

/** Live ads ranked by longevity: the winners wall, and the hook bank's source. */
export function winners(ads: ForeplayAd[], minDays = 21): ForeplayAd[] {
  return ads
    .filter((a) => a.live && daysRunning(a) >= minDays)
    .sort((a, b) => daysRunning(b) - daysRunning(a));
}

/** Mean emotional-driver profile across a set of ads (API scores 15 axes per ad). */
export function driverFingerprint(ads: ForeplayAd[]): Record<string, number> {
  const sums = new Map<string, { total: number; n: number }>();
  for (const ad of ads) {
    for (const [axis, score] of Object.entries(ad.emotional_drivers ?? {})) {
      const cur = sums.get(axis) ?? { total: 0, n: 0 };
      cur.total += score;
      cur.n += 1;
      sums.set(axis, cur);
    }
  }
  return Object.fromEntries(
    [...sums.entries()].map(([axis, { total, n }]) => [axis, Math.round((total / n) * 10) / 10]),
  );
}

/** One digest line per signal: feeds agent-run summaries and the daily briefing. */
export function digest(signals: Signal[]): string {
  if (signals.length === 0) return 'No changes across the watchlist.';
  return signals.map((s) => s.message).join(' · ');
}
