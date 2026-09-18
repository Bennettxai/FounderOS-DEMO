import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { UsageSnapshotSchema } from '@/lib/usage';

export const dynamic = 'force-dynamic';

/**
 * Another machine reporting its seat. A second host pushes here so this board
 * shows both subscriptions (and vice versa in dev). Whatever arrives is stored
 * as source 'push' regardless of what the sender claimed (provenance is the
 * receiver's fact to assert) and capturedAt tells the reader how old the
 * reading is.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = UsageSnapshotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'invalid snapshot' }, { status: 400 });
  }
  getDb().usageSnapshots.upsert({ ...parsed.data, source: 'push' });
  return NextResponse.json({ ok: true, id: parsed.data.id });
}
