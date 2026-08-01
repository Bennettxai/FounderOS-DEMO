import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  return NextResponse.json({ metrics: db.metrics.all() });
}
