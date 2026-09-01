import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getDb } from '@/lib/data';
import { parseManyChatWebhook } from '@/lib/connectors/manychat-webhook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // node:crypto + better-sqlite3

/** Constant-time string compare (guards against timing oracles on the secret). */
function secretsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * ManyChat "External Request" ingest. ManyChat's API can't be polled for DMs,
 * so this push endpoint is how the /social Instagram DM inbox goes live: point a
 * ManyChat automation's External Request (POST) at this URL with a JSON body
 * carrying the contact + message. Each message upserts by id, so replays don't
 * duplicate.
 *
 * MANYCHAT_WEBHOOK_SECRET is REQUIRED: without it the endpoint is disabled
 * (503) rather than accepting unsigned POSTs. Every request must carry a
 * matching `x-manychat-secret` header (add it in the ManyChat External Request
 * headers), compared in constant time.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.MANYCHAT_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: 'webhook secret not configured' }, { status: 503 });
  }
  if (!secretsMatch(request.headers.get('x-manychat-secret') ?? '', secret)) {
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

/** Lightweight health check. Reports only whether the endpoint is secured —
 *  never the stored message count (that leaked inbox volume to any caller). */
export async function GET(): Promise<Response> {
  const secret = process.env.MANYCHAT_WEBHOOK_SECRET?.trim();
  return NextResponse.json({
    ok: true,
    endpoint: 'manychat-webhook',
    secured: Boolean(secret),
  });
}
