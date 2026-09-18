import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/data';
import { TradingOrderSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

/** Agent-fed ingest: the account's live orders at the broker, as a whole set.
 *  Replaces what was there, so filled and cancelled orders drop off — an empty
 *  array is the correct way to say "nothing is working right now". */
const BodySchema = z.object({
  accountId: z.string().min(1),
  orders: z.array(TradingOrderSchema).max(100).default([]),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues }, { status: 400 });
  }
  getDb().trading.recordOpenOrders(parsed.data.accountId, parsed.data.orders);
  return NextResponse.json({ ok: true, open: parsed.data.orders.length });
}
