import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CampaignSchema,
  aggregateAudience,
  aggregateCampaigns,
  aggregateGeo,
  campaignMetrics,
  type Campaign,
} from '@/lib/adpilot';
import { readCampaigns } from '@/lib/adpilot-data';

function campaign(over: Partial<Campaign> & { id: string }): Campaign {
  return CampaignSchema.parse({
    name: over.id,
    objective: 'leads',
    status: 'active',
    platform: 'Meta',
    period: { from: '2026-08-15', to: '2026-09-14' },
    spend: 1000,
    impressions: 100000,
    clicks: 2000,
    leads: 100,
    bookings: 10,
    purchases: 5,
    revenue: 3000,
    audience: { age: { '25-34': 50, '35-44': 50 }, gender: { male: 80, female: 20 }, placements: { Reels: 100 } },
    geo: [{ city: 'Austin', country: 'US', lat: 30.27, lng: -97.74, leads: 100, bookings: 10 }],
    ...over,
  });
}

afterEach(() => {
  delete process.env.ADPILOT_DATA_PATH;
});

describe('campaign metrics', () => {
  it('derives every ratio and honors the objective for cost per result', () => {
    const m = campaignMetrics(campaign({ id: 'a', objective: 'leads' }));
    expect(m.cpl).toBe(10);
    expect(m.costPerBooking).toBe(100);
    expect(m.costPerResult).toBe(10); // objective=leads → per lead
    expect(m.roas).toBe(3);
    expect(m.ctr).toBe(0.02);
  });

  it('returns null ratios instead of dividing by zero', () => {
    const m = campaignMetrics(campaign({ id: 'a', leads: 0, bookings: 0, impressions: 0, spend: 0 }));
    expect(m.cpl).toBeNull();
    expect(m.ctr).toBeNull();
    expect(m.roas).toBeNull();
  });

  it('aggregates sums before deriving (never averages ratios)', () => {
    const m = aggregateCampaigns([campaign({ id: 'a', spend: 1000, leads: 100 }), campaign({ id: 'b', spend: 3000, leads: 100 })]);
    expect(m.spend).toBe(4000);
    expect(m.cpl).toBe(20); // 4000/200, not the mean of 10 and 30
  });
});

describe('geo + audience aggregation', () => {
  it('merges same city rows and sorts by leads', () => {
    const merged = aggregateGeo([
      campaign({ id: 'a' }),
      campaign({
        id: 'b',
        geo: [
          { city: 'Austin', country: 'US', lat: 30.27, lng: -97.74, leads: 50, bookings: 5 },
          { city: 'London', country: 'GB', lat: 51.51, lng: -0.13, leads: 200, bookings: 9 },
        ],
      }),
    ]);
    expect(merged[0].city).toBe('London');
    expect(merged.find((g) => g.city === 'Austin')?.leads).toBe(150);
  });

  it('weights audience shares by spend', () => {
    const audience = aggregateAudience([
      campaign({ id: 'a', spend: 1000, audience: { age: { x: 100 }, gender: { male: 100 }, placements: { Reels: 100 } } }),
      campaign({ id: 'b', spend: 3000, audience: { age: { x: 0 }, gender: { male: 100 }, placements: { Reels: 100 } } }),
    ]);
    expect(audience.age.x).toBe(25); // 1000/4000 of the 100 share
  });
});

describe('readCampaigns', () => {
  it('reads and validates the staged file, returns [] when absent (the live-repo state)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adpilot-'));
    const file = path.join(dir, 'campaigns.json');
    fs.writeFileSync(file, JSON.stringify({ campaigns: [campaign({ id: 'a' })] }));
    process.env.ADPILOT_DATA_PATH = file;
    expect(readCampaigns()).toHaveLength(1);
    process.env.ADPILOT_DATA_PATH = path.join(dir, 'missing.json');
    expect(readCampaigns()).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('the checked-in demo dataset parses and stays plausible (no fantasy ROAS)', () => {
    const file = path.join(process.cwd(), 'data', 'adpilot-campaigns.json');
    if (!fs.existsSync(file)) return; // live ships no staged campaigns — honest empty state
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const campaigns = raw.campaigns.map((c: unknown) => CampaignSchema.parse(c));
    const m = aggregateCampaigns(campaigns);
    expect(m.roas).not.toBeNull();
    expect(m.roas!).toBeLessThan(4); // staged numbers must stay believable
    for (const c of campaigns) {
      const geoLeads = c.geo.reduce((s: number, g: { leads: number }) => s + g.leads, 0);
      expect(geoLeads).toBeLessThanOrEqual(c.leads); // map never claims more than the campaign
    }
  });
});
