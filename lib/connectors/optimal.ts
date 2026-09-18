/**
 * OptimalEngine brain provider.
 *
 * The engine (an Elixir project, restored from backup) is the governed Source
 * to Signal to Claim to Fact to Memory store. It listens on :4200 and its dev
 * config leaves the API open on localhost, so there is no key to resolve
 * here.
 *
 * Knowledge is partitioned into named workspaces (a product workspace, a
 * community workspace, a personal workspace, and so on) plus a compat
 * `default` workspace the engine auto-creates and that only ever holds
 * smoke-test signals. A search therefore fans out over the real workspaces
 * and merges. `/api/grep` is used
 * rather than `/api/search`: search returns an L0 one-liner
 * ("NOTE | sales | Title [S/N: 0.6]") and a flat S/N ratio, grep returns the
 * matching text and a relevance score, which is what a brief can actually use.
 *
 * Writes are claims-first (`/api/ingest` with extract_claims), never straight
 * to Facts: promotion is a review gate inside the engine, by design.
 */
import type { BrainProvider, BrainSearchResult, BrainStatus } from '@/lib/brain';
import type { CaptureInput, CaptureOutcome } from '@/lib/connectors/gbrain';

export type OptimalFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_BASE_URL = 'http://127.0.0.1:4200';
const COMPAT_WORKSPACE = 'default';
const MAX_RESULTS = 8;
const SNIPPET_CHARS = 400;
/** A page render races this; a recall must never hold /brain or /api/memory hostage. */
const TIMEOUT_MS = 8_000;

type Workspace = { id: string; slug: string; name: string; organization_id: string; status: string };
type GrepHit = { slug: string; snippet: string; score: number };
type Health = { status?: string; 'ok?'?: boolean; degraded?: string[]; checks?: Record<string, string> };
type IngestReceipt = { ok?: boolean; signal_id?: string; source_package_id?: string; error?: string };

export type OptimalRecall = { body: string; sources: string[] };

export type OptimalProvider = BrainProvider & {
  capture(input: CaptureInput): Promise<CaptureOutcome>;
  /** The engine's assembled context package for a question, budgeted in characters. */
  recall(query: string, budget?: number): Promise<OptimalRecall | null>;
};

/** Title for a grep hit: a markdown heading, else a `title:` front-matter line, else the node slug. */
export function titleFromSnippet(snippet: string, slug: string): string {
  const heading = snippet.match(/^\s*#{1,6}\s+(.+?)\s*$/m);
  if (heading) return heading[1];
  const titled = snippet.match(/^\s*title:\s*(.+?)\s*$/m);
  if (titled) return titled[1];
  return slug;
}

function baseUrlFromEnv(): string {
  return (process.env.OPTIMAL_ENGINE_URL ?? process.env.OPTIMAL_ENGINE_API_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
}

function pinnedWorkspaces(): string[] | null {
  const raw = process.env.OPTIMAL_ENGINE_WORKSPACES;
  if (!raw) return null;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : null;
}

export function createOptimalProvider(
  opts: { fetch?: OptimalFetch; baseUrl?: string; captureWorkspace?: string } = {},
): OptimalProvider {
  const fetchImpl: OptimalFetch = opts.fetch ?? ((input, init) => fetch(input, init));
  const base = (opts.baseUrl ?? baseUrlFromEnv()).replace(/\/$/, '');
  const captureWorkspace = opts.captureWorkspace ?? process.env.OPTIMAL_ENGINE_CAPTURE_WORKSPACE ?? 'default:personal';

  async function getJson<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`optimal ${path} → HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  async function postJson<T>(path: string, body: unknown): Promise<{ status: number; body: T }> {
    const res = await fetchImpl(new URL(base + path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
  }

  /** Every active workspace except the engine's compat default. */
  async function realWorkspaces(): Promise<string[]> {
    const pinned = pinnedWorkspaces();
    if (pinned) return pinned;
    const data = await getJson<{ workspaces?: Workspace[] }>('/api/workspaces', { status: 'active', limit: '50' });
    const ids = (data.workspaces ?? []).map((w) => w.id).filter((id) => id !== COMPAT_WORKSPACE);
    return ids.length ? ids : [COMPAT_WORKSPACE];
  }

  async function grepWorkspace(query: string, workspace: string): Promise<BrainSearchResult[]> {
    const data = await getJson<{ results?: GrepHit[] }>('/api/grep', { q: query, workspace, limit: String(MAX_RESULTS) });
    return (data.results ?? []).map((hit) => ({
      title: titleFromSnippet(hit.snippet ?? '', hit.slug),
      snippet: (hit.snippet ?? '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_CHARS),
      source: `optimal://${workspace}/${hit.slug}`,
      score: typeof hit.score === 'number' ? hit.score : Number(hit.score) || 0,
    }));
  }

  return {
    name: 'optimal',

    async status(): Promise<BrainStatus> {
      try {
        const health = await getJson<Health>('/api/health');
        const degraded = health.degraded ?? [];
        const ok = health['ok?'] === true && degraded.length === 0;
        let workspaces = '';
        try {
          workspaces = ` · ${(await realWorkspaces()).length} workspaces`;
        } catch {
          // status is still meaningful without the workspace count
        }
        return {
          connected: ok,
          provider: 'optimal',
          detail: ok
            ? `optimal engine ${health.status ?? 'up'}${workspaces} · ${base}`
            : `optimal engine ${health.status ?? 'degraded'} · degraded: ${degraded.join(', ') || 'unknown'}${workspaces}`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { connected: false, provider: 'optimal', detail: `${message.slice(0, 200)} · ${base}` };
      }
    },

    async search(query: string): Promise<BrainSearchResult[]> {
      const q = query.trim();
      if (!q) return [];
      try {
        const workspaces = await realWorkspaces();
        const settled = await Promise.allSettled(workspaces.map((ws) => grepWorkspace(q, ws)));
        const merged = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
        return merged.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, MAX_RESULTS);
      } catch {
        return [];
      }
    },

    async recall(query: string, budget = 6_000): Promise<OptimalRecall | null> {
      const q = query.trim();
      if (!q) return null;
      try {
        const workspaces = await realWorkspaces();
        const per = Math.max(800, Math.floor(budget / workspaces.length));
        const settled = await Promise.allSettled(
          workspaces.map((ws) =>
            postJson<{ envelope?: { body?: string; sources?: string[] } }>('/api/rag', {
              query: q,
              workspace: ws,
              format: 'markdown',
              bandwidth: 'medium',
              budget: per,
            }),
          ),
        );
        const parts: string[] = [];
        const sources: string[] = [];
        settled.forEach((r, i) => {
          if (r.status !== 'fulfilled' || r.value.status !== 200) return;
          const body = r.value.body.envelope?.body?.trim();
          if (!body) return;
          parts.push(`## ${workspaces[i]}\n${body}`);
          sources.push(...(r.value.body.envelope?.sources ?? []));
        });
        if (!parts.length) return null;
        return { body: parts.join('\n\n').slice(0, budget), sources };
      } catch {
        return null;
      }
    },

    async capture(input: CaptureInput): Promise<CaptureOutcome> {
      const title = input.title?.trim();
      const body = input.text.trim();
      if (!body) return { ok: false, error: 'nothing to capture (empty content)' };
      const text = title ? `# ${title}\n\n${body}` : body;
      try {
        const { status, body: receipt } = await postJson<IngestReceipt>('/api/ingest', {
          text,
          ...(title ? { title } : {}),
          ...(input.type ? { genre: input.type } : {}),
          workspace: captureWorkspace,
          extract_claims: true,
        });
        if (status === 200 && receipt.ok && receipt.signal_id) {
          return { ok: true, slug: receipt.signal_id, contentHash: receipt.source_package_id ?? receipt.signal_id };
        }
        return { ok: false, error: `optimal ingest failed (HTTP ${status}): ${receipt.error ?? 'no receipt'}` };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
