import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { syncFromZernioLive } from '@/lib/social-live';
import { zernioLiveAccounts } from '@/lib/connectors/zernio';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Force a live follower-count sync from Zernio/Late and report what landed.
    POST only: this mutates state, so it must not be reachable via a top-level
    GET (SameSite=Lax would attach the gate cookie to a cross-site GET). */
async function runSync() {
  const db = getDb();
  const accounts = await zernioLiveAccounts();
  const recorded = await syncFromZernioLive(db, { source: async () => accounts });
  return NextResponse.json({
    ok: true,
    recorded,
    syncedAt: new Date().toISOString(),
    source: Object.keys(accounts).length > 0 ? 'zernio-live' : 'config-fallback',
    accounts,
  });
}

export async function POST(req: Request) {
  const gate = requireSession(req);
  if (gate) return gate;
  return runSync();
}
