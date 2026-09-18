import { NextResponse } from 'next/server';
import { READ_RETENTION_DAYS } from '@/lib/comms-digest';
import { z } from 'zod';
import { getDb } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({ key: z.string().min(1).max(400) });

/** GET: which report entries the operator has already cleared. */
export async function GET() {
  return NextResponse.json({ keys: getDb().digestReads.keys() });
}

/** POST: mark one message read. DELETE: put it back (the undo). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'key required' }, { status: 400 });
  const db = getDb();
  db.digestReads.mark(parsed.data.key);
  // keys older than the report window can never match again
  // Must outlive CARRY_MAX_DAYS: an entry now rides along until it is cleared,
  // so dropping its read mark too early would resurrect a message already answered.
  db.digestReads.prune(new Date(Date.now() - READ_RETENTION_DAYS * 86_400_000).toISOString());
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'key required' }, { status: 400 });
  getDb().digestReads.unmark(parsed.data.key);
  return NextResponse.json({ ok: true });
}
