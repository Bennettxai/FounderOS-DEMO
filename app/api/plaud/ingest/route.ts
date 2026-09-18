import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { ingestPlaudNow } from '@/lib/plaud-ingest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Plaud → knowledge base, on demand. GET lists what has been filed; POST runs
 * one ingest pass (the same pass the Sales Calls Data agent and its 30-minute
 * cron run). Pure code, no LLM: Plaud's transcript + AI note are filed as-is.
 */
export async function GET() {
  const rows = getDb().plaudIngests.all();
  return NextResponse.json({ ingested: rows.length, rows }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST() {
  const result = await ingestPlaudNow(getDb());
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
