/**
 * Live business-pulse metrics for /api/metrics.
 *
 * These four numbers used to come straight out of `lib/seed.ts` as literal
 * zeros, captioned "pending creds" — captions that were themselves false, since
 * every one of the four creds works. No component reads this endpoint, so
 * nothing looked broken; the real consumer is the agent harness, whose standing
 * instructions say "quote real numbers from these APIs instead of guessing".
 * An agent obeying that reported Stripe $0 / unread 0 / brain 0 to the operator as
 * fact. This module exists to make that impossible.
 *
 * The contract, and the whole point of the file:
 *
 *   value === null  ⇒  we could not read it. `period` says why.
 *   value === 0     ⇒  we read it, and it really is zero.
 *
 * A failed read must never look like a measurement. That is why nothing here
 * falls back to a default, and why every source is guarded independently — one
 * dead connector degrades one tile rather than the endpoint.
 *
 * Shares the honest-pending vocabulary of `lib/operating-metrics.ts` (the
 * Analytics strip's `MetricInput`), so a tile can move between the two without
 * translation. It does NOT borrow that module's positive-values-only rule for
 * liveness: on the Analytics strip a zero is indistinguishable from an empty
 * tile and is fine to hide, but here a genuine "0 unread" is a real answer to a
 * question an agent asked, and collapsing it into "pending" would be the same
 * class of lie in the other direction.
 */

import type { MetricInput } from '@/lib/operating-metrics';
import { getDb } from '@/lib/data';
import { getBrainProvider } from '@/lib/brain';
import { parseInboxConfigs, unreadCounts } from '@/lib/connectors/email';
import { stripeSnapshot } from '@/lib/connectors/payments';
import type { GBrainProvider } from '@/lib/connectors/gbrain';

export type LiveMetric = MetricInput & {
  key: string;
  value: number | null;
  live: boolean;
};

/** A read either produces a number or explains itself. Never both, never neither. */
type Read = { value: number; source: string } | { value: null; source: string };

const failed = (source: string): Read => ({ value: null, source });
const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Every source here is a network or subprocess call, and this endpoint is on
 * the agent hot path. A hung IMAP socket or a slow Stripe leg must degrade its
 * own tile rather than stall the response, so each read is capped and a timeout
 * reads as "not read" — which the null contract already models correctly.
 */
const READ_TIMEOUT_MS = 8_000;

async function guarded(label: string, read: () => Promise<Read>): Promise<Read> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<Read>((resolve) => {
        timer = setTimeout(() => resolve(failed(`${label} timed out after ${READ_TIMEOUT_MS / 1000}s`)), READ_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    return failed(`${label} failed: ${reason(err)}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Unread across every configured IMAP inbox. Served from the shared 20-minute
 *  email cache, so this is usually free. */
async function readUnread(env: Record<string, string | undefined>): Promise<Read> {
  const inboxes = parseInboxConfigs(env);
  if (inboxes.length === 0) return failed('no inbox configured (set INBOX_n_* in .env.local)');
  const counts = await unreadCounts(env);
  const errors = counts.filter((c) => c.error);
  // Partial failure would undercount silently, and an undercount is exactly the
  // kind of confident-but-wrong number this endpoint is being fixed to stop
  // producing. Report the total, but say what it is missing.
  if (errors.length === counts.length) return failed(`all ${counts.length} inbox connections failed: ${errors[0]?.error}`);
  const total = counts.reduce((sum, c) => sum + c.unread, 0);
  const caption = `${inboxes.length} inbox${inboxes.length > 1 ? 'es' : ''} · IMAP`;
  return { value: total, source: errors.length ? `${caption} · ${errors.length} failing, count is a floor` : caption };
}

/** Stripe available balance, in whole currency units (not cents). */
async function readStripeAvailable(env: Record<string, string | undefined>): Promise<Read> {
  const snapshot = await stripeSnapshot(env);
  const available = snapshot.available[0];
  if (!available) return failed('Stripe returned no available balance bucket');
  return { value: available.amount / 100, source: `Stripe · ${available.currency.toUpperCase()}` };
}

/** Markdown pages in the local brain-store. The stub provider used by tests has
 *  no localStats, so this is duck-typed rather than assumed. */
async function readBrainPages(): Promise<Read> {
  const provider = getBrainProvider() as Partial<GBrainProvider>;
  if (typeof provider.localStats !== 'function') return failed(`brain provider "${getBrainProvider().name}" reports no page count`);
  const stats = await provider.localStats();
  return { value: stats.markdownFiles, source: 'brain-store · local pages' };
}

/**
 * Runs in this app's own agent runtime — not the Paperclip board's agent count,
 * which is a different number that has been mistaken for this one.
 *
 * Seeded demo runs are excluded. lib/seed.ts writes 5–14 fabricated runs per
 * agent so /agents looks alive on a fresh clone (~300 rows), and counting those
 * here would replace a seeded zero with a seeded three hundred.
 */
function readAgentRuns(): Read {
  return { value: getDb().agentRuns.countReal(), source: 'agent runtime · all time, excludes seeded demo runs' };
}

const asMetric = (
  id: string,
  key: string,
  label: string,
  unit: string,
  read: Read,
): LiveMetric => ({
  id,
  key,
  label,
  unit,
  value: read.value,
  source: read.source,
  live: read.value !== null,
});

/**
 * One live sweep. Reads run concurrently and independently: the slowest source
 * bounds the response, and no source can take another one down with it.
 */
export async function liveMetrics(
  env: Record<string, string | undefined> = process.env,
): Promise<LiveMetric[]> {
  const [unread, stripe, brain, runs] = await Promise.all([
    guarded('inbox read', () => readUnread(env)),
    guarded('Stripe balance read', () => readStripeAvailable(env)),
    guarded('brain-store read', () => readBrainPages()),
    guarded('agent run count', async () => readAgentRuns()),
  ]);
  return [
    asMetric('metric-unread', 'unread_total', 'Unread (all inboxes)', 'emails', unread),
    asMetric('metric-brain', 'brain_pages', 'Brain-store Pages', 'pages', brain),
    asMetric('metric-balance', 'stripe_available', 'Stripe Available', 'usd', stripe),
    asMetric('metric-runs', 'agent_runs', 'Agent Runs Logged', 'runs', runs),
  ];
}
