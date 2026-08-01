import type { FounderDb } from '@/lib/db';
import { syncSocialSnapshots } from '@/lib/social';
import { zernioAccounts, zernioLiveAccounts } from '@/lib/connectors/zernio';

type FollowerMap = Record<string, { handle?: string; followers?: number }>;

type LiveSyncOpts = {
  today?: string;
  /** Live follower source; defaults to the Zernio/Late `/v1/accounts` fetch. */
  source?: () => Promise<FollowerMap>;
  /** Static fallback when the live API yields nothing; defaults to the on-disk
      Zernio config so the dashboard never blanks out. */
  fallback?: () => FollowerMap;
};

/**
 * Pull live follower counts from Zernio/Late and snapshot them for today.
 * Replaces the old read-time `syncFromZernioConfig`, which only ever copied the
 * stale static numbers out of config.json. If the live API is unreachable or
 * returns nothing, falls back to that static config so the page degrades
 * gracefully instead of going empty. Same-day re-sync overwrites.
 */
export async function syncFromZernioLive(db: FounderDb, opts: LiveSyncOpts = {}): Promise<number> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const source = opts.source ?? zernioLiveAccounts;
  const fallback = opts.fallback ?? zernioAccounts;

  let accounts: FollowerMap = {};
  try {
    accounts = await source();
  } catch {
    accounts = {};
  }
  if (Object.keys(accounts).length === 0) {
    accounts = fallback();
  }
  return syncSocialSnapshots(db, accounts, today);
}
