import { NextResponse } from 'next/server';
import { gatherCommsFeed } from '@/lib/comms-feed';
import { lastMessageFor } from '@/lib/funnel-contact';

export const dynamic = 'force-dynamic';

/** The comms feed walks live IMAP — cap it so a pinned dossier never hangs. */
const FEED_BUDGET_MS = 4000;

/**
 * Last message exchanged with one lead — fetched when a dossier card pins.
 * Honest on every path: `message: null` = no thread on record,
 * `unavailable: true` = the comms feed itself couldn't answer in time.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name')?.trim();
  const email = url.searchParams.get('email')?.trim() || null;
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const feed = await Promise.race([
    gatherCommsFeed(200).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), FEED_BUDGET_MS)),
  ]);
  if (!feed) {
    return NextResponse.json({ message: null, unavailable: true });
  }
  return NextResponse.json({ message: lastMessageFor({ name, email }, feed), unavailable: false });
}
