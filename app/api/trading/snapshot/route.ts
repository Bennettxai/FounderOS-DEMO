import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/data';
import { TradingAccountSnapshotSchema, TradingPositionSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

/** Agent-fed ingest: the trading agent pushes the current account snapshot plus
 *  its positions here behind the application auth boundary. Positions are
 *  capped so one payload can't balloon the DB. */
const BodySchema = z.object({
  snapshot: TradingAccountSnapshotSchema,
  positions: z.array(TradingPositionSchema).max(200).default([]),
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
  const db = getDb();
  db.trading.recordSnapshot(parsed.data.snapshot, parsed.data.positions);
  // The first real push retires the demo: seeded rows would otherwise sit in
  // front of the live series and draw a fake cliff on the sleeve graph.
  const evicted = parsed.data.snapshot.source === 'seed' ? null : db.trading.evictSeeded();
  return NextResponse.json({ ok: true, positions: parsed.data.positions.length, evicted });
}
