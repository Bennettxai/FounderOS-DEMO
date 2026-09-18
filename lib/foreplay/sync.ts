import type { ForeplayClient } from '@/lib/foreplay/client';
import { adStore } from '@/lib/foreplay/store';
import { readWatchEntries } from '@/lib/foreplay/watchlist';
import { digest, diffBrandAds, velocitySignal, type Signal } from '@/lib/foreplay/signals';

/**
 * One Adscout sync cycle over the LOCAL watchlist (not Spyder: see
 * watchlist.ts): per brand, recent ads + analytics through the public brand
 * endpoints, then the signal diff. Cost: ~2 calls per brand + 1 usage call
 * against the 10k/mo credit budget.
 */

export type SyncResult = {
  brands: number;
  adsSeen: number;
  signals: Signal[];
  digest: string;
  apiCalls: number;
  remainingCredits: number | null;
};

/** The API caps brand-ads pages at 75; newest+oldest union covers ≤150 live ads. */
const PAGE = 75;

export async function runSyncCycle(client: ForeplayClient, now = new Date()): Promise<SyncResult> {
  const at = now.toISOString();
  const startCalls = client.callCount;

  const brands = readWatchEntries();

  const allSignals: Signal[] = [];
  let adsSeen = 0;

  for (const brand of brands) {
    const prev = adStore.readBrandAds(brand.id);
    // Live ads only, from both ends of the catalog: `newest` catches fresh
    // launches, `oldest` catches the long-running winners (the whole thesis)
    // that a recency window would silently drop.
    const newest = await client.adsByBrandId(brand.id, { live: true, limit: PAGE });
    const oldest = await client.adsByBrandId(brand.id, { live: true, limit: PAGE, order: 'oldest' });
    const liveNow = new Map(newest.map((a) => [a.id, a]));
    for (const ad of oldest) liveNow.set(ad.id, ad);
    const next = [...liveNow.values()];
    adsSeen += next.length;

    // An ad we saw live before that is absent from an untruncated live pull
    // has been turned off: surface that honestly so the killed signal fires.
    const fullCoverage = newest.length < PAGE || oldest.length < PAGE || next.length < 2 * PAGE - 10;
    if (fullCoverage) {
      for (const old of prev) {
        if (old.live && !liveNow.has(old.id)) next.push({ ...old, live: false });
      }
    }

    // Dead ads survive in the store so longevity history isn't lost -
    // merge, with fresh rows winning.
    const merged = new Map(prev.map((a) => [a.id, a]));
    for (const ad of next) merged.set(ad.id, ad);
    adStore.writeBrandAds(brand.id, [...merged.values()]);

    allSignals.push(...diffBrandAds({ brandId: brand.id, brandName: brand.name, prev, next, at }));

    const series = await client.brandAnalytics(brand.id).catch(() => []);
    if (series.length > 0) {
      adStore.writeAnalytics(brand.id, series);
      const velocity = velocitySignal({ brandId: brand.id, brandName: brand.name, series: adStore.readAnalytics(brand.id), at });
      if (velocity) allSignals.push(velocity);
    }
  }

  adStore.appendSignals(allSignals);

  let remainingCredits: number | null = null;
  try {
    const usage = await client.usage();
    adStore.writeUsage(usage);
    remainingCredits = usage.remaining_credits;
  } catch {
    // usage is bookkeeping: a failed read never fails the cycle
  }

  const apiCalls = client.callCount - startCalls;
  adStore.writeMeta({ lastSyncAt: at, lastSyncCalls: apiCalls });

  return { brands: brands.length, adsSeen, signals: allSignals, digest: digest(allSignals), apiCalls, remainingCredits };
}
