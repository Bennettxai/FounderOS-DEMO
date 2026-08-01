import { NextResponse } from 'next/server';
import { VENTURES } from '@/lib/ventures';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ventures: VENTURES });
}
