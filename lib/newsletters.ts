import { z } from 'zod';
import { beehiivPosts, type Newsletter } from '@/lib/connectors/beehiiv';

export type { Newsletter };

/** Zod guard for a Newsletter crossing the connector/seed boundary. */
export const NewsletterSchema = z.object({
  id: z.string(),
  title: z.string(),
  publishedAt: z.string(),
  webUrl: z.string().nullable(),
  recipients: z.number().nonnegative(),
  delivered: z.number().nonnegative(),
  deliveryRate: z.number(),
  opens: z.number().nonnegative(),
  openRate: z.number(),
  clicks: z.number().nonnegative(),
  clickRate: z.number(),
  unsubscribes: z.number().nonnegative(),
  unsubscribeRate: z.number(),
  spamReports: z.number().nonnegative(),
  webViews: z.number().nonnegative(),
});

/**
 * Seeded newsletters — larp-first fallback so `/social/beehiiv` is alive
 * without a Beehiiv key. Replaced 1:1 by live posts when the connector has
 * data. Newest first, plausible ramp of a growing list.
 */
export const SEED_NEWSLETTERS: Newsletter[] = [
  {
    id: 'seed-4', title: 'Ship the system, not the hustle', publishedAt: '2026-07-14T15:00:00.000Z',
    webUrl: null, recipients: 15400, delivered: 15150, deliveryRate: 98.38,
    opens: 3520, openRate: 23.24, clicks: 158, clickRate: 4.6,
    unsubscribes: 88, unsubscribeRate: 0.58, spamReports: 0, webViews: 6,
  },
  {
    id: 'seed-3', title: 'What 30 days of operator OS looks like', publishedAt: '2026-07-07T15:00:00.000Z',
    webUrl: null, recipients: 14600, delivered: 14380, deliveryRate: 98.49,
    opens: 3180, openRate: 22.12, clicks: 141, clickRate: 4.28,
    unsubscribes: 79, unsubscribeRate: 0.55, spamReports: 1, webViews: 4,
  },
  {
    id: 'seed-2', title: 'The duct-tape stack is costing you', publishedAt: '2026-06-30T15:00:00.000Z',
    webUrl: null, recipients: 13900, delivered: 13690, deliveryRate: 98.49,
    opens: 3010, openRate: 21.99, clicks: 128, clickRate: 4.05,
    unsubscribes: 84, unsubscribeRate: 0.61, spamReports: 0, webViews: 5,
  },
  {
    id: 'seed-1', title: 'Why AI does not know you yet', publishedAt: '2026-06-23T15:00:00.000Z',
    webUrl: null, recipients: 13100, delivered: 12880, deliveryRate: 98.32,
    opens: 2760, openRate: 21.43, clicks: 112, clickRate: 3.81,
    unsubscribes: 90, unsubscribeRate: 0.7, spamReports: 1, webViews: 3,
  },
];

/** Live newsletters when the connector has data, else the seeded fallback. */
export async function getNewsletters(
  env: Record<string, string | undefined> = process.env,
): Promise<Newsletter[]> {
  const live = await beehiivPosts(env);
  if (live && live.length > 0) return live;
  return SEED_NEWSLETTERS;
}

export type NewsletterSummary = {
  count: number;
  totalRecipients: number;
  avgOpenRate: number;
  bestOpenRate: number;
};

/** Roll a newsletter list into headline figures. Empty-safe. */
export function newsletterSummary(list: Newsletter[]): NewsletterSummary {
  if (list.length === 0) return { count: 0, totalRecipients: 0, avgOpenRate: 0, bestOpenRate: 0 };
  const totalRecipients = list.reduce((s, n) => s + n.recipients, 0);
  const avgOpenRate = list.reduce((s, n) => s + n.openRate, 0) / list.length;
  const bestOpenRate = Math.max(...list.map((n) => n.openRate));
  return {
    count: list.length,
    totalRecipients,
    avgOpenRate: Math.round(avgOpenRate * 100) / 100,
    bestOpenRate,
  };
}
