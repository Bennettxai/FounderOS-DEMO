import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/data';
import { BrandDealOutcomeSchema } from '@/lib/schemas';
import { getBrandDeals, invalidateBrandDealsCache } from '@/lib/brand-deals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  dealId: z.string().min(1),
  outcome: BrandDealOutcomeSchema.optional(),
  amountUsd: z.number().int().positive().nullable().optional(),
});

/** Set a deal's outcome (won/lost/open) and/or its quoted amount. GladOS
 *  tracking overlay only — never touches bdpilot state, never emails. */
export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 });
  }
  if (body.outcome === undefined && body.amountUsd === undefined) {
    return NextResponse.json({ ok: false, error: 'nothing to set' }, { status: 400 });
  }
  const db = getDb();
  const existing = db.brandDeals.get(body.dealId);
  db.brandDeals.upsert({
    dealId: body.dealId,
    outcome: body.outcome ?? existing?.outcome ?? 'open',
    amountUsd: body.amountUsd !== undefined ? body.amountUsd : (existing?.amountUsd ?? null),
    updatedAt: new Date().toISOString(),
  });
  invalidateBrandDealsCache();
  return NextResponse.json({ ok: true, snapshot: await getBrandDeals() });
}
