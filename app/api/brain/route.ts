import { NextResponse } from 'next/server';
import { getBrainProvider } from '@/lib/brain';
import { retrieveBrain } from '@/lib/brain-retrieval';

export const dynamic = 'force-dynamic';

/**
 * No query → provider status. `?q=` → a read through the retrieval hub: a wide
 * pool from the provider, reranked down to the few that answer the question.
 * `ranked` tells the caller whether a cross-encoder ordered these or whether
 * they are in the provider's own (uncalibrated) order.
 */
// Next requires the first param type be exactly `Request | NextRequest` — an
// optional/defaulted param widens it to `Request | undefined` and fails the build.
export async function GET(request: Request) {
  const provider = getBrainProvider();
  const q = new URL(request.url).searchParams.get('q')?.trim();
  if (q) {
    const { hits, ranked } = await retrieveBrain(provider, q);
    return NextResponse.json({ query: q, provider: provider.name, ranked, results: hits });
  }
  const status = await provider.status();
  return NextResponse.json(status);
}
