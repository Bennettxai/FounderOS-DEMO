import { NextResponse } from 'next/server';
import { getBrandDeals } from '@/lib/brand-deals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getBrandDeals());
}
