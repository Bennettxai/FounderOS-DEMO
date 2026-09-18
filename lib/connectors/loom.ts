import { GATED, connected as gatedConnected } from '@/lib/connectors/demo-status';
/**
 * Loom connector — deliberately the honest, limited one.
 *
 * Loom has NO open API. Atlassian's own docs say so: "Loom does not offer a
 * open API at this time." There is no endpoint that lists an account's videos
 * and no key to paste, so a card claiming "Loom account connected" would be a
 * lie. What exists is:
 *   - the public oEmbed endpoint, GET https://www.loom.com/v1/oembed?url=…,
 *     which resolves ANY Loom share link to title/author/thumbnail/duration
 *     with no auth at all;
 *   - the record/embed SDKs, which are browser-side and not a data source.
 *
 * So this connector reports the lane it actually has (link-level metadata) and
 * says plainly that the account-level API does not exist. If Loom ships one,
 * this is where the key goes.
 */
import type { ConnectorStatus } from '@/lib/connectors/types';

const OEMBED = 'https://www.loom.com/v1/oembed';
// A public Loom video used only as a reachability probe for the oEmbed lane.
const PROBE = 'https://www.loom.com/share/00000000000000000000000000000000';

type Fetch = typeof fetch;

export type LoomVideoMeta = {
  title: string;
  author: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
};

/** True for a real http(s) Loom link. Parsed, not regexed, so `javascript:`
 *  and lookalike hosts can't sneak through into a fetch. */
export function isLoomUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return u.hostname === 'loom.com' || u.hostname === 'www.loom.com';
  } catch {
    return false;
  }
}

/** Resolve one Loom link's public metadata. Null for a non-Loom link, a
 *  private/removed video, or any failure — callers render "unavailable". */
export async function loomVideoMeta(url: string, fetchFn: Fetch = fetch): Promise<LoomVideoMeta | null> {
  if (!isLoomUrl(url)) return null;
  try {
    const res = await fetchFn(`${OEMBED}?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    if (typeof body.title !== 'string') return null;
    return {
      title: body.title,
      author: typeof body.author_name === 'string' ? body.author_name : null,
      thumbnailUrl: typeof body.thumbnail_url === 'string' ? body.thumbnail_url : null,
      durationSeconds: typeof body.duration === 'number' ? body.duration : null,
    };
  } catch {
    return null;
  }
}

export async function loomStatus(fetchFn: Fetch = fetch): Promise<ConnectorStatus> {
  if (GATED) return gatedConnected('loom', 'Loom', 'creative', 'screen recordings · link metadata');
  const base = { id: 'loom', name: 'Loom', kind: 'creative' } as const;
  try {
    // Any answer at all (including 404 for a dead probe id) proves the lane is
    // up; only a transport failure means Loom is unreachable from here.
    await fetchFn(`${OEMBED}?url=${encodeURIComponent(PROBE)}`, { signal: AbortSignal.timeout(6000) });
    return {
      ...base,
      state: 'connected',
      detail:
        'oEmbed reachable: any Loom link resolves to title, thumbnail and duration. Loom publishes no account API, so there is no key to set and no way to list your library.',
      meta: { scope: 'link-level', auth: 'none required' },
    };
  } catch (err) {
    return {
      ...base,
      state: 'error',
      detail: `Loom oEmbed unreachable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
