import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { parseManyChatWebhook } from '@/lib/connectors/manychat-webhook';

export const dynamic = 'force-dynamic';

/**
 * ManyChat "External Request" ingest. ManyChat's API can't be polled for DMs,
 * so this push endpoint is how the /social Instagram DM inbox goes live: point a
 * ManyChat automation's External Request (POST) at this URL with a JSON body
 * carrying the contact + message. Each message upserts by id, so replays don't
 * duplicate.
 *
 * If MANYCHAT_WEBHOOK_SECRET is set, the request must carry a matching
 * `x-manychat-secret` header (add it in the ManyChat External Request headers).
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.MANYCHAT_WEBHOOK_SECRET;
  if (secret && request.headers.get('x-manychat-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const raw = await request.json().catch(() => null);
  const message = parseManyChatWebhook(raw);
  if (!message) {
    return NextResponse.json({ error: 'payload missing a subscriber id' }, { status: 400 });
  }

  getDb().social.upsertDmMessage(message);
  return NextResponse.json({ ok: true, id: message.id, subscriberId: message.subscriberId });
}

/** Lightweight health check: how many DMs are stored. */
export async function GET(): Promise<Response> {
  const secret = process.env.MANYCHAT_WEBHOOK_SECRET;
  return NextResponse.json({
    ok: true,
    endpoint: 'manychat-webhook',
    secured: Boolean(secret),
    stored: getDb().social.dmMessages('instagram').length,
  });
}
