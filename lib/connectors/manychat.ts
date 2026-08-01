import type { ConnectorStatus } from '@/lib/connectors/types';

// ManyChat (Instagram DM automation). Real-ready: honest `not_configured` until
// a key lands, live account handle once it does. One GET to /fb/page/getInfo per
// check — ManyChat's rate limit is punishing (overuse blocks all requests for
// 24h), so we cache aggressively like the Beehiiv connector.
//
// NOTE: ManyChat's API cannot list DMs/conversations. The live DM inbox on
// /social is fed by webhooks (ManyChat "External Request" → /api/webhooks/
// manychat), not by polling this connector.

const MANYCHAT_API = 'https://api.manychat.com';
const TTL_MS = 60_000;

export type ManyChatPageInfo = { name: string; username: string | null; isPro: boolean };

/** Map a `GET /fb/page/getInfo` payload to the fields we surface. Null when no
    usable name is present. */
export function parseManyChatPageInfo(raw: unknown): ManyChatPageInfo | null {
  const data = (raw as { data?: Record<string, unknown> } | null)?.data ?? (raw as Record<string, unknown> | null);
  const name = data?.name;
  if (typeof name !== 'string' || name.length === 0) return null;
  const username = typeof data?.username === 'string' && data.username.length > 0 ? data.username : null;
  return { name, username, isPro: data?.is_pro === true };
}

export type ManyChatSendResult = { ok: boolean; detail: string };

/** Send a plain text DM to a subscriber via ManyChat sendContent. Honest: never
    claims success without a real 2xx, and refuses (ok:false) when unconfigured —
    the /social reply box surfaces `detail` inline. */
export async function sendManyChatText(
  subscriberId: string,
  text: string,
  env: Record<string, string | undefined> = process.env,
  doFetch: typeof fetch = fetch,
): Promise<ManyChatSendResult> {
  const key = env.MANYCHAT_API_KEY;
  if (!key) return { ok: false, detail: 'MANYCHAT_API_KEY not set — connect ManyChat to send DMs.' };
  try {
    const res = await doFetch(`${MANYCHAT_API}/fb/sending/sendContent`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        subscriber_id: subscriberId,
        data: { version: 'v2', content: { type: 'instagram', messages: [{ type: 'text', text }] } },
        message_tag: 'ACCOUNT_UPDATE',
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, detail: 'sent' };
  } catch (err) {
    return { ok: false, detail: `ManyChat send failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

let cache: { at: number; key: string; state: ConnectorStatus['state']; detail: string } | null = null;

const base = { id: 'manychat', name: 'ManyChat (IG DMs)', kind: 'social' as const };

export async function manychatStatus(
  env: Record<string, string | undefined> = process.env,
  doFetch: typeof fetch = fetch,
): Promise<ConnectorStatus> {
  const key = env.MANYCHAT_API_KEY;
  if (!key) {
    return {
      ...base,
      state: 'not_configured',
      detail: 'Set MANYCHAT_API_KEY in .env.local (ManyChat → Settings → API).',
    };
  }
  const now = Date.now();
  if (cache && cache.key === key && now - cache.at < TTL_MS) {
    return { ...base, state: cache.state, detail: cache.detail };
  }
  try {
    const res = await doFetch(`${MANYCHAT_API}/fb/page/getInfo`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const page = parseManyChatPageInfo(await res.json());
    if (!page) throw new Error('no account info in response');
    const handle = page.username ? `@${page.username}` : page.name;
    const detail = `${handle} · Instagram${page.isPro ? ' · Pro' : ''}`;
    cache = { at: now, key, state: 'connected', detail };
    return { ...base, state: 'connected', detail, meta: { handle } };
  } catch (err) {
    const detail = `Key set but API check failed: ${err instanceof Error ? err.message : String(err)}`;
    cache = { at: now, key, state: 'error', detail };
    return { ...base, state: 'error', detail };
  }
}
