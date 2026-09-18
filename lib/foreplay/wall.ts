import type { ForeplayAd } from '@/lib/foreplay/client';
import { adStore } from '@/lib/foreplay/store';
import { readWatchEntries } from '@/lib/foreplay/watchlist';
import { bestHook } from '@/lib/foreplay/mine';
import { daysRunning } from '@/lib/foreplay/signals';

/**
 * WallAd: the flat, serializable shape the AdPilot UI renders: everything a
 * card, the winners wall, and the dossier drawer need, precomputed once on
 * the server so the client never touches raw API objects.
 */

export type WallAd = {
  id: string;
  brand: string;
  brandId: string | null;
  thumbnail: string | null;
  video: string | null;
  image: string | null;
  format: string | null;
  live: boolean;
  daysRunning: number;
  hook: string | null;
  hookSource: 'spoken' | 'text' | null;
  transcript: { t: number; s: string }[];
  drivers: Record<string, number>;
  ctaType: string | null;
  linkUrl: string | null;
};

export function toWallAd(ad: ForeplayAd, brandName?: string): WallAd {
  const { hook, source } = bestHook(ad);
  return {
    id: ad.id,
    brand: brandName ?? ad.name ?? 'unknown',
    brandId: ad.brand_id ?? null,
    thumbnail: ad.thumbnail ?? null,
    video: ad.video ?? null,
    image: ad.image ?? null,
    format: ad.display_format ?? null,
    live: ad.live === true,
    daysRunning: daysRunning(ad),
    hook,
    hookSource: source,
    transcript: (ad.timestamped_transcription ?? [])
      .filter((l) => l.sentence.trim().length > 0)
      .map((l) => ({ t: l.startTime, s: l.sentence.trim() })),
    drivers: ad.emotional_drivers ?? {},
    ctaType: ad.cta_type ?? null,
    linkUrl: ad.link_url ?? null,
  };
}

/** Everything in the store as wall ads, longevity-ranked, live first. */
export function storeWall(limit = 60): WallAd[] {
  const out: WallAd[] = [];
  for (const brand of readWatchEntries()) {
    for (const ad of adStore.readBrandAds(brand.id)) out.push(toWallAd(ad, brand.name));
  }
  return out
    .sort((a, b) => Number(b.live) - Number(a.live) || b.daysRunning - a.daysRunning)
    .slice(0, limit);
}
