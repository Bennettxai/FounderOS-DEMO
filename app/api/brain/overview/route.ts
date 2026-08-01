import { NextResponse } from 'next/server';
import { createGBrainProvider } from '@/lib/connectors/gbrain';
import { BrainOverviewSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function GET() {
  const overview = await createGBrainProvider().overview();
  return NextResponse.json(BrainOverviewSchema.parse(overview));
}
