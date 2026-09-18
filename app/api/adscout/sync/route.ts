import { NextResponse } from 'next/server';
import { createForeplayClient } from '@/lib/foreplay/client';
import { runSyncCycle } from '@/lib/foreplay/sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** One real sync cycle over the local watchlist: the Sync now button. */
export async function POST() {
  const client = createForeplayClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: 'Foreplay not configured: set FOREPLAY_API_KEY in .env.local' },
      { status: 503 },
    );
  }
  try {
    const result = await runSyncCycle(client);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'sync failed' }, { status: 502 });
  }
}
