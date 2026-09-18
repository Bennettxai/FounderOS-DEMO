import { z } from 'zod';
import { resolveCred, CRED_FILES } from '@/lib/creds';

/**
 * Foreplay public API client (public.api.foreplay.co, spec 0.26.x): the read
 * side of Adscout. The API is read-only: tracking brands / saving ads happens
 * in the Foreplay app; this client reads, and everything downstream reasons
 * over locally stored snapshots so credits are spent once per fact.
 *
 * Every call burns account credits (10k/mo plan), so the client counts calls
 * and the sync layer caches aggressively. Responses are Zod-parsed with
 * passthrough objects: the fields Adscout depends on are typed, the rest ride
 * along untouched so a spec bump doesn't break the store.
 */

export const FOREPLAY_KEY = 'FOREPLAY_API_KEY';
const BASE_URL = 'https://public.api.foreplay.co';

export function resolveForeplayKey(): string | undefined {
  return resolveCred(FOREPLAY_KEY, [CRED_FILES.socialMedia, CRED_FILES.brainAgent]);
}

/* ---------------------------------- shapes --------------------------------- */

const Envelope = z.object({
  metadata: z
    .object({
      success: z.boolean().optional(),
      message: z.string().optional(),
      status_code: z.number().optional(),
      cursor: z.union([z.string(), z.null()]).optional(),
      count: z.number().optional(),
    })
    .passthrough()
    .optional(),
  data: z.unknown(),
  error: z.unknown().optional(),
});

export const ForeplayAdSchema = z
  .object({
    id: z.string(),
    ad_id: z.string().optional().nullable(),
    name: z.string().optional().nullable(), // publishing page name
    brand_id: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    headline: z.string().optional().nullable(),
    full_transcription: z.string().optional().nullable(),
    timestamped_transcription: z
      .array(z.object({ startTime: z.number(), endTime: z.number(), sentence: z.string() }).passthrough())
      .optional()
      .nullable(),
    emotional_drivers: z.record(z.string(), z.number()).optional().nullable(),
    display_format: z.string().optional().nullable(),
    publisher_platform: z.array(z.string()).optional().nullable(),
    live: z.boolean().optional().nullable(),
    started_running: z.number().optional().nullable(), // epoch ms
    running_duration: z.object({ seconds: z.number() }).passthrough().optional().nullable(),
    thumbnail: z.string().optional().nullable(),
    video: z.string().optional().nullable(),
    image: z.string().optional().nullable(),
    cta_type: z.string().optional().nullable(),
    cta_title: z.string().optional().nullable(),
    link_url: z.string().optional().nullable(),
    product_category: z.string().optional().nullable(),
    market_target: z.string().optional().nullable(),
  })
  .passthrough();
export type ForeplayAd = z.infer<typeof ForeplayAdSchema>;

export const SpyderBrandSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    ad_library_id: z.string().optional().nullable(),
    avatar: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    websites: z.array(z.unknown()).optional().nullable(),
    ads_count: z.number().optional().nullable(),
    active_ads_count: z.number().optional().nullable(),
  })
  .passthrough();
export type SpyderBrand = z.infer<typeof SpyderBrandSchema>;

/** One day of brand analytics: active/inactive totals + per-format counts. */
export const AnalyticsDaySchema = z
  .object({
    date: z.string(),
    active_count: z.number(),
    inactive_count: z.number().optional().nullable(),
    video: z.number().optional().nullable(),
    image: z.number().optional().nullable(),
    carousel: z.number().optional().nullable(),
  })
  .passthrough();
export type AnalyticsDay = z.infer<typeof AnalyticsDaySchema>;

export const ForeplayUsageSchema = z
  .object({
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    total_credits: z.number(),
    remaining_credits: z.number(),
    user: z.object({ id: z.string(), email: z.string() }).passthrough().optional(),
  })
  .passthrough();
export type ForeplayUsage = z.infer<typeof ForeplayUsageSchema>;

export type AdFilters = {
  start_date?: string;
  end_date?: string;
  live?: boolean;
  display_format?: string;
  running_duration_min_days?: number;
  limit?: number;
  order?: string;
};

/* ---------------------------------- client --------------------------------- */

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export class ForeplayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ForeplayError';
  }
}

export class ForeplayClient {
  /** Number of API requests made by this instance: the credit ledger. */
  callCount = 0;

  constructor(
    private readonly key: string,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
    private readonly baseUrl: string = BASE_URL,
  ) {}

  private async request(pathname: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${pathname}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    this.callCount += 1;
    const res = await this.fetchImpl(url.toString(), { headers: { Authorization: this.key } });
    const body = await res.json().catch(() => undefined);
    if (!res.ok) {
      const detail =
        typeof body === 'object' && body !== null && 'message' in body
          ? String((body as { message: unknown }).message)
          : `HTTP ${res.status}`;
      throw new ForeplayError(`Foreplay ${pathname}: ${detail}`, res.status);
    }
    const envelope = Envelope.safeParse(body);
    if (!envelope.success) throw new ForeplayError(`Foreplay ${pathname}: unrecognized response shape`);
    return envelope.data.data;
  }

  async usage(): Promise<ForeplayUsage> {
    return ForeplayUsageSchema.parse(await this.request('/api/usage'));
  }

  /** Spyder watchlist: the brands the operator tracks in the Foreplay app (limit ≤ 10 per page). */
  async spyderBrands(): Promise<SpyderBrand[]> {
    const out: SpyderBrand[] = [];
    for (let offset = 0; offset < 100; offset += 10) {
      const page = z.array(SpyderBrandSchema).parse(await this.request('/api/spyder/brands', { limit: 10, offset }));
      out.push(...page);
      if (page.length < 10) break;
    }
    return out;
  }

  async spyderBrandAds(brandId: string, filters: AdFilters = {}): Promise<ForeplayAd[]> {
    const data = await this.request('/api/spyder/brand/ads', { brand_id: brandId, ...filters });
    return z.array(ForeplayAdSchema).parse(data);
  }

  /** Daily active/inactive + format-split series: the creative-velocity signal. */
  async brandAnalytics(id: string, startDate?: string, endDate?: string): Promise<AnalyticsDay[]> {
    const data = await this.request('/api/brand/analytics', { id, start_date: startDate, end_date: endDate });
    return z.array(AnalyticsDaySchema).parse(data);
  }

  /** All Foreplay brand profiles (pages) publishing for a domain: the sponsor-dossier entry point. */
  async brandsByDomain(domain: string, limit = 10): Promise<SpyderBrand[]> {
    const data = await this.request('/api/brand/getBrandsByDomain', { domain, limit });
    return z.array(SpyderBrandSchema).parse(data);
  }

  async adsByBrandId(brandIds: string, filters: AdFilters = {}): Promise<ForeplayAd[]> {
    const data = await this.request('/api/brand/getAdsByBrandId', { brand_ids: brandIds, ...filters });
    return z.array(ForeplayAdSchema).parse(data);
  }

  /** Search the ~100M-ad Discovery database. Explicit spend: user-triggered only. */
  async discoveryAds(query: string, filters: AdFilters = {}): Promise<ForeplayAd[]> {
    const data = await this.request('/api/discovery/ads', { query, ...filters });
    return z.array(ForeplayAdSchema).parse(data);
  }

  async adDetails(adId: string): Promise<ForeplayAd> {
    return ForeplayAdSchema.parse(await this.request('/api/ad', { ad_id: adId }));
  }

  /** Ads reusing the same creative: group growth is the scaling signal. */
  async adDuplicates(adId: string): Promise<ForeplayAd[]> {
    const data = await this.request(`/api/ad/duplicates/${encodeURIComponent(adId)}`);
    return z.array(ForeplayAdSchema).parse(data);
  }
}

/** Client from the resolved key, or null when unconfigured: callers stay honest. */
export function createForeplayClient(fetchImpl?: FetchLike): ForeplayClient | null {
  const key = resolveForeplayKey();
  if (!key) return null;
  return new ForeplayClient(key, fetchImpl);
}
