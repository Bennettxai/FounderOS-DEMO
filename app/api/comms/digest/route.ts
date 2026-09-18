import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { runAndStoreCommsDigest } from '@/lib/comms-digest-run';
import type { DigestRunResult } from '@/lib/comms-digest-run';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The morning comms report. GET returns the stored one (the 9am cron writes
 * it, so opening /comms is instant rather than re-scraping six connectors);
 * POST regenerates on demand for the "run now" button.
 */
export async function GET() {
  const row = getDb().commsDigests.latest();
  if (!row) return NextResponse.json({ digest: null, sources: [], generatedAt: null });
  try {
    const parsed = JSON.parse(row.payload) as DigestRunResult;
    return NextResponse.json({ ...parsed, generatedAt: row.generatedAt });
  } catch {
    return NextResponse.json({ digest: null, sources: [], generatedAt: row.generatedAt });
  }
}

export async function POST() {
  try {
    const result = await runAndStoreCommsDigest();
    return NextResponse.json({ ...result, generatedAt: result.digest.generatedAt });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
