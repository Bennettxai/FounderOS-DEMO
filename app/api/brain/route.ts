import { NextResponse } from 'next/server';
import { getBrainProvider } from '@/lib/brain';

export const dynamic = 'force-dynamic';

/** No query → provider status. `?q=` → hybrid search (gbrain with local fallback). */
// Next requires the first param type be exactly `Request | NextRequest` — an
// optional/defaulted param widens it to `Request | undefined` and fails the build.
export async function GET(request: Request) {
  const provider = getBrainProvider();
  const q = new URL(request.url).searchParams.get('q')?.trim();
  if (q) {
    const results = await provider.search(q);
    return NextResponse.json({ query: q, provider: provider.name, results });
  }
  const status = await provider.status();
  return NextResponse.json(status);
}
