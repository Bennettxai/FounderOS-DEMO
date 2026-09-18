import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { TradeAnalysisSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

/** Agent-fed ingest: one run's reasoning — what it examined and why it did or
 *  did not trade (behind the application auth boundary). Idempotent on `id`. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = TradeAnalysisSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues }, { status: 400 });
  }
  getDb().trading.recordAnalysis(parsed.data);
  return NextResponse.json({ ok: true, id: parsed.data.id, rows: parsed.data.rows.length });
}
