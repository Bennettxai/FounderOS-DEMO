import fs from 'node:fs';
import path from 'node:path';
import type { AnalyticsDay, ForeplayAd, ForeplayUsage, SpyderBrand } from '@/lib/foreplay/client';
import type { Signal } from '@/lib/foreplay/signals';

/**
 * Adscout's local snapshot store: plain JSON under data/ad-intel/. Everything
 * downstream (signals, dossiers, the future /ads page) reads FROM here; the
 * Foreplay API is touched only by sync cycles and explicit user searches, so
 * the 10k/mo credit budget is spent once per fact, not once per render.
 * ADSCOUT_STORE_DIR overrides the location for tests.
 */

export function storeDir(): string {
  return process.env.ADSCOUT_STORE_DIR ?? path.join(process.cwd(), 'data', 'ad-intel');
}

function fileFor(name: string): string {
  return path.join(storeDir(), name);
}

function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(fileFor(name), 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(name: string, value: unknown): void {
  fs.mkdirSync(storeDir(), { recursive: true });
  fs.writeFileSync(fileFor(name), JSON.stringify(value, null, 2) + '\n');
}

/** Brand ids become filenames: keep them to a safe charset. */
function brandFile(prefix: string, brandId: string): string {
  return `${prefix}-${brandId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`;
}

export type StoreMeta = { lastSyncAt: string | null; lastSyncCalls: number };

export const adStore = {
  readWatchlist(): SpyderBrand[] {
    return readJson<SpyderBrand[]>('watchlist.json', []);
  },
  writeWatchlist(brands: SpyderBrand[]): void {
    writeJson('watchlist.json', brands);
  },

  readBrandAds(brandId: string): ForeplayAd[] {
    return readJson<ForeplayAd[]>(brandFile('ads', brandId), []);
  },
  writeBrandAds(brandId: string, ads: ForeplayAd[]): void {
    writeJson(brandFile('ads', brandId), ads);
  },

  readAnalytics(brandId: string): AnalyticsDay[] {
    return readJson<AnalyticsDay[]>(brandFile('analytics', brandId), []);
  },
  /** Merge by date so history accumulates beyond the API's returned window. */
  writeAnalytics(brandId: string, days: AnalyticsDay[]): void {
    const merged = new Map(this.readAnalytics(brandId).map((d) => [d.date, d]));
    for (const day of days) merged.set(day.date, day);
    writeJson(
      brandFile('analytics', brandId),
      [...merged.values()].sort((a, b) => a.date.localeCompare(b.date)),
    );
  },

  readSignals(): Signal[] {
    return readJson<Signal[]>('signals.json', []);
  },
  /** Rolling log, newest first, capped so the file never grows unbounded. */
  appendSignals(signals: Signal[], cap = 500): void {
    if (signals.length === 0) return;
    writeJson('signals.json', [...signals, ...this.readSignals()].slice(0, cap));
  },

  readUsage(): ForeplayUsage | null {
    return readJson<ForeplayUsage | null>('usage.json', null);
  },
  writeUsage(usage: ForeplayUsage): void {
    writeJson('usage.json', usage);
  },

  readMeta(): StoreMeta {
    return readJson<StoreMeta>('meta.json', { lastSyncAt: null, lastSyncCalls: 0 });
  },
  writeMeta(meta: StoreMeta): void {
    writeJson('meta.json', meta);
  },
};
