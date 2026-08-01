import { describe, expect, test } from 'vitest';
import { parseBeehiivPosts } from '@/lib/connectors/beehiiv';
import {
  getNewsletters,
  newsletterSummary,
  NewsletterSchema,
  SEED_NEWSLETTERS,
} from '@/lib/newsletters';

// A payload shaped like the real Beehiiv REST
// `GET /publications/{pub}/posts?expand[]=stats` response.
const REST_PAYLOAD = {
  data: [
    {
      id: 'post_a',
      title: 'First send',
      status: 'confirmed',
      publish_date: 1784239919, // unix seconds
      web_url: 'https://x.beehiiv.com/p/first',
      stats: {
        email: {
          recipients: 1000,
          delivered: 980,
          opens: 400,
          unique_opens: 300,
          open_rate: 30.61,
          clicks: 50,
          unique_clicks: 40,
          click_rate: 4.08,
          unsubscribes: 10,
          spam_reports: 1,
        },
        web: { views: 5, clicks: 2 },
      },
    },
    {
      // a draft — must be excluded (not a sent newsletter)
      id: 'post_draft',
      title: 'Work in progress',
      status: 'draft',
      publish_date: null,
      stats: {},
    },
  ],
};

describe('parseBeehiivPosts — REST posts+stats to Newsletter[]', () => {
  test('maps sent posts, derives rates, converts the unix date', () => {
    const out = parseBeehiivPosts(REST_PAYLOAD);
    expect(out).not.toBeNull();
    expect(out).toHaveLength(1); // draft excluded
    const n = out![0];
    expect(n.id).toBe('post_a');
    expect(n.title).toBe('First send');
    expect(n.publishedAt).toBe(new Date(1784239919 * 1000).toISOString());
    expect(n.webUrl).toBe('https://x.beehiiv.com/p/first');
    expect(n.recipients).toBe(1000);
    expect(n.delivered).toBe(980);
    expect(n.deliveryRate).toBeCloseTo(98.0, 1); // 980/1000
    expect(n.opens).toBe(300); // unique_opens
    expect(n.openRate).toBeCloseTo(30.61, 2); // API-provided
    expect(n.clicks).toBe(40); // unique_clicks
    expect(n.clickRate).toBeCloseTo(4.08, 2);
    expect(n.unsubscribes).toBe(10);
    expect(n.unsubscribeRate).toBeCloseTo((10 / 980) * 100, 2);
    expect(n.spamReports).toBe(1);
    expect(n.webViews).toBe(5);
  });

  test('every parsed newsletter validates against the schema', () => {
    for (const n of parseBeehiivPosts(REST_PAYLOAD)!) {
      expect(() => NewsletterSchema.parse(n)).not.toThrow();
    }
  });

  test('empty or garbage payloads return an empty list, never throw', () => {
    expect(parseBeehiivPosts({ data: [] })).toEqual([]);
    expect(parseBeehiivPosts({})).toEqual([]);
    expect(parseBeehiivPosts(null)).toEqual([]);
    expect(parseBeehiivPosts('nope')).toEqual([]);
  });
});

describe('getNewsletters — live with seeded fallback', () => {
  test('falls back to the seed when no key is configured', async () => {
    const list = await getNewsletters({}); // empty env: no BEEHIIV_API_KEY
    expect(list).toEqual(SEED_NEWSLETTERS);
    expect(list.length).toBeGreaterThan(0);
  });

  test('the seed is a valid, sent-ordered set', () => {
    expect(SEED_NEWSLETTERS.length).toBeGreaterThanOrEqual(3);
    for (const n of SEED_NEWSLETTERS) {
      expect(() => NewsletterSchema.parse(n)).not.toThrow();
      expect(n.openRate).toBeGreaterThan(0);
    }
    // newest first
    const dates = SEED_NEWSLETTERS.map((n) => n.publishedAt);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });
});

describe('newsletterSummary — aggregate metrics', () => {
  test('counts, totals recipients, and averages the open rate', () => {
    const list = [
      { ...SEED_NEWSLETTERS[0], recipients: 1000, openRate: 20 },
      { ...SEED_NEWSLETTERS[0], recipients: 3000, openRate: 30 },
    ];
    const s = newsletterSummary(list);
    expect(s.count).toBe(2);
    expect(s.totalRecipients).toBe(4000);
    expect(s.avgOpenRate).toBeCloseTo(25, 5); // simple mean of 20 and 30
    expect(s.bestOpenRate).toBe(30);
  });

  test('an empty list yields zeroed, non-throwing summary', () => {
    const s = newsletterSummary([]);
    expect(s).toEqual({ count: 0, totalRecipients: 0, avgOpenRate: 0, bestOpenRate: 0 });
  });
});
