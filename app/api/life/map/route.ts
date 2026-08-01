import { NextResponse } from 'next/server';
import { buildLifeMap } from '@/lib/life-map';
import { LifeMapSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(LifeMapSchema.parse(buildLifeMap()));
}
