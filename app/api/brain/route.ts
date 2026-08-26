import { NextResponse } from 'next/server';
import { getBrainProvider } from '@/lib/brain';

export const dynamic = 'force-dynamic';

/** No query → provider status. `?q=` → hybrid search (gbrain with local fallback).
 *  `?sources=` (comma-separated source ids) narrows the search to those
 *  brain sources — the nikos provider honors it; gbrain/stub ignore it.
 *  Next requires the first param type be exactly `Request | NextRequest` — an
 *  optional/defaulted param widens it to `Request | undefined` and fails the build.
 */
export async function GET(request: Request) {
  const provider = getBrainProvider();
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  if (q) {
    const sources = (url.searchParams.get('sources') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const results = await provider.search(q, { sources: sources.length ? sources : undefined });
    return NextResponse.json({
      query: q,
      provider: provider.name,
      sources: sources.length ? sources : undefined,
      results,
    });
  }
  const status = await provider.status();
  return NextResponse.json(status);
}
