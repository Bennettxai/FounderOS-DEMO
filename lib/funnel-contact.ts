/**
 * Contact layer for the funnel — ties a lead to the last message exchanged
 * with them across the OS comms feed (Gmail IMAP + WhatsApp today). Pure
 * matching; the page feeds it gatherCommsFeed() and renders honestly when
 * nothing matches. This is also the seam the future outreach agents read
 * before sending (know the last touch before writing the next one).
 */
import type { CommsItem } from '@/lib/comms';

const MIN_NAME_MATCH = 5; // "Sam" must never hijack "Samantha Corp Billing"

/**
 * Newest comms item that plausibly belongs to this lead: exact email match on
 * replyTo/sender first-class, else the lead's full name appearing in the
 * sender or title. Null when nothing matches — no guessing.
 */
export function lastMessageFor(
  lead: { name: string; email: string | null },
  items: CommsItem[],
): CommsItem | null {
  const email = lead.email?.trim().toLowerCase() ?? null;
  const name = lead.name.trim().toLowerCase();
  const nameUsable = name.length >= MIN_NAME_MATCH;

  const matches = items.filter((i) => {
    const replyTo = i.replyTo?.trim().toLowerCase();
    const sender = i.sender?.trim().toLowerCase() ?? '';
    const title = i.title?.trim().toLowerCase() ?? '';
    if (email && (replyTo === email || sender === email)) return true;
    if (nameUsable && (sender.includes(name) || title.includes(name))) return true;
    return false;
  });

  if (matches.length === 0) return null;
  return matches.reduce((newest, i) => (Date.parse(i.ts) > Date.parse(newest.ts) ? i : newest));
}
