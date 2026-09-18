import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createForeplayClient } from '@/lib/foreplay/client';
import { addWatchDomain, addWatchEntry, readWatchEntries, removeWatchEntry } from '@/lib/foreplay/watchlist';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The local Adscout watchlist: add by domain (one resolve call) or by a
 *  brand id already known from a mine result; remove by id. */

export async function GET() {
  return NextResponse.json({ ok: true, watchlist: readWatchEntries() });
}

const AddSchema = z.union([
  z.object({ domain: z.string().min(3).max(120) }),
  z.object({ brandId: z.string().min(1), name: z.string().min(1), avatar: z.string().nullable().optional() }),
]);

export async function POST(request: Request) {
  const parsed = AddSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'pass a domain, or a brandId + name' }, { status: 400 });
  }
  if ('brandId' in parsed.data) {
    const list = addWatchEntry({ id: parsed.data.brandId, name: parsed.data.name, avatar: parsed.data.avatar ?? null });
    return NextResponse.json({ ok: true, watchlist: list });
  }
  const client = createForeplayClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: 'Foreplay not configured: set FOREPLAY_API_KEY in .env.local' },
      { status: 503 },
    );
  }
  try {
    const entry = await addWatchDomain(client, parsed.data.domain);
    if (!entry) {
      return NextResponse.json({ ok: false, error: `no Foreplay brand found for ${parsed.data.domain}` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, added: entry, watchlist: readWatchEntries() });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'lookup failed' }, { status: 502 });
  }
}

const RemoveSchema = z.object({ brandId: z.string().min(1) });

export async function DELETE(request: Request) {
  const parsed = RemoveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'brandId required' }, { status: 400 });
  return NextResponse.json({ ok: true, watchlist: removeWatchEntry(parsed.data.brandId) });
}
