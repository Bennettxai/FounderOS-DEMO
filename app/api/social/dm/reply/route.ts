import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/data';
import { sendManyChatText } from '@/lib/connectors/manychat';
import type { SocialDmMessage } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

const ReplySchema = z.object({
  subscriberId: z.string().min(1),
  text: z.string().min(1).max(2000),
});

/**
 * Answer an Instagram DM from the /social inbox. Sends for real via ManyChat
 * (sendContent). Only on a real 2xx do we store the outbound message — a failed
 * or unconfigured send returns 502 and stores nothing, so the inbox never shows
 * a reply that didn't actually go out.
 */
export async function POST(request: Request): Promise<Response> {
  const parsed = ReplySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }
  const { subscriberId, text } = parsed.data;

  const result = await sendManyChatText(subscriberId, text);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.detail }, { status: 502 });
  }

  const db = getDb();
  // Carry the display name/handle from the existing thread so the stored
  // outbound message renders consistently.
  const prior = db.social.dmMessages('instagram').find((m) => m.subscriberId === subscriberId);
  const ts = new Date().toISOString();
  const message: SocialDmMessage = {
    id: `mc-out-${subscriberId}-${ts}`,
    platform: 'instagram',
    subscriberId,
    name: prior?.name ?? subscriberId,
    handle: prior?.handle ?? null,
    text,
    direction: 'out',
    tag: null,
    ts,
    source: 'manychat',
  };
  db.social.upsertDmMessage(message);

  return NextResponse.json({ ok: true, message });
}
