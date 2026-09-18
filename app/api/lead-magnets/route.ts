import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/data';
import { LeadMagnetStatusSchema } from '@/lib/schemas';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * The lead magnet register. GET lists every page we ship; POST adds one from
 * inside the OS (a content pipeline can post here after it deploys a page, and
 * the /content/lead-magnets form posts here by hand).
 *
 * Rows created here are stamped origin 'os' by the repo, so re-seeding the
 * database can never delete them.
 */
const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url(),
  offer: z.string().max(400).default(''),
  status: LeadMagnetStatusSchema.default('live'),
  captures: z.enum(['email', 'booking', 'none']).default('email'),
  destination: z.string().max(200).default(''),
  source: z.string().max(300).default(''),
  launchedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'launchedAt must be YYYY-MM-DD')
    .optional(),
  notes: z.string().max(2000).default(''),
});

/** "The Operator Teardown" -> "the-operator-teardown" */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

export async function GET() {
  return NextResponse.json({ leadMagnets: getDb().leadMagnets.all() });
}

export async function POST(req: Request) {
  const gate = requireSession(req);
  if (gate) return gate;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const db = getDb();

  const base = slugify(input.name) || 'lead-magnet';
  const taken = new Set(db.leadMagnets.all().map((m) => m.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;

  const row = {
    ...input,
    id,
    launchedAt: input.launchedAt ?? new Date().toISOString().slice(0, 10),
    origin: 'os' as const,
  };
  db.leadMagnets.insert(row);
  return NextResponse.json({ leadMagnet: row }, { status: 201 });
}
