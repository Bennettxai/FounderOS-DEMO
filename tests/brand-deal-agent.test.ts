import { describe, expect, test } from 'vitest';
import { triageDeals, URGENCY, type DealAction } from '@/lib/agents/brand-deal-triage';
import type { BrandDeal } from '@/lib/schemas';

/**
 * the operator, 2026-08-19: a brand deal agent. The judgment lives here as a pure
 * function rather than in a prompt, because "which deal is bleeding money right
 * now" is a rule, not an opinion, and a rule can be tested. The model's job is
 * the wording; this decides what it is allowed to talk about.
 */
const TODAY = '2026-08-19';

const deal = (over: Partial<BrandDeal> = {}): BrandDeal => ({
  id: 'd1',
  brand: 'Acme',
  status: 'New',
  tier: null,
  dealValueUsd: null,
  budgetUsd: null,
  amountAgreedUsd: null,
  suggestedRateUsd: null,
  paidInFull: false,
  deadline: null,
  followUpDate: null,
  contactName: null,
  contactEmail: null,
  mainChannel: null,
  videoType: null,
  source: null,
  icpFit: null,
  notionUrl: 'https://notion.so/x',
  lastEdited: '2026-08-19T00:00:00.000Z',
  seeded: false,
  ...over,
});

const kinds = (a: DealAction[]) => a.map((x) => x.kind);

describe('triageDeals', () => {
  test('an empty pipeline produces no busywork', () => {
    expect(triageDeals([], TODAY)).toEqual([]);
  });

  test('delivered work that was never paid is chased', () => {
    const out = triageDeals([deal({ status: 'Invoiced', paidInFull: false, amountAgreedUsd: 4000 })], TODAY);
    expect(kinds(out)).toContain('chase-payment');
  });

  test('a deal already paid in full is left alone', () => {
    const out = triageDeals([deal({ status: 'Paid', paidInFull: true, amountAgreedUsd: 4000 })], TODAY);
    expect(out).toEqual([]);
  });

  test('a missed deadline outranks everything else', () => {
    const out = triageDeals(
      [
        deal({ id: 'late', status: 'Filming', deadline: '2026-08-10' }),
        deal({ id: 'money', status: 'Invoiced', paidInFull: false, amountAgreedUsd: 9000 }),
      ],
      TODAY,
    );
    expect(out[0].dealId).toBe('late');
    expect(out[0].kind).toBe('overdue');
    expect(out[0].urgency).toBe(URGENCY.overdue);
  });

  test('a deadline inside the week is a warning, not yet a fire', () => {
    const out = triageDeals([deal({ status: 'Filming', deadline: '2026-08-23' })], TODAY);
    expect(kinds(out)).toContain('deadline-soon');
    expect(out[0].urgency).toBeLessThan(URGENCY.overdue);
  });

  test('a deadline already delivered against is not a deadline problem', () => {
    for (const status of ['Delivered', 'Invoiced', 'Approved', 'Paid']) {
      expect(kinds(triageDeals([deal({ status, deadline: '2026-08-10' })], TODAY))).not.toContain('overdue');
    }
  });

  test('a follow-up that has come due is surfaced', () => {
    expect(kinds(triageDeals([deal({ followUpDate: '2026-08-19' })], TODAY))).toContain('follow-up-due');
    expect(kinds(triageDeals([deal({ followUpDate: '2026-08-25' })], TODAY))).not.toContain('follow-up-due');
  });

  test('a negotiation with no number on it needs one', () => {
    const out = triageDeals(
      [deal({ status: 'Negotiating', amountAgreedUsd: null, suggestedRateUsd: 3500 })],
      TODAY,
    );
    const priced = out.find((a) => a.kind === 'needs-price');
    expect(priced).toBeTruthy();
    // the suggested rate is the number to open with, so it must reach the copy
    expect(priced!.detail).toContain('3,500');
  });

  test('inbound that has sat untouched is money going cold', () => {
    const out = triageDeals([deal({ status: 'New', lastEdited: '2026-08-14T00:00:00.000Z' })], TODAY);
    expect(kinds(out)).toContain('stale-inbound');
  });

  test('inbound from today is not stale', () => {
    expect(kinds(triageDeals([deal({ status: 'New', lastEdited: '2026-08-19T09:00:00.000Z' })], TODAY)))
      .not.toContain('stale-inbound');
  });

  test('dead lanes are never chased', () => {
    for (const status of ['Declined', 'Paused']) {
      expect(triageDeals([deal({ status, deadline: '2026-08-01', followUpDate: '2026-08-01' })], TODAY)).toEqual([]);
    }
  });

  test('seeded placeholder rows never generate real actions', () => {
    const out = triageDeals([deal({ seeded: true, status: 'Invoiced', paidInFull: false })], TODAY);
    expect(out).toEqual([]);
  });

  test('every action names the brand and links back to Notion, so it is actionable', () => {
    const out = triageDeals([deal({ brand: 'Ridge', status: 'Invoiced', amountAgreedUsd: 2000 })], TODAY);
    expect(out[0].brand).toBe('Ridge');
    expect(out[0].notionUrl).toBe('https://notion.so/x');
  });

  test('one deal can raise several actions, highest urgency first', () => {
    const out = triageDeals(
      [deal({ status: 'Negotiating', suggestedRateUsd: 1000, followUpDate: '2026-08-01', deadline: '2026-08-01' })],
      TODAY,
    );
    expect(out.length).toBeGreaterThan(1);
    const urgencies = out.map((a) => a.urgency);
    expect([...urgencies].sort((a, b) => b - a)).toEqual(urgencies);
  });
});

/**
 * The prompt is the control surface between tested rules and an untested model.
 * These pin the two things that stop the model quietly rewriting the pipeline.
 */
describe('brandDealPrompt', () => {
  test('the model is told it may not add, drop or reorder the actions', async () => {
    const { brandDealPrompt } = await import('@/lib/agents/brand-deal-agent');
    const actions = triageDeals([deal({ status: 'Invoiced', amountAgreedUsd: 1000 })], TODAY);
    const p = brandDealPrompt(actions, 1, TODAY);
    expect(p).toMatch(/only the actions you may write about|Do not add, merge or drop/i);
    expect(p).toContain('Acme');
  });

  test('an empty pipeline tells the model to say nothing rather than invent work', async () => {
    const { brandDealPrompt } = await import('@/lib/agents/brand-deal-agent');
    expect(brandDealPrompt([], 12, TODAY)).toMatch(/Do not invent work/i);
  });
});
