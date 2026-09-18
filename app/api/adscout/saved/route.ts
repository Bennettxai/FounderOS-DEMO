import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSavedAds, saveAd, unsaveAd } from '@/lib/foreplay/saved';
import type { WallAd } from '@/lib/foreplay/wall';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Saved ads: the swipe file. GET lists, POST saves a WallAd snapshot,
 *  DELETE unsaves by ad id. */

export async function GET() {
  return NextResponse.json({ ok: true, saved: readSavedAds() });
}

const WallAdShape = z.object({
  id: z.string().min(1),
  brand: z.string(),
  brandId: z.string().nullable(),
  thumbnail: z.string().nullable(),
  video: z.string().nullable(),
  image: z.string().nullable(),
  format: z.string().nullable(),
  live: z.boolean(),
  daysRunning: z.number(),
  hook: z.string().nullable(),
  hookSource: z.enum(['spoken', 'text']).nullable(),
  transcript: z.array(z.object({ t: z.number(), s: z.string() })),
  drivers: z.record(z.string(), z.number()),
  ctaType: z.string().nullable(),
  linkUrl: z.string().nullable(),
});

export async function POST(request: Request) {
  const parsed = WallAdShape.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'a full ad snapshot is required' }, { status: 400 });
  return NextResponse.json({ ok: true, saved: saveAd(parsed.data as WallAd) });
}

const RemoveSchema = z.object({ adId: z.string().min(1) });

export async function DELETE(request: Request) {
  const parsed = RemoveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'adId required' }, { status: 400 });
  return NextResponse.json({ ok: true, saved: unsaveAd(parsed.data.adId) });
}
