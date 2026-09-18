import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { TradeActivitySchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

/** Agent-fed ingest: the trading agent logs one trade/decision here (private network,
 *  behind the application auth boundary). Idempotent on `id`. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = TradeActivitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues }, { status: 400 });
  }
  getDb().trading.recordActivity(parsed.data);
  return NextResponse.json({ ok: true, id: parsed.data.id });
}
