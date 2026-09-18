import { Client } from '@notionhq/client';
import { BrandDealSchema, type BrandDeal } from '@/lib/schemas';

/**
 * The Notion "Brand Deals Hub" database, read into the OS.
 *
 * Notion stays the source of truth: the brand-deal agents (research, draft-reply,
 * the Create Gmail draft button) are wired to it, and collaborators are invited
 * on the Notion page itself — the OS never has to solve sharing. An iframe was
 * measured dead (Notion sends X-Frame-Options: SAMEORIGIN even on published
 * notion.site pages), so this reads the API.
 *
 * Same cache discipline as comms, same reasons: the page must never pay a live
 * network call per render, the TTL outlives the 15-minute sweep that warms it,
 * and only successes are cached so an outage retries instead of pinning.
 */

// The DATA SOURCE id (not the database id): @notionhq/client v5 queries
// collections via dataSources.query. There is no default — the id points at one
// specific workspace's database, so it is configuration, never a constant.
const dataSourceId = (env: Record<string, string | undefined>): string | undefined =>
  env.NOTION_BRAND_DEALS_SOURCE || undefined;

export const BRAND_DEALS_CACHE_TTL_MS = 20 * 60_000;
let cache: { at: number; deals: BrandDeal[] } | null = null;

/** Drops the cache so a test or a manual refresh sees fresh state. */
export function invalidateBrandDealsCache(): void {
  cache = null;
}

/** The Status lanes in the operator's Notion board order (to_do → in_progress → complete). */
export const PIPELINE_ORDER = [
  'New',
  'Negotiating',
  'Aligned',
  'Researching',
  'Filming',
  'Editing',
  'Delivered',
  'Invoiced',
  'Approved',
  'Paid',
  'Declined',
  'Paused',
] as const;

/* eslint-disable @typescript-eslint/no-explicit-any -- the Notion API returns
   deeply-unioned property objects; we pick defensively and Zod-validate out. */
const text = (p: any): string | null => {
  const parts = p?.title ?? p?.rich_text;
  const joined = Array.isArray(parts) ? parts.map((t: any) => t?.plain_text ?? '').join('') : '';
  return joined.trim() || null;
};
const sel = (p: any): string | null => p?.select?.name ?? p?.status?.name ?? null;
const num = (p: any): number | null => (typeof p?.number === 'number' ? p.number : null);
const date = (p: any): string | null => p?.date?.start ?? null;

/** One Notion page → one validated deal; null when there is no brand name. */
export function parseNotionDeal(page: any): BrandDeal | null {
  const props = page?.properties ?? {};
  const brand = text(props['Brand Name']);
  if (!brand) return null;
  return BrandDealSchema.parse({
    id: String(page.id ?? brand),
    brand,
    status: sel(props['Status']) ?? 'New',
    tier: sel(props['Brand Tier']),
    dealValueUsd: num(props['Deal Value']),
    budgetUsd: num(props['Budget']),
    amountAgreedUsd: num(props['Amount Agreed']),
    suggestedRateUsd: num(props['Suggested Rate']),
    paidInFull: props['Paid in Full']?.checkbox === true,
    deadline: date(props['Deadline']),
    followUpDate: date(props['Follow-up Date']),
    contactName: text(props['Contact Name']),
    contactEmail: props['Contact Email']?.email ?? null,
    mainChannel: sel(props['Main Channel']),
    videoType: sel(props['Video Type']),
    source: sel(props['Source']),
    icpFit: sel(props['ICP Fit']),
    notionUrl: String(page.url ?? `https://www.notion.so/${String(page.id ?? '').replace(/-/g, '')}`),
    lastEdited: String(page.last_edited_time ?? new Date(0).toISOString()),
    seeded: false,
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type PipelineLane = { status: string; deals: BrandDeal[] };

/** Board lanes in pipeline order; unknown statuses get their own trailing lane
 *  rather than vanishing — hiding a deal is worse than an ugly column. */
export function groupDeals(deals: BrandDeal[]): PipelineLane[] {
  const lanes: PipelineLane[] = PIPELINE_ORDER.map((status) => ({ status, deals: [] }));
  for (const deal of deals) {
    let lane = lanes.find((l) => l.status === deal.status);
    if (!lane) {
      lane = { status: deal.status, deals: [] };
      lanes.push(lane);
    }
    lane.deals.push(deal);
  }
  return lanes;
}

/** Placeholder rows so the tab reads as a real board before the key lands.
 *  Marked seeded so the page badges itself honestly, trading-page style. */
export const SEEDED_DEALS: BrandDeal[] = [
  {
    id: 'seed-1', brand: 'Notion (example)', status: 'Negotiating', tier: 'S',
    dealValueUsd: 6000, budgetUsd: 8000, amountAgreedUsd: null, suggestedRateUsd: 6500,
    paidInFull: false, deadline: '2026-09-05', followUpDate: '2026-08-20',
    contactName: 'Sam Rivera', contactEmail: 'sam@example.com', mainChannel: 'Instagram',
    videoType: 'Integration', source: 'Inbound', icpFit: 'Strong',
    notionUrl: 'https://www.notion.so/', lastEdited: '2026-08-13T15:00:00.000Z', seeded: true,
  },
  {
    id: 'seed-2', brand: 'Framer (example)', status: 'New', tier: 'A',
    dealValueUsd: null, budgetUsd: null, amountAgreedUsd: null, suggestedRateUsd: 4000,
    paidInFull: false, deadline: null, followUpDate: '2026-08-18',
    contactName: null, contactEmail: null, mainChannel: 'TikTok',
    videoType: 'Short-form', source: 'Outbound', icpFit: 'Decent',
    notionUrl: 'https://www.notion.so/', lastEdited: '2026-08-12T10:00:00.000Z', seeded: true,
  },
  {
    id: 'seed-3', brand: 'Shopify (example)', status: 'Filming', tier: 'S',
    dealValueUsd: 9000, budgetUsd: 9000, amountAgreedUsd: 9000, suggestedRateUsd: 8500,
    paidInFull: false, deadline: '2026-08-28', followUpDate: null,
    contactName: 'Dana K', contactEmail: 'dana@example.com', mainChannel: 'YouTube',
    videoType: 'Dedicated', source: 'Agency', icpFit: 'Strong',
    notionUrl: 'https://www.notion.so/', lastEdited: '2026-08-11T09:00:00.000Z', seeded: true,
  },
  {
    id: 'seed-4', brand: 'Riverside (example)', status: 'Paid', tier: 'B',
    dealValueUsd: 2500, budgetUsd: 2500, amountAgreedUsd: 2500, suggestedRateUsd: 2500,
    paidInFull: true, deadline: null, followUpDate: null,
    contactName: null, contactEmail: null, mainChannel: 'Podcast',
    videoType: 'Mention', source: 'Referral', icpFit: 'Decent',
    notionUrl: 'https://www.notion.so/', lastEdited: '2026-07-30T16:00:00.000Z', seeded: true,
  },
];

export type BrandDealsResult = {
  deals: BrandDeal[];
  /** 'live' from Notion, 'seeded' placeholders, 'error' key set but fetch failed. */
  mode: 'live' | 'seeded' | 'error';
  detail: string;
  /** epoch ms of the read the deals came from; null when nothing synced. */
  syncedAt: number | null;
};

export async function fetchBrandDeals(
  env: Record<string, string | undefined> = process.env,
): Promise<BrandDealsResult> {
  const key = env.NOTION_API_KEY;
  if (!key) {
    return {
      deals: SEEDED_DEALS,
      mode: 'seeded',
      detail: 'Showing examples. Plant NOTION_API_KEY (internal integration secret, shared with Brand Deals Hub) to go live.',
      syncedAt: null,
    };
  }
  const source = dataSourceId(env);
  if (!source) {
    return {
      deals: SEEDED_DEALS,
      mode: 'seeded',
      detail: 'Showing examples. Plant NOTION_BRAND_DEALS_SOURCE (the Brand Deals Hub data-source id) to go live.',
      syncedAt: null,
    };
  }
  const now = Date.now();
  if (cache && now - cache.at < BRAND_DEALS_CACHE_TTL_MS) {
    return { deals: cache.deals, mode: 'live', detail: `Brand Deals Hub · ${cache.deals.length} deals`, syncedAt: cache.at };
  }
  try {
    const notion = new Client({ auth: key });
    const deals: BrandDeal[] = [];
    let cursor: string | undefined;
    do {
      const res = await notion.dataSources.query({
        data_source_id: source,
        start_cursor: cursor,
        page_size: 100,
      });
      for (const page of res.results) {
        const deal = parseNotionDeal(page);
        if (deal) deals.push(deal);
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
    // Successes only: a transient failure must retry, not pin an empty board.
    const at = Date.now();
    if (deals.length > 0) cache = { at, deals };
    return { deals, mode: 'live', detail: `Brand Deals Hub · ${deals.length} deals`, syncedAt: at };
  } catch (err) {
    if (cache) {
      // A stale board beats an empty one, said honestly.
      return { deals: cache.deals, mode: 'live', detail: 'Notion unreachable · showing the last good read', syncedAt: cache.at };
    }
    return {
      deals: [],
      mode: 'error',
      detail: `Key set but the fetch failed: ${err instanceof Error ? err.message : String(err)}. Is the integration shared with Brand Deals Hub?`,
      syncedAt: null,
    };
  }
}
