import type { WallAd } from '@/lib/foreplay/wall';

/**
 * The For-you feed's scoring: honest, local, and explainable: niche
 * keyword fit + proven longevity + similarity to what the operator actually saved.
 * No black box: the UI states the ranking basis in a footer line, and every
 * factor here is inspectable. Saves teach the feed (driver-profile
 * similarity uses the mean emotional fingerprint of saved ads).
 */

/** the operator's lanes: AI agents/automation, founder offers, creator education. */
export const NICHE_KEYWORDS = [
  'ai',
  'agent',
  'agents',
  'automation',
  'automate',
  'founder',
  'business',
  'agency',
  'marketing',
  'course',
  'community',
  'coaching',
  'clients',
  'leads',
  'software',
  'saas',
  'app',
  'system',
  'income',
  'revenue',
];

function keywordScore(ad: WallAd): number {
  const text = `${ad.hook ?? ''} ${ad.brand}`.toLowerCase();
  const words = new Set(text.split(/[^a-z0-9$]+/));
  let hits = 0;
  for (const kw of NICHE_KEYWORDS) if (words.has(kw)) hits += 1;
  return Math.min(hits / 4, 1); // 4+ niche words = saturated
}

function longevityScore(ad: WallAd): number {
  return Math.min(ad.daysRunning / 90, 1); // 90d+ = fully proven
}

/** Cosine similarity between an ad's emotional drivers and a mean profile. */
function driverSimilarity(ad: WallAd, mean: Record<string, number>): number {
  const axes = Object.keys(mean);
  if (axes.length === 0 || Object.keys(ad.drivers).length === 0) return 0;
  let dot = 0;
  let a2 = 0;
  let b2 = 0;
  for (const axis of axes) {
    const a = ad.drivers[axis] ?? 0;
    const b = mean[axis];
    dot += a * b;
    a2 += a * a;
    b2 += b * b;
  }
  return a2 > 0 && b2 > 0 ? dot / (Math.sqrt(a2) * Math.sqrt(b2)) : 0;
}

export function meanDrivers(ads: WallAd[]): Record<string, number> {
  const sums = new Map<string, { total: number; n: number }>();
  for (const ad of ads) {
    for (const [axis, score] of Object.entries(ad.drivers)) {
      const cur = sums.get(axis) ?? { total: 0, n: 0 };
      cur.total += score;
      cur.n += 1;
      sums.set(axis, cur);
    }
  }
  return Object.fromEntries([...sums.entries()].map(([axis, { total, n }]) => [axis, total / n]));
}

export type ScoredAd = { ad: WallAd; score: number };

/** Rank candidates for the For-you feed. Weights: niche 3 · longevity 3 ·
 *  saved-taste similarity 3 · live 1. */
export function forYou(candidates: WallAd[], savedAds: WallAd[]): ScoredAd[] {
  const taste = meanDrivers(savedAds);
  const savedIds = new Set(savedAds.map((a) => a.id));
  return candidates
    .filter((ad) => !savedIds.has(ad.id))
    .map((ad) => ({
      ad,
      score:
        keywordScore(ad) * 3 +
        longevityScore(ad) * 3 +
        driverSimilarity(ad, taste) * 3 +
        (ad.live ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score);
}
