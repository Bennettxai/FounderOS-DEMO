import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { groupRoadmapByQuarter } from '@/lib/roadmap';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  return NextResponse.json({ quarters: groupRoadmapByQuarter(db.roadmap.all()) });
}
