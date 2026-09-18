import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/data';
import { groupRoadmapByQuarter } from '@/lib/roadmap';
import { RoadmapStatusSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  return NextResponse.json({ quarters: groupRoadmapByQuarter(db.roadmap.all()) });
}

const PatchSchema = z.object({ id: z.string().min(1), status: RoadmapStatusSchema });

/**
 * Mark a roadmap row done from the board (or push it back). The response
 * carries the whole board back so the client can redraw the phase bars and the
 * quarter tallies off one round trip.
 */
export async function PATCH(req: Request) {
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'id and a roadmap status are required' }, { status: 400 });
  }
  const db = getDb();
  const item = db.roadmap.setStatus(parsed.data.id, parsed.data.status);
  if (!item) return NextResponse.json({ error: 'no such roadmap item' }, { status: 404 });
  return NextResponse.json({ item, quarters: groupRoadmapByQuarter(db.roadmap.all()) });
}
