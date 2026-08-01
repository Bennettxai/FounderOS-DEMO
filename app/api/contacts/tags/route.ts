import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/data';
import { CONTACT_TIERS } from '@/lib/life-map';
import { ContactTagSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ tiers: CONTACT_TIERS, tags: getDb().contactTags.all() });
}

export async function POST(request: Request) {
  const parsed = ContactTagSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  getDb().contactTags.upsert(parsed.data);
  return NextResponse.json({ ok: true, tag: parsed.data });
}

const RemoveSchema = z.object({ person: z.string().min(1), channel: z.string().min(1) });

export async function DELETE(request: Request) {
  const parsed = RemoveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  getDb().contactTags.remove(parsed.data.person, parsed.data.channel);
  return NextResponse.json({ ok: true });
}
