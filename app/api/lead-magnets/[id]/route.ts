import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/data';
import { LeadMagnetStatusSchema } from '@/lib/schemas';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * One lead magnet. PATCH edits it (retire a page, fix a typo, repoint a URL
 * after a custom domain lands); DELETE drops it. Both 404 honestly when the id
 * is not there rather than reporting a success that did nothing.
 */
const PatchSchema = z
  .object({
    name: z.string().min(1).max(120),
    url: z.string().url(),
    offer: z.string().max(400),
    status: LeadMagnetStatusSchema,
    captures: z.enum(['email', 'booking', 'none']),
    destination: z.string().max(200),
    source: z.string().max(300),
    launchedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'launchedAt must be YYYY-MM-DD'),
    notes: z.string().max(2000),
  })
  .partial();

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = requireSession(req);
  if (gate) return gate;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const db = getDb();
  const existing = db.leadMagnets.byId(params.id);
  if (!existing) return NextResponse.json({ error: 'lead magnet not found' }, { status: 404 });

  // id and origin are not editable: the id is referenced by whatever links to
  // it, and origin is what protects an OS-made row from the seed.
  const updated = { ...existing, ...parsed.data, id: existing.id, origin: existing.origin };
  db.leadMagnets.insert(updated);
  return NextResponse.json({ leadMagnet: updated });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const gate = requireSession(req);
  if (gate) return gate;

  const removed = getDb().leadMagnets.remove(params.id);
  if (!removed) return NextResponse.json({ error: 'lead magnet not found' }, { status: 404 });
  return NextResponse.json({ ok: true, id: params.id });
}
