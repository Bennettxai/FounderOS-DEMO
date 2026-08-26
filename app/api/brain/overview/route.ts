import { NextResponse } from 'next/server';
import { getBrainOverview } from '@/lib/brain';
import { BrainOverviewSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Provider-aware: nikos reads the real local corpus (canonical fleet,
  // markdown docs, knowledge graph); otherwise the gbrain CLI doctor.
  const overview = await getBrainOverview();
  return NextResponse.json(BrainOverviewSchema.parse(overview));
}
