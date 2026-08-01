import type { ContactTag } from '@/lib/schemas';

export type CommsSource = 'email' | 'whatsapp' | 'slack';

export type CommsItem = {
  source: CommsSource;
  title: string;
  preview: string;
  ts: string; // ISO timestamp
  unread?: number;
  sender?: string; // the person/chat behind the message — priority matching key
  replyTo?: string; // email address or slack channel name for replies
  account?: string; // originating connector account (e.g. inbox-1) — reply-from
  priority?: 1 | 2 | 3; // stamped from contact_tags (1 red · 2 yellow · 3 green)
};

/** How many feed messages arrived within the trailing 24 hours of `now`. */
export function inboundLast24h(items: CommsItem[], now: Date = new Date()): number {
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  return items.filter((i) => {
    const t = Date.parse(i.ts);
    return Number.isFinite(t) && t >= cutoff && t <= now.getTime();
  }).length;
}

export function mergeFeed(items: CommsItem[], limit = 50): CommsItem[] {
  return items
    .filter((i) => Number.isFinite(Date.parse(i.ts)))
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .slice(0, limit);
}

/**
 * Stamp each feed item with its contact priority. A tag matches when the
 * tagged person equals the sender, or (for names ≥ 5 chars) appears inside
 * it — so "Acme Brand" matches "ACME Brand Team" but "Max" can't hijack
 * "Maximilian Corp". Lowest tier (highest priority) wins on multi-match.
 */
export function annotatePriorities(items: CommsItem[], tags: ContactTag[]): CommsItem[] {
  if (tags.length === 0) return items;
  return items.map((item) => {
    const hay = (item.sender ?? item.title).toLowerCase().trim();
    let best: number | undefined;
    for (const tag of tags) {
      const person = tag.person.toLowerCase().trim();
      const hit = person === hay || (person.length >= 5 && hay.includes(person));
      if (hit && (best === undefined || tag.tier < best)) best = tag.tier;
    }
    return best === undefined ? item : { ...item, priority: best as 1 | 2 | 3 };
  });
}
