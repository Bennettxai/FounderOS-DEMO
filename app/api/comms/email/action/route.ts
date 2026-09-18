import { NextResponse } from 'next/server';
import { z } from 'zod';
import { updateEmailThread } from '@/lib/connectors/email';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ActionSchema = z.object({
  account: z.string().min(1).max(80),
  threadId: z.string().min(1).max(500),
  uid: z.number().int().positive().optional(),
  action: z.enum(['archive', 'trash', 'read', 'unread', 'star', 'unstar']),
});

export async function POST(request: Request) {
  const gate = requireSession(request);
  if (gate) return gate;

  const parsed = ActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { account, ...operation } = parsed.data;
  const result = await updateEmailThread({ accountId: account, ...operation });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, ...result.value });
}
