import type { ConnectorStatus } from '@/lib/connectors/types';

// Beehiiv newsletter audience. Real-ready: honest `not_configured` until a key
// lands, live subscriber count once it does. Same cache+timeout discipline as
// the Zernio connector.

const BEEHIIV_API = 'https://api.beehiiv.com/v2';
const TTL_MS = 60_000;

/** Map a Beehiiv `publications/{id}?expand[]=stats` payload to a subscriber
    count. Prefers active subscriptions; null when no usable number is present. */
export function parseBeehiivStats(raw: unknown): { subscribers: number } | null {
  const r = (raw ?? {}) as Record<string, any>;
  const stats = r?.data?.stats ?? r?.stats;
  const n = stats?.active_subscriptions ?? stats?.total_subscriptions;
  if (typeof n === 'number' && Number.isFinite(n) && n >= 0) return { subscribers: n };
  return null;
}

function endpoint(pub: string): string {
  return `${BEEHIIV_API}/publications/${pub}?expand[]=stats`;
}

let cache: { at: number; data: number | null } | null = null;

/** Live subscriber count, 60s-cached; null when unconfigured or on error so
    callers fall back to seeded history (never a fake number). */
export async function beehiivSubscribers(
  env: Record<string, string | undefined> = process.env,
): Promise<number | null> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.data;
  const key = env.BEEHIIV_API_KEY;
  const pub = env.BEEHIIV_PUBLICATION_ID;
  if (!key || !pub) return null;
  try {
    const res = await fetch(endpoint(pub), {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parseBeehiivStats(await res.json());
    cache = { at: now, data: parsed?.subscribers ?? null };
    return cache.data;
  } catch {
    return cache?.data ?? null;
  }
}

export async function beehiivStatus(
  env: Record<string, string | undefined> = process.env,
): Promise<ConnectorStatus> {
  const key = env.BEEHIIV_API_KEY;
  const pub = env.BEEHIIV_PUBLICATION_ID;
  if (!key || !pub) {
    return {
      id: 'beehiiv',
      name: 'Beehiiv (Email List)',
      kind: 'social',
      state: 'not_configured',
      detail: 'Set BEEHIIV_API_KEY + BEEHIIV_PUBLICATION_ID in .env.local.',
    };
  }
  try {
    const res = await fetch(endpoint(pub), {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parseBeehiivStats(await res.json());
    if (!parsed) throw new Error('no subscriber stats in response');
    return {
      id: 'beehiiv',
      name: 'Beehiiv (Email List)',
      kind: 'social',
      state: 'connected',
      detail: `${parsed.subscribers.toLocaleString('en-US')} subscribers`,
      meta: { subscribers: parsed.subscribers },
    };
  } catch (err) {
    return {
      id: 'beehiiv',
      name: 'Beehiiv (Email List)',
      kind: 'social',
      state: 'error',
      detail: `Key set but API check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Newsletters (posts + per-post analytics) ───────────────────────────────

/** One past newsletter with its send analytics. Derived, display-ready. */
export type Newsletter = {
  id: string;
  title: string;
  publishedAt: string; // ISO
  webUrl: string | null;
  recipients: number;
  delivered: number;
  deliveryRate: number; // %
  opens: number; // unique opens
  openRate: number; // %
  clicks: number; // unique clicks
  clickRate: number; // %
  unsubscribes: number;
  unsubscribeRate: number; // %
  spamReports: number;
  webViews: number;
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const SENT_STATUSES = new Set(['confirmed', 'published']);

/**
 * Map a Beehiiv posts+stats payload to Newsletter[]. Handles the REST shape
 * (`recipients`/`unique_opens`/`open_rate`/`unsubscribes`/`spam_reports`,
 * `publish_date` unix seconds) with aliases for the MCP shape (`total_sent`
 * etc.). Keeps only sent posts. Never throws — bad input yields [].
 */
export function parseBeehiivPosts(raw: unknown): Newsletter[] {
  const rows = (raw as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(rows)) return [];
  const out: Newsletter[] = [];
  for (const row of rows) {
    const p = (row ?? {}) as Record<string, any>;
    if (!p.id || !SENT_STATUSES.has(String(p.status))) continue;
    const e = (p.stats?.email ?? {}) as Record<string, any>;
    const web = (p.stats?.web ?? {}) as Record<string, any>;
    const recipients = num(e.recipients ?? e.total_sent);
    const delivered = num(e.delivered ?? e.total_delivered);
    const opens = num(e.unique_opens ?? e.total_unique_opened);
    const clicks = num(e.unique_clicks ?? e.total_unique_email_clicked_verified ?? e.total_unique_email_clicked_raw);
    const unsubscribes = num(e.unsubscribes ?? e.total_unsubscribes);
    const ts = p.publish_date ?? p.displayed_date;
    const publishedAt =
      typeof ts === 'number' ? new Date(ts * 1000).toISOString() : new Date(ts ?? p.created ?? Date.now()).toISOString();
    out.push({
      id: String(p.id),
      title: String(p.title ?? 'Untitled'),
      publishedAt,
      webUrl: typeof p.web_url === 'string' ? p.web_url : null,
      recipients,
      delivered,
      deliveryRate: recipients > 0 ? round2((delivered / recipients) * 100) : 0,
      opens,
      openRate: round2(num(e.open_rate)),
      clicks,
      clickRate: round2(num(e.click_rate)),
      unsubscribes,
      unsubscribeRate: delivered > 0 ? round2((unsubscribes / delivered) * 100) : 0,
      spamReports: num(e.spam_reports ?? e.total_spam_reported),
      webViews: num(web.views ?? web.total_web_viewed),
    });
  }
  return out;
}

let postsCache: { at: number; data: Newsletter[] | null } | null = null;

/** Live newsletters (posts + stats), 60s-cached; null when unconfigured or on
    error so callers fall back to the seed. */
export async function beehiivPosts(
  env: Record<string, string | undefined> = process.env,
): Promise<Newsletter[] | null> {
  const now = Date.now();
  if (postsCache && now - postsCache.at < TTL_MS) return postsCache.data;
  const key = env.BEEHIIV_API_KEY;
  const pub = env.BEEHIIV_PUBLICATION_ID;
  if (!key || !pub) return null;
  try {
    const url = `${BEEHIIV_API}/publications/${pub}/posts?expand[]=stats&limit=50&order_by=publish_date&direction=desc`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = parseBeehiivPosts(await res.json());
    postsCache = { at: now, data: list.length > 0 ? list : null };
    return postsCache.data;
  } catch {
    return postsCache?.data ?? null;
  }
}
