import type { ForeplayClient, ForeplayAd, SpyderBrand } from '@/lib/foreplay/client';
import { daysRunning, driverFingerprint, hookLine, winners } from '@/lib/foreplay/signals';

/**
 * Sponsor ad dossier: the brand-deal lane. Given a sponsor's domain, pull
 * every Foreplay brand profile publishing for it and answer the questions
 * that price a deal: how much are they actually running, is it growing,
 * what formats, what's their proven creative, and do they publish from more
 * than one page (multiple pages ≈ partner/whitelisted placements: the
 * usage-rights conversation). Longevity and page count are honest public
 * observations; nothing here invents spend numbers.
 */

export type BrandDossier = {
  domain: string;
  pages: { id: string; name: string; activeAds: number | null; totalAds: number | null }[];
  activeTotal: number;
  velocity: { date: string; active: number }[]; // most recent 14 days, primary page
  formatSplit: Record<string, number>;
  topAds: {
    id: string;
    page: string;
    daysRunning: number;
    live: boolean;
    hook: string | null;
    format: string | null;
    ctaType: string | null;
  }[];
  drivers: Record<string, number>; // fingerprint of the live winners
  multiPage: boolean;
  apiCalls: number;
};

export async function buildBrandDossier(client: ForeplayClient, domain: string): Promise<BrandDossier | null> {
  const startCalls = client.callCount;
  const pages = await client.brandsByDomain(domain);
  if (pages.length === 0) return null;

  // Primary page = the one with the biggest footprint.
  const ranked = [...pages].sort((a, b) => (b.ads_count ?? 0) - (a.ads_count ?? 0));
  const primary = ranked[0];

  const ads = await client.adsByBrandId(ranked.slice(0, 3).map((p) => p.id).join(','), {});
  const series = await client.brandAnalytics(primary.id).catch(() => []);

  const live = ads.filter((a) => a.live);
  const formatSplit: Record<string, number> = {};
  for (const ad of live) {
    const fmt = ad.display_format ?? 'unknown';
    formatSplit[fmt] = (formatSplit[fmt] ?? 0) + 1;
  }

  const pageName = (ad: ForeplayAd, all: SpyderBrand[]) =>
    all.find((p) => p.id === ad.brand_id)?.name ?? ad.name ?? 'unknown page';

  const top = winners(ads, 1).slice(0, 5);

  return {
    domain,
    pages: ranked.map((p) => ({
      id: p.id,
      name: p.name,
      activeAds: p.active_ads_count ?? null,
      totalAds: p.ads_count ?? null,
    })),
    activeTotal: live.length,
    velocity: series.slice(-14).map((d) => ({ date: d.date, active: d.active_count })),
    formatSplit,
    topAds: top.map((ad) => ({
      id: ad.id,
      page: pageName(ad, ranked),
      daysRunning: daysRunning(ad),
      live: ad.live === true,
      hook: hookLine(ad),
      format: ad.display_format ?? null,
      ctaType: ad.cta_type ?? null,
    })),
    drivers: driverFingerprint(top),
    multiPage: ranked.length > 1,
    apiCalls: client.callCount - startCalls,
  };
}

/** Plain-text dossier for the terminal, Telegram, and the deal folder. */
export function renderDossier(d: BrandDossier): string {
  const lines: string[] = [];
  lines.push(`Ad dossier: ${d.domain}`);
  lines.push(`Pages publishing: ${d.pages.map((p) => `${p.name}${p.activeAds != null ? ` (${p.activeAds} active)` : ''}`).join(', ')}`);
  if (d.multiPage) lines.push(`Runs ads from ${d.pages.length} pages: partner/whitelisted placements likely; usage rights are worth pricing.`);
  lines.push(`Live ads seen: ${d.activeTotal} · formats: ${Object.entries(d.formatSplit).map(([f, n]) => `${f} ${n}`).join(', ') || 'none'}`);
  if (d.velocity.length > 0) {
    const first = d.velocity[0];
    const last = d.velocity[d.velocity.length - 1];
    // Foreplay's latest analytics day lags behind observed live ads.
    const filling = last.active === 0 && d.activeTotal > 0 ? ' (latest day still filling)' : '';
    lines.push(`Velocity (14d): ${first.active} → ${last.active} active ads${filling}`);
  }
  if (d.topAds.length > 0) {
    lines.push('Longest-running creative:');
    for (const ad of d.topAds) {
      lines.push(`  · ${ad.daysRunning}d ${ad.live ? 'LIVE' : 'off'} [${ad.format ?? '?'}] ${ad.hook ? `"${ad.hook.slice(0, 90)}"` : '(no transcript hook)'}`);
    }
  }
  const drivers = Object.entries(d.drivers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  if (drivers.length > 0) lines.push(`Winning-creative drivers: ${drivers.map(([k, v]) => `${k} ${v}`).join(', ')}`);
  lines.push(`(${d.apiCalls} API calls)`);
  return lines.join('\n');
}
