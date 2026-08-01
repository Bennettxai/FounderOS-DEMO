import { NextResponse } from 'next/server';
import { gatherCommsFeed } from '@/lib/comms-feed';

export const dynamic = 'force-dynamic';

export async function GET() {
  const feed = await gatherCommsFeed();
  return NextResponse.json({ feed });
}
