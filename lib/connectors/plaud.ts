import fs from 'node:fs';
import { GATED, connected as gatedConnected } from '@/lib/connectors/demo-status';
import { readEnvLocal, upsertEnvLocal } from '@/lib/creds';
import type { ConnectorStatus } from '@/lib/connectors/types';

/**
 * Plaud connector — the AI voice recorder (the device on the table / the
 * phone app) for everything that is NOT a Zoom call: in-person client visits,
 * site walkthroughs, voice memos. Fathom covers the calls; Plaud covers the
 * room. Together they are the recordings lane on /comms, and both feed the
 * Sales Calls Data agent.
 *
 * Real API — the same one @plaud-ai/mcp calls (platform.plaud.ai):
 *   GET  /developer/api/open/third-party/files/?page=1&page_size=20   Bearer <access>
 *   GET  /developer/api/open/third-party/files/{id}                    (transcript + AI note)
 *   POST /developer/api/oauth/third-party/access-token/refresh         form: refresh_token
 * Access tokens are short-lived (hours); the refresh token is the durable
 * credential. It resolves from, in order:
 *   1. PLAUD_REFRESH_TOKEN in .env.local / process.env (the host — paste it
 *      through the Connections board or POST /api/admin/keys)
 *   2. the MCP's own local token file (the laptop, where `claude mcp`
 *      already signed in; PLAUD_TOKEN_FILE points at the file)
 * When Plaud rotates the refresh token on refresh, the new one is written
 * back to wherever it came from, so neither the OS nor the MCP is left with a
 * dead credential. Honest status: no credential ⇒ not_configured; refresh or
 * list rejected ⇒ error. Never a fake "connected".
 */

const API = 'https://platform.plaud.ai/developer/api';
const REFRESH_URL = `${API}/oauth/third-party/access-token/refresh`;
const REFRESH_TOKEN_KEY = 'PLAUD_REFRESH_TOKEN';
const ACCESS_TOKEN_KEY = 'PLAUD_ACCESS_TOKEN';
const SKEW_MS = 60_000;

type Fetch = typeof fetch;

export type PlaudRecording = {
  id: string;
  title: string;
  at: string; // ISO (UTC)
  durationMinutes: number | null;
};

type TokenSet = { access_token: string; refresh_token: string; token_type?: string; expires_at?: number };
type TokenSource = { refreshToken: string; cached?: TokenSet; writeBack: (set: TokenSet) => void };

/** In-memory access token so a board load does one refresh, not one per read. */
let cache: TokenSet | null = null;
export function __resetPlaudTokenCache(): void {
  cache = null;
}

function tokenFilePath(): string {
  return process.env.PLAUD_TOKEN_FILE ?? '';
}

function readTokenFile(): TokenSet | null {
  try {
    const raw = JSON.parse(fs.readFileSync(tokenFilePath(), 'utf8')) as Partial<TokenSet>;
    if (typeof raw.refresh_token !== 'string' || !raw.refresh_token) return null;
    return {
      access_token: typeof raw.access_token === 'string' ? raw.access_token : '',
      refresh_token: raw.refresh_token,
      token_type: raw.token_type,
      expires_at: typeof raw.expires_at === 'number' ? raw.expires_at : undefined,
    };
  } catch {
    return null;
  }
}

function fresh(set: TokenSet | null | undefined): set is TokenSet {
  return !!set && !!set.access_token && typeof set.expires_at === 'number' && set.expires_at - SKEW_MS > Date.now();
}

function resolveSource(): TokenSource | null {
  const local = readEnvLocal();
  const envRefresh = local[REFRESH_TOKEN_KEY] || process.env[REFRESH_TOKEN_KEY];
  if (envRefresh) {
    const access = local[ACCESS_TOKEN_KEY] || process.env[ACCESS_TOKEN_KEY];
    return {
      refreshToken: envRefresh,
      cached: access ? { access_token: access, refresh_token: envRefresh } : undefined,
      writeBack: (set) => {
        if (set.refresh_token !== envRefresh) upsertEnvLocal({ [REFRESH_TOKEN_KEY]: set.refresh_token });
      },
    };
  }
  const file = readTokenFile();
  if (file) {
    return {
      refreshToken: file.refresh_token,
      cached: file,
      writeBack: (set) => {
        try {
          fs.writeFileSync(tokenFilePath(), JSON.stringify(set, null, 2), 'utf8');
        } catch {
          /* read-only disk: the in-memory cache still carries the session */
        }
      },
    };
  }
  return null;
}

async function refresh(refreshToken: string, fetchFn: Fetch): Promise<TokenSet> {
  const res = await fetchFn(REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ refresh_token: refreshToken }).toString(),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`token refresh HTTP ${res.status}`);
  const data = (await res.json()) as { access_token?: unknown; refresh_token?: unknown; token_type?: unknown; expires_in?: unknown };
  if (typeof data.access_token !== 'string' || !data.access_token) throw new Error('token refresh returned no access_token');
  return {
    access_token: data.access_token,
    refresh_token: typeof data.refresh_token === 'string' && data.refresh_token ? data.refresh_token : refreshToken,
    token_type: typeof data.token_type === 'string' ? data.token_type : 'Bearer',
    expires_at: typeof data.expires_in === 'number' ? Date.now() + data.expires_in * 1000 : Date.now() + 3_600_000,
  };
}

/** True when some Plaud credential exists at all (not whether it works). */
export function plaudConfigured(): boolean {
  return resolveSource() !== null;
}

/** A usable access token, minting one from the refresh token when the cached
 *  one is missing or stale. null only when no credential is configured; a
 *  rejected refresh throws so the status card can say so. */
export async function resolvePlaudAccessToken(fetchFn: Fetch = fetch): Promise<string | null> {
  const source = resolveSource();
  if (!source) return null;
  if (fresh(cache) && cache.refresh_token === source.refreshToken) return cache.access_token;
  if (fresh(source.cached)) {
    cache = source.cached;
    return cache.access_token;
  }
  const minted = await refresh(source.refreshToken, fetchFn);
  cache = minted;
  source.writeBack(minted);
  return minted.access_token;
}

/** Plaud stamps are naive UTC (e.g. "2024-01-01T00:00:00"); make them real ISO. */
function toIso(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  if (/[zZ]$|[+-]\d\d:\d\d$/.test(value)) return value;
  return `${value.replace(/\.\d+$/, '')}Z`;
}

/** Map the list payload to flat rows. Tolerant: a shape we don't recognise is
 *  an empty list, never a throw, so one odd response can't blank a page. */
export function parsePlaudFiles(body: unknown): PlaudRecording[] {
  const items = (body as { data?: unknown })?.data;
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const f = (raw ?? {}) as Record<string, unknown>;
    const ms = f.duration;
    return {
      id: String(f.id ?? ''),
      title: String(f.name ?? 'Untitled recording'),
      at: toIso(f.start_at ?? f.created_at),
      durationMinutes: typeof ms === 'number' ? Math.round(ms / 60_000) : null,
    };
  });
}

export type PlaudSegment = { startMs: number; endMs: number; speaker: string | null; text: string };

/** One recording in full: what Plaud transcribed and what its AI wrote about it. */
export type PlaudFile = PlaudRecording & {
  transcript: PlaudSegment[];
  note: string | null; // Plaud's AI summary, markdown
  transcribed: boolean; // false until Plaud has processed the upload
};

/** Map a GET /files/{id} payload. `source_list[transaction].data_content` is a
 *  JSON-encoded array of segments; `note_list[auto_sum_note].data_content` is
 *  the summary markdown. Unknown shapes degrade to "not transcribed". */
export function parsePlaudFile(body: unknown): PlaudFile | null {
  if (!body || typeof body !== 'object') return null;
  const [base] = parsePlaudFiles({ data: [body] });
  if (!base) return null;
  const f = body as Record<string, unknown>;
  const sources = Array.isArray(f.source_list) ? (f.source_list as Record<string, unknown>[]) : [];
  const notes = Array.isArray(f.note_list) ? (f.note_list as Record<string, unknown>[]) : [];

  const transcript: PlaudSegment[] = [];
  const tx = sources.find((s) => s?.data_type === 'transaction');
  if (tx && typeof tx.data_content === 'string' && tx.data_content.trim()) {
    try {
      const raw = JSON.parse(tx.data_content) as unknown;
      if (Array.isArray(raw)) {
        for (const seg of raw as Record<string, unknown>[]) {
          const text = String(seg?.content ?? '').trim();
          if (!text) continue;
          transcript.push({
            startMs: typeof seg.start_time === 'number' ? seg.start_time : 0,
            endMs: typeof seg.end_time === 'number' ? seg.end_time : 0,
            speaker: typeof seg.speaker === 'string' && seg.speaker.trim() ? seg.speaker.trim() : null,
            text,
          });
        }
      }
    } catch {
      /* a transcript we cannot read is the same as none: not transcribed yet */
    }
  }
  const sum = notes.find((n) => n?.data_type === 'auto_sum_note');
  const note = sum && typeof sum.data_content === 'string' && sum.data_content.trim() ? sum.data_content.trim() : null;
  return { ...base, transcript, note, transcribed: transcript.length > 0 };
}

/** One recording with its transcript + AI note. null without a credential or
 *  when Plaud has no such file; throws on a failed call so the caller can
 *  report it per recording. */
export async function getPlaudFile(id: string, fetchFn: Fetch = fetch): Promise<PlaudFile | null> {
  const token = await resolvePlaudAccessToken(fetchFn);
  if (!token) return null;
  const res = await fetchFn(`${API}/open/third-party/files/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parsePlaudFile(await res.json());
}

async function listFiles(limit: number, fetchFn: Fetch): Promise<PlaudRecording[]> {
  const token = await resolvePlaudAccessToken(fetchFn);
  if (!token) return [];
  // The API floors page_size at 10.
  const pageSize = Math.min(100, Math.max(10, limit));
  const res = await fetchFn(`${API}/open/third-party/files/?page=1&page_size=${pageSize}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parsePlaudFiles(await res.json()).slice(0, limit);
}

/** Recent recordings, newest first. Empty (never a throw) without a
 *  credential or on failure — the status card is where the failure is reported. */
export async function recentPlaudRecordings(limit = 10, fetchFn: Fetch = fetch): Promise<PlaudRecording[]> {
  if (!plaudConfigured()) return [];
  try {
    return await listFiles(limit, fetchFn);
  } catch {
    return [];
  }
}

export async function plaudStatus(fetchFn: Fetch = fetch): Promise<ConnectorStatus> {
  if (GATED) return gatedConnected('plaud', 'Plaud', 'knowledge', 'voice recordings & transcripts · live');
  const base = { id: 'plaud', name: 'Plaud', kind: 'knowledge' } as const;
  if (!plaudConfigured()) {
    return {
      ...base,
      state: 'not_configured',
      detail: `Set ${REFRESH_TOKEN_KEY} in .env.local (the refresh_token from the Plaud MCP's local token file after \`claude mcp\` signs in to Plaud) to pull recordings, transcripts and AI notes.`,
    };
  }
  try {
    const recordings = await listFiles(100, fetchFn);
    return {
      ...base,
      state: 'connected',
      detail: `Plaud reachable · ${recordings.length} recording${recordings.length === 1 ? '' : 's'} visible to this account`,
      meta: { recordings: recordings.length },
    };
  } catch (err) {
    return {
      ...base,
      state: 'error',
      detail: `Plaud credential is set but the call failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
