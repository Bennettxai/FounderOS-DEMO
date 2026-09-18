import { z } from 'zod';

/**
 * AdPilot campaign layer: paid-media performance for the /adpilot deck.
 * Reads data/adpilot-campaigns.json. Until a real ad account is connected
 * (Foreplay Lens / Meta), the file carries staged numbers on the operator's real
 * offers; the read path, schemas, and every derived metric are the
 * production ones, so connecting the account later swaps the file's
 * producer, not the page.
 */

export const GeoPointSchema = z.object({
  city: z.string(),
  country: z.string(),
  lat: z.number(),
  lng: z.number(),
  leads: z.number().int().min(0),
  bookings: z.number().int().min(0),
});
export type GeoPoint = z.infer<typeof GeoPointSchema>;

/** One day of delivery: Meta insights provide this natively; the staged
 *  file carries plausible dailies so widgets are identical either way. */
export const DailyPointSchema = z.object({
  date: z.string(),
  spend: z.number(),
  leads: z.number(),
  bookings: z.number(),
});
export type DailyPoint = z.infer<typeof DailyPointSchema>;

export const CampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  objective: z.enum(['leads', 'bookings', 'purchases']),
  status: z.enum(['active', 'paused']),
  platform: z.string(),
  period: z.object({ from: z.string(), to: z.string() }),
  spend: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  leads: z.number(),
  bookings: z.number(),
  purchases: z.number(),
  revenue: z.number(),
  audience: z.object({
    age: z.record(z.string(), z.number()),
    gender: z.record(z.string(), z.number()),
    placements: z.record(z.string(), z.number()),
  }),
  geo: z.array(GeoPointSchema),
  daily: z.array(DailyPointSchema).optional(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

/** Merge per-campaign dailies into one series (the "All campaigns" chart). */
export function aggregateDaily(campaigns: Campaign[]): DailyPoint[] {
  const merged = new Map<string, DailyPoint>();
  for (const c of campaigns) {
    for (const d of c.daily ?? []) {
      const hit = merged.get(d.date);
      if (hit) {
        hit.spend += d.spend;
        hit.leads += d.leads;
        hit.bookings += d.bookings;
      } else {
        merged.set(d.date, { ...d });
      }
    }
  }
  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type CampaignMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  bookings: number;
  purchases: number;
  revenue: number;
  ctr: number | null; // clicks / impressions
  cpl: number | null; // spend / leads
  costPerBooking: number | null;
  costPerResult: number | null; // per the objective's unit (aggregate: per booking)
  roas: number | null; // revenue / spend
};

function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

export function campaignMetrics(c: Pick<Campaign, 'spend' | 'impressions' | 'clicks' | 'leads' | 'bookings' | 'purchases' | 'revenue'> & { objective?: Campaign['objective'] }): CampaignMetrics {
  const resultCount =
    c.objective === 'leads' ? c.leads : c.objective === 'purchases' ? c.purchases : c.bookings;
  return {
    spend: c.spend,
    impressions: c.impressions,
    clicks: c.clicks,
    leads: c.leads,
    bookings: c.bookings,
    purchases: c.purchases,
    revenue: c.revenue,
    ctr: ratio(c.clicks, c.impressions),
    cpl: ratio(c.spend, c.leads),
    costPerBooking: ratio(c.spend, c.bookings),
    costPerResult: ratio(c.spend, resultCount),
    roas: ratio(c.revenue, c.spend),
  };
}

/** Sum a set of campaigns into the "All campaigns" view. */
export function aggregateCampaigns(campaigns: Campaign[]): CampaignMetrics {
  const sum = campaigns.reduce(
    (acc, c) => ({
      spend: acc.spend + c.spend,
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      leads: acc.leads + c.leads,
      bookings: acc.bookings + c.bookings,
      purchases: acc.purchases + c.purchases,
      revenue: acc.revenue + c.revenue,
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0, bookings: 0, purchases: 0, revenue: 0 },
  );
  return campaignMetrics(sum);
}

/** Merge geo points across campaigns (same city+country rows sum). */
export function aggregateGeo(campaigns: Campaign[]): GeoPoint[] {
  const merged = new Map<string, GeoPoint>();
  for (const c of campaigns) {
    for (const g of c.geo) {
      const key = `${g.city}|${g.country}`;
      const hit = merged.get(key);
      if (hit) {
        hit.leads += g.leads;
        hit.bookings += g.bookings;
      } else {
        merged.set(key, { ...g });
      }
    }
  }
  return [...merged.values()].sort((a, b) => b.leads - a.leads);
}

/** Spend-weighted merge of audience breakdown shares. */
export function aggregateAudience(campaigns: Campaign[]): Campaign['audience'] {
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0) || 1;
  const merge = (pick: (c: Campaign) => Record<string, number>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const c of campaigns) {
      const w = c.spend / totalSpend;
      for (const [k, v] of Object.entries(pick(c))) out[k] = (out[k] ?? 0) + v * w;
    }
    for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 10) / 10;
    return out;
  };
  return {
    age: merge((c) => c.audience.age),
    gender: merge((c) => c.audience.gender),
    placements: merge((c) => c.audience.placements),
  };
}
