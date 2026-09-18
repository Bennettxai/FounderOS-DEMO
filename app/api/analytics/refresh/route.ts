import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { syncFromZernioConfig } from '@/lib/social';
import { gatherOperatingMetrics } from '@/lib/analytics-refresh';
import { latestEmails, unreadCounts } from '@/lib/connectors/email';
import { recentMessages } from '@/lib/connectors/slack';
import { recentChats } from '@/lib/connectors/whatsapp';
import { fetchBrandDeals } from '@/lib/connectors/brand-deals';
import { recordOperatingSnapshots } from '@/lib/operating-metrics';
import { warmBrainConstellation } from '@/lib/brain-constellation';

export const dynamic = 'force-dynamic';

/**
 * The analytics heartbeat. POST-only on purpose: the launchd cron
 * (ai.founderos.analytics-refresh, every 15 min — scripts/
 * install-analytics-cron.sh) curls this so metric + social history keeps
 * accruing even when nobody opens the app. Pulls every live connector,
 * snapshots the values that exist, skips honest-pending nulls.
 */
export async function POST() {
  const db = getDb();
  try {
    syncFromZernioConfig(db);
  } catch {
    // social sync degrading must not block the metric sweep
  }
  // Warm the comms caches here rather than making a person wait for them.
  // /comms cold-renders in ~18s (four IMAP round trips plus a Slack scan);
  // this job absorbs that so page views stay under a second.
  await Promise.allSettled([latestEmails(40), unreadCounts(), recentMessages(30), recentChats(40), fetchBrandDeals()]);

  // Same principle for /brain: buildBrainGraph over the whole store+vault is
  // ~9s of real CPU work (roughly 2,000 combined notes). It was
  // already cached, but the cache lived only inside the page component with
  // nothing to warm it — every TTL expiry put that 9s directly in a click.
  // This is synchronous CPU work, not I/O, so it cannot be Promise.allSettled'd
  // alongside the connector calls above without blocking them anyway; running
  // it after they've already been fired keeps this sweep's own shape honest
  // about where the time actually goes. Never throws by construction, but the
  // sweep must survive regardless if the store ever changes that.
  try {
    warmBrainConstellation();
  } catch {
    // an unwarmed cache just means the next /brain click pays the cost itself
  }

  const { inputs } = await gatherOperatingMetrics(db);
  const at = new Date().toISOString();
  const recorded = recordOperatingSnapshots(db.metricSnapshots, inputs, at);
  return NextResponse.json({ ok: true, recorded, of: inputs.length, at });
}
