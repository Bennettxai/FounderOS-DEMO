/**
 * One sweep of the operating metrics: every tile on /analytics is a real
 * connector read or an honest pending null. Shared by the page (render) and
 * POST /api/analytics/refresh (the launchd cron that keeps history accruing
 * even when nobody loads the page). Each read degrades to null on failure —
 * a broken connector must never fake a value into the snapshot history.
 */
import type { FounderDb } from '@/lib/db';
import { buildSocialDashboard, audienceGrowthPct } from '@/lib/social';
import { attioStatus } from '@/lib/connectors/attio';
import { wisprStatus } from '@/lib/connectors/wispr';
import { readStoreNotes } from '@/lib/connectors/gbrain';
import { stripeSnapshot } from '@/lib/connectors/payments';
import { unreadCounts } from '@/lib/connectors/email';
import { beehiivSubscribers } from '@/lib/connectors/beehiiv';
import type { MetricInput } from '@/lib/operating-metrics';

export async function gatherOperatingMetrics(
  db: FounderDb,
): Promise<{ inputs: MetricInput[]; subs: number | null }> {
  const dash = buildSocialDashboard(db);
  const totalFollowers = dash.totalFollowers;
  const audience7d = audienceGrowthPct(db, 7);
  const runs = db.agentRuns.recent(2000);
  const today = new Date().toISOString().slice(0, 10);
  const { runsWithin } = await import('@/lib/analytics');
  const runs7d = runsWithin(runs, today, 7);

  const [attio, wispr, stripe, emailUnread, subs] = await Promise.all([
    attioStatus().catch(() => null),
    wisprStatus().catch(() => null),
    stripeSnapshot().catch(() => null),
    unreadCounts()
      .then((cs) => cs.reduce((sum, c) => sum + c.unread, 0))
      .catch(() => null),
    beehiivSubscribers().catch(() => null),
  ]);
  const pipelineDeals = attio?.state === 'connected' ? Number(attio.meta?.deals ?? 0) : null;
  const dictations = wispr?.state === 'connected' ? Number(wispr.meta?.dictations ?? 0) : null;
  const stripeAvail = stripe ? Math.round((stripe.available[0]?.amount ?? 0) / 100) : null;
  let brainPages = 0;
  try {
    brainPages = readStoreNotes().length;
  } catch {
    brainPages = 0;
  }

  const inputs: MetricInput[] = [
    {
      id: 'audience',
      label: 'Audience',
      unit: 'followers',
      source: '7d · Zernio',
      value: totalFollowers || null,
      delta: audience7d != null ? Math.round(audience7d * 10) / 10 : 0,
      deltaPct: audience7d != null,
    },
    { id: 'subscribers', label: 'Subscribers', unit: 'subs', source: 'Beehiiv', value: subs },
    { id: 'pipeline', label: 'Open Pipeline', unit: 'deals', source: 'Attio', value: pipelineDeals },
    { id: 'stripe', label: 'Stripe Available', unit: 'usd', source: 'Stripe', value: stripeAvail },
    { id: 'agent-runs', label: 'Agent Runs', unit: 'runs', source: 'all time', value: runs.length || null, delta: runs7d },
    { id: 'unread', label: 'Unread · all inboxes', unit: 'emails', source: 'Email', value: emailUnread },
    { id: 'brain', label: 'Brain-store Pages', unit: 'pages', source: 'GBrain', value: brainPages },
    { id: 'dictations', label: 'Dictations', unit: 'dictations', source: 'Wispr Flow', value: dictations },
  ];
  return { inputs, subs };
}
