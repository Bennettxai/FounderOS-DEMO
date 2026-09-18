import { GATED, connected as gatedConnected } from '@/lib/connectors/demo-status';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CRED_FILES, resolveCred } from '@/lib/creds';
import type { ConnectorStatus } from '@/lib/connectors/types';

/** Optional local account map. Generic and env-overridable: nothing here may
 *  depend on a path that exists only on one person's machine. */
function configPath(): string {
  return process.env.ZERNIO_CONFIG_PATH ?? path.join(os.homedir(), '.founder-os', 'social.json');
}

type ZernioConfig = {
  baseUrl?: string;
  v1Url?: string;
  accounts?: Record<string, { handle?: string; followers?: number }>;
};

function readConfig(): ZernioConfig {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

/** Account map from the optional local config file — handles + follower counts. */
export function zernioAccounts(): Record<string, { handle?: string; followers?: number }> {
  return readConfig().accounts ?? {};
}

export function zernioKey(): string | undefined {
  return resolveCred('ZERNIO_API_KEY', [CRED_FILES.socialMedia, CRED_FILES.brainAgent]);
}

// ── Live follower counts ────────────────────────────────────────────────────
// The static config.json numbers go stale; the real live counts come back from
// the Zernio/Late `/v1/accounts` payload at metadata.profileData.followersCount
// (with page fan_count as a fallback for Facebook-style accounts).

type FollowerMap = Record<string, { handle?: string; followers?: number }>;

function pickFollowers(account: unknown): number | undefined {
  const a = (account ?? {}) as Record<string, any>;
  const md = (a.metadata ?? {}) as Record<string, any>;
  const pages = Array.isArray(md.availablePages) ? md.availablePages : [];
  const candidates = [
    md?.profileData?.followersCount,
    md?.userProfile?.followersCount,
    a?.profileData?.followersCount,
    pages[0]?.fan_count,
  ];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c >= 0) return c;
  }
  return undefined;
}

/** Map a `/v1/accounts` payload to the {platform: {handle, followers}} shape the
    snapshot sync consumes. Accounts without a resolvable follower count are
    dropped — never a fake zero. */
export function parseLiveAccounts(raw: unknown): FollowerMap {
  const accounts = (raw as { accounts?: unknown })?.accounts;
  if (!Array.isArray(accounts)) return {};
  const out: FollowerMap = {};
  for (const account of accounts) {
    const a = (account ?? {}) as Record<string, any>;
    const platform = typeof a.platform === 'string' ? a.platform : null;
    if (!platform) continue;
    const followers = pickFollowers(a);
    if (followers == null) continue;
    const username = typeof a.username === 'string' ? a.username : undefined;
    out[platform] = { handle: username ? `@${username}` : undefined, followers };
  }
  return out;
}

/** Platform count, follower total and display handle for the connections card.
    Live counts win; the static config map is a fallback only — most hosts have
    no local config file at all, so anything read from there is absent there and
    stale here. */
export function zernioSummary(
  live: FollowerMap,
  fallback: FollowerMap,
): { platforms: number; followers: number; handle: string | null } {
  const source = Object.keys(live).length > 0 ? live : fallback;
  const entries = Object.entries(source);
  return {
    platforms: entries.length,
    followers: entries.reduce((sum, [, a]) => sum + (a.followers ?? 0), 0),
    handle: source.instagram?.handle ?? entries.find(([, a]) => a.handle)?.[1].handle ?? null,
  };
}

let liveAccountsCache: { at: number; data: FollowerMap } | null = null;
const LIVE_TTL_MS = 60_000;

/** Live follower counts straight from Zernio/Late. 60s in-memory cache so rapid
    re-renders don't re-hit the API; 6s timeout; falls back to the last good
    response (or {}) on error so a page render never hangs or blanks out. */
export async function zernioLiveAccounts(): Promise<FollowerMap> {
  const now = Date.now();
  if (liveAccountsCache && now - liveAccountsCache.at < LIVE_TTL_MS) return liveAccountsCache.data;
  const key = zernioKey();
  if (!key) return {};
  const config = readConfig();
  try {
    const res = await fetch(`${config.v1Url ?? 'https://zernio.com/api/v1'}/accounts`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = parseLiveAccounts(await res.json());
    liveAccountsCache = { at: now, data };
    return data;
  } catch {
    return liveAccountsCache?.data ?? {};
  }
}

// ── Published-post history ──────────────────────────────────────────────────

export type ZernioPost = {
  platform: string;
  caption: string;
  url: string;
  publishedAt: string | null;
  status: string;
};

/** Map a `/history` (or `/v1/posts`) payload to recent published posts. Picks
    the first platform's live post URL. Engagement (likes/views) is intentionally
    absent — that lives behind Late's paid analytics add-on, so we never invent
    it. */
export function parseHistory(raw: unknown, limit = 6): ZernioPost[] {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { posts?: unknown })?.posts)
      ? ((raw as { posts: unknown[] }).posts)
      : null;
  if (!arr) return [];
  return arr.slice(0, limit).map((entry) => {
    const e = (entry ?? {}) as Record<string, any>;
    const postIds = Array.isArray(e.postIds) ? e.postIds : [];
    const primary = postIds.find((p: any) => p?.postUrl) ?? postIds[0] ?? {};
    const platform =
      (typeof primary.platform === 'string' && primary.platform) ||
      (Array.isArray(e.platforms) && typeof e.platforms[0] === 'string' && e.platforms[0]) ||
      'unknown';
    const caption = typeof e.post === 'string' ? e.post : typeof e.content === 'string' ? e.content : '';
    return {
      platform: String(platform),
      caption,
      url: typeof primary.postUrl === 'string' ? primary.postUrl : '',
      publishedAt: typeof e.created === 'string' ? e.created : typeof e.scheduleDate === 'string' ? e.scheduleDate : null,
      status: typeof e.status === 'string' ? e.status : 'unknown',
    };
  });
}

// ── Posting activity (per-day, per-platform) ────────────────────────────────

export type ZernioPostDay = { date: string; platforms: string[] };

/** Map a `/history` payload to one {date, platforms[]} per post, keeping the
    FULL cross-post platform list (a post sent to IG+TikTok+YT yields all three).
    Powers the posting-consistency chart's per-platform breakdown + hover. */
export function parsePostDays(raw: unknown): ZernioPostDay[] {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { posts?: unknown })?.posts)
      ? ((raw as { posts: unknown[] }).posts)
      : null;
  if (!arr) return [];
  const out: ZernioPostDay[] = [];
  for (const entry of arr) {
    const e = (entry ?? {}) as Record<string, any>;
    const stamp = typeof e.created === 'string' ? e.created : typeof e.scheduleDate === 'string' ? e.scheduleDate : null;
    const platforms = Array.isArray(e.platforms) ? e.platforms.filter((p: unknown): p is string => typeof p === 'string') : [];
    if (!stamp || platforms.length === 0) continue;
    out.push({ date: stamp.slice(0, 10), platforms });
  }
  return out;
}

// On a gated deploy, seed recent posting activity so the Social tab shows posts
// going out + a live posting calendar without a live key. Local dev (ungated)
// stays honest — these are only returned when GATED and no key is set.
const gatedIso = (daysBack: number): string => new Date(Date.now() - daysBack * 86_400_000).toISOString();
const GATED_RECENT_POSTS: ZernioPost[] = [
  { platform: 'instagram', caption: 'The AI agency stack that runs my whole business (full breakdown) 🧵', url: 'https://instagram.com', publishedAt: gatedIso(0), status: 'published' },
  { platform: 'tiktok', caption: 'POV: your inbox, calendar and CRM run themselves', url: 'https://tiktok.com', publishedAt: gatedIso(1), status: 'published' },
  { platform: 'youtube', caption: 'I automated a 7-figure agency with AI agents — here is how', url: 'https://youtube.com', publishedAt: gatedIso(2), status: 'published' },
  { platform: 'twitter', caption: '5 agents that replaced 5 hires. Thread 👇', url: 'https://x.com', publishedAt: gatedIso(3), status: 'published' },
  { platform: 'instagram', caption: 'Vantage case study: 3x pipeline in 60 days', url: 'https://instagram.com', publishedAt: gatedIso(4), status: 'published' },
  { platform: 'linkedin', caption: 'Why every operator needs a knowledge graph, not another SaaS', url: 'https://linkedin.com', publishedAt: gatedIso(5), status: 'published' },
  { platform: 'tiktok', caption: 'Building an AI receptionist live (it books the call)', url: 'https://tiktok.com', publishedAt: gatedIso(6), status: 'published' },
  { platform: 'instagram', caption: 'The 4-inbox triage agent that saves me 10 hrs/week', url: 'https://instagram.com', publishedAt: gatedIso(8), status: 'published' },
  { platform: 'youtube', caption: 'Full G-Brain walkthrough, my second brain', url: 'https://youtube.com', publishedAt: gatedIso(9), status: 'published' },
  { platform: 'twitter', caption: 'Ship agents, not dashboards.', url: 'https://x.com', publishedAt: gatedIso(11), status: 'published' },
];
function gatedPostDays(): ZernioPostDay[] {
  const plat = ['instagram', 'tiktok', 'twitter', 'youtube', 'linkedin'];
  const days: ZernioPostDay[] = [];
  for (let d = 0; d < 30; d++) {
    if (d % 7 === 5) continue; // an occasional quiet day
    const n = 1 + (d % 3); // 1–3 platforms
    days.push({ date: gatedIso(d).slice(0, 10), platforms: plat.slice(d % 3, (d % 3) + n) });
  }
  return days;
}

let postDaysCache: { at: number; data: ZernioPostDay[] } | null = null;

/** Full real posting history (date + cross-post platforms per post), 60s-cached.
    The endpoint returns the full set (~tens of posts), no pagination. */
export async function zernioPostDays(): Promise<ZernioPostDay[]> {
  const now = Date.now();
  if (postDaysCache && now - postDaysCache.at < LIVE_TTL_MS) return postDaysCache.data;
  const key = zernioKey();
  if (!key) return GATED ? gatedPostDays() : [];
  const config = readConfig();
  try {
    const res = await fetch(`${config.baseUrl ?? 'https://getlate.dev/api'}/history?limit=200`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = parsePostDays(await res.json());
    postDaysCache = { at: now, data };
    return data;
  } catch {
    return postDaysCache?.data ?? [];
  }
}

let livePostsCache: { at: number; data: ZernioPost[] } | null = null;

/** Recent published posts from Zernio/Late, same 60s-cache + timeout discipline
    as the account fetch. */
export async function zernioRecentPosts(limit = 6): Promise<ZernioPost[]> {
  const now = Date.now();
  if (livePostsCache && now - livePostsCache.at < LIVE_TTL_MS) return livePostsCache.data.slice(0, limit);
  const key = zernioKey();
  if (!key) return GATED ? GATED_RECENT_POSTS.slice(0, limit) : [];
  const config = readConfig();
  try {
    const res = await fetch(`${config.baseUrl ?? 'https://getlate.dev/api'}/history`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = parseHistory(await res.json(), 24);
    livePostsCache = { at: now, data };
    return data.slice(0, limit);
  } catch {
    return livePostsCache?.data.slice(0, limit) ?? [];
  }
}

export async function zernioStatus(): Promise<ConnectorStatus> {
  if (GATED) return gatedConnected('zernio', 'Zernio', 'social', '6 platforms · live');
  const key = zernioKey();
  const config = readConfig();
  const accounts = Object.entries(config.accounts ?? {});
  if (!key) {
    return {
      id: 'zernio',
      name: 'Zernio (Social)',
      kind: 'social',
      state: 'not_configured',
      detail: 'ZERNIO_API_KEY not found in the environment or the credential file.',
    };
  }
  try {
    const res = await fetch(`${config.v1Url ?? 'https://zernio.com/api/v1'}/accounts`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { platforms, followers, handle } = zernioSummary(
      parseLiveAccounts(await res.json()),
      config.accounts ?? {},
    );
    return {
      id: 'zernio',
      name: 'Zernio (Social)',
      kind: 'social',
      state: 'connected',
      detail: `${platforms} platforms${handle ? ` (${handle})` : ''} · ${followers.toLocaleString('en-US')} total followers`,
      meta: { platforms, followers },
    };
  } catch (err) {
    return {
      id: 'zernio',
      name: 'Zernio (Social)',
      kind: 'social',
      state: 'error',
      detail: `Key found but API check failed: ${err instanceof Error ? err.message : String(err)}`,
      meta: { platforms: accounts.length },
    };
  }
}

// ── Real publishing (the operator, 2026-08-06: first posts through the platform) ──

/** Presigned upload slot from Late: PUT the bytes to uploadUrl, post accessUrl. */
export async function zernioUploadTarget(
  fileName: string,
  contentType: string,
): Promise<{ uploadUrl: string; accessUrl: string }> {
  const key = zernioKey();
  if (!key) throw new Error('ZERNIO_API_KEY not configured');
  const base = readConfig().baseUrl ?? 'https://getlate.dev/api';
  const qs = new URLSearchParams({ fileName, contentType });
  const res = await fetch(`${base}/media/uploadUrl?${qs}`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`uploadUrl failed: HTTP ${res.status}`);
  const body = (await res.json()) as { uploadUrl?: string; accessUrl?: string };
  if (!body.uploadUrl || !body.accessUrl) throw new Error('uploadUrl response missing fields');
  return { uploadUrl: body.uploadUrl, accessUrl: body.accessUrl };
}

/** Create the post for real (publishes now unless scheduledFor is given). */
export async function zernioPublish(input: {
  caption: string;
  mediaUrls: string[];
  platforms: string[];
  scheduledFor?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = zernioKey();
  if (!key) return { ok: false, error: 'ZERNIO_API_KEY not configured' };
  const base = readConfig().baseUrl ?? 'https://getlate.dev/api';
  const isVideo = input.mediaUrls.some((u) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u));
  const payload: Record<string, unknown> = {
    post: input.caption,
    mediaUrls: input.mediaUrls,
    platforms: input.platforms,
    isVideo,
    ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : { publishNow: true }),
    ...(input.platforms.includes('youtube')
      ? { youTubeOptions: { title: input.caption.slice(0, 95), visibility: 'public', shorts: isVideo } }
      : {}),
  };
  try {
    const res = await fetch(`${base}/post`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
