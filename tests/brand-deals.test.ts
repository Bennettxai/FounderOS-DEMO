import { describe, expect, test } from 'vitest';
import {
  BRAND_DEALS_CACHE_TTL_MS,
  PIPELINE_ORDER,
  SEEDED_DEALS,
  fetchBrandDeals,
  groupDeals,
  parseNotionDeal,
} from '@/lib/connectors/brand-deals';
import { BrandDealSchema } from '@/lib/schemas';

/**
 * /brand-deals mirrors the Notion "Brand Deals Hub" database. Notion stays the
 * source of truth (the brand-deal agents and any invited collaborators work
 * there); the OS renders it. An iframe was measured dead — Notion sends
 * X-Frame-Options: SAMEORIGIN even on published pages — so this reads the API.
 */

// A trimmed but shape-accurate Notion API page object, as databases.query returns.
const NOTION_PAGE = {
  id: 'abc-123',
  url: 'https://www.notion.so/Acme-abc123',
  last_edited_time: '2026-08-10T12:00:00.000Z',
  properties: {
    'Brand Name': { type: 'title', title: [{ plain_text: 'Acme Tools' }] },
    Status: { type: 'status', status: { name: 'Negotiating' } },
    'Brand Tier': { type: 'select', select: { name: 'A' } },
    'Deal Value': { type: 'number', number: 4500 },
    Budget: { type: 'number', number: 6000 },
    'Amount Agreed': { type: 'number', number: null },
    'Suggested Rate': { type: 'number', number: 5000 },
    'Paid in Full': { type: 'checkbox', checkbox: false },
    Deadline: { type: 'date', date: { start: '2026-09-01' } },
    'Follow-up Date': { type: 'date', date: null },
    'Contact Name': { type: 'rich_text', rich_text: [{ plain_text: 'Jo Doe' }] },
    'Contact Email': { type: 'email', email: 'jo@acme.com' },
    'Main Channel': { type: 'select', select: { name: 'Instagram' } },
    'Video Type': { type: 'select', select: { name: 'Integration' } },
    Source: { type: 'select', select: { name: 'Inbound' } },
    'ICP Fit': { type: 'select', select: { name: 'Strong' } },
  },
};

describe('parseNotionDeal', () => {
  test('maps a Notion page into a validated BrandDeal', () => {
    const deal = parseNotionDeal(NOTION_PAGE);
    expect(deal).not.toBeNull();
    expect(BrandDealSchema.parse(deal)).toEqual(deal);
    expect(deal!.brand).toBe('Acme Tools');
    expect(deal!.status).toBe('Negotiating');
    expect(deal!.dealValueUsd).toBe(4500);
    expect(deal!.amountAgreedUsd).toBeNull();
    expect(deal!.deadline).toBe('2026-09-01');
    expect(deal!.followUpDate).toBeNull();
    expect(deal!.contactEmail).toBe('jo@acme.com');
    expect(deal!.notionUrl).toContain('notion.so');
  });

  test('tolerates missing properties rather than dropping the row', () => {
    const bare = {
      id: 'x',
      url: 'https://www.notion.so/x',
      last_edited_time: '2026-08-01T00:00:00.000Z',
      properties: { 'Brand Name': { type: 'title', title: [{ plain_text: 'Mystery Co' }] } },
    };
    const deal = parseNotionDeal(bare);
    expect(deal!.brand).toBe('Mystery Co');
    expect(deal!.status).toBe('New'); // Notion's default status group
    expect(deal!.dealValueUsd).toBeNull();
  });

  test('a page with no title becomes null, not an unnamed row', () => {
    expect(parseNotionDeal({ id: 'y', url: 'u', last_edited_time: 't', properties: {} })).toBeNull();
  });
});

describe('groupDeals — the pipeline board', () => {
  test('groups by status in the Notion pipeline order, not alphabetically', () => {
    const deals = [
      { ...SEEDED_DEALS[0], status: 'Paid' },
      { ...SEEDED_DEALS[0], status: 'New' },
      { ...SEEDED_DEALS[0], status: 'Negotiating' },
    ];
    const lanes = groupDeals(deals);
    const named = lanes.filter((l) => l.deals.length > 0).map((l) => l.status);
    expect(named).toEqual(['New', 'Negotiating', 'Paid']);
    // and the full order matches the Notion board
    expect(PIPELINE_ORDER.slice(0, 3)).toEqual(['New', 'Negotiating', 'Aligned']);
    expect(PIPELINE_ORDER).toContain('Invoiced');
  });

  test('an unknown status still shows up rather than silently vanishing', () => {
    const lanes = groupDeals([{ ...SEEDED_DEALS[0], status: 'Weird Custom' }]);
    expect(lanes.some((l) => l.status === 'Weird Custom' && l.deals.length === 1)).toBe(true);
  });
});

describe('cache + seed rules', () => {
  test('the TTL outlives the 15-minute sweep that refills it', () => {
    // same lesson as comms: the sweep pays the cold cost, never a person
    expect(BRAND_DEALS_CACHE_TTL_MS).toBeGreaterThan(15 * 60_000);
  });

  test('seeded rows validate and are unmistakably seeded', () => {
    expect(SEEDED_DEALS.length).toBeGreaterThanOrEqual(4);
    for (const d of SEEDED_DEALS) expect(BrandDealSchema.parse(d)).toEqual(d);
    // every seeded row is marked so the page can badge itself honestly
    expect(SEEDED_DEALS.every((d) => d.seeded)).toBe(true);
  });
});

// The data-source id names one specific workspace's database, so it is
// configuration with no sensible default: without it the board must show its
// examples rather than query a stranger's collection.
test('stays on the seeded examples when the data-source id is unset', async () => {
  const res = await fetchBrandDeals({ NOTION_API_KEY: 'secret_x' });
  expect(res.mode).toBe('seeded');
  expect(res.deals).toEqual(SEEDED_DEALS);
  expect(res.detail).toContain('NOTION_BRAND_DEALS_SOURCE');
});
