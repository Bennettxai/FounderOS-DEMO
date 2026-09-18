/**
 * Cross-encoder reranker, served locally.
 *
 * G-Brain's own hybrid scores are not calibrated to relevance: measured
 * against this store, `gbrain query "Vantage pricing"` put website copy on
 * top at 0.846 and the SOP that literally quotes the price 10th at 0.748, with the
 * whole band inside 0.69-0.85. No threshold can separate that, so the fix is
 * not a floor, it is a second opinion: retrieve wide from the vector store,
 * then rerank narrow with a cross-encoder that reads the query and the passage
 * together.
 *
 * This used to call ZeroEntropy's hosted `zerank-1`. ZeroEntropy was acquired
 * by Notion and shuts its API down, so the pass now runs against
 * a local `llama-server --reranking` (Qwen3-Reranker-0.6B):8081. The swap
 * was cheap because llama.cpp speaks ZeroEntropy's exact wire dialect --
 * request `{model, query, documents}`, response `{results: [{index,
 * relevance_score}]}` -- so `parseRerankResponse` below is untouched from the
 * hosted era.
 *
 * Measured on the laptop: 0.78s for a pool of 15 passages at ~200
 * tokens each, and the separation is far cleaner than the hosted model managed
 * -- a passage that answers the query scores ~0.43 while one that does not
 * scores ~4e-9, rather than everything landing inside one narrow band.
 *
 * Everything here fails soft. A reranker that cannot answer returns null and
 * the caller keeps the provider's own order, because a slow or broken second
 * opinion must never cost a page render or a worker's context read. That
 * matters more now than it did on a hosted API: a box with no llama-server
 * running (the dedicated host, until it gets one) simply gets provider order back.
 */

export type RerankFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

/** Scores for the documents, in the order they were passed, or null if unavailable. */
export type Reranker = (query: string, documents: string[]) => Promise<number[] | null>;

/** Where llama-server lands by default; the embedding server keeps :11434. */
const DEFAULT_BASE_URL = 'http://127.0.0.1:8081/v1';
/** Must match the `--alias` llama-server was launched with. */
const DEFAULT_MODEL = 'qwen3-reranker-0.6b';
/** Measured ~0.8s for a full pool of 15; a page render races this. */
const TIMEOUT_MS = 6_000;
/** A chunk longer than this adds latency, not signal. */
const DOC_CHARS = 1_200;

export type RerankEndpoint = { url: string; model: string; apiKey?: string };

/**
 * Local and unauthenticated is the default, but the shape stays open: any
 * endpoint speaking the same dialect (a shared llama-server on the private network, or
 * a hosted provider) is a two-env-var change rather than a code change.
 */
export function resolveRerankEndpoint(
  opts: { env?: Record<string, string | undefined> } = {},
): RerankEndpoint {
  const env = opts.env ?? process.env;
  const base = (env.RERANK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  return {
    url: `${base}/rerank`,
    model: env.RERANK_MODEL || DEFAULT_MODEL,
    apiKey: env.RERANK_API_KEY || undefined,
  };
}

/**
 * The API answers with `{index, relevance_score}` in ITS chosen order, not the
 * order the documents were sent in. Re-seat the scores against the original
 * positions, and refuse a payload that does not cover every document: a
 * partial answer silently ranked as zeroes would bury real hits.
 */
export function parseRerankResponse(body: unknown, expected: number): number[] | null {
  const rows = (body as { results?: unknown })?.results;
  if (!Array.isArray(rows) || rows.length !== expected) return null;

  const scores = new Array<number | undefined>(expected);
  for (const row of rows) {
    const index = (row as { index?: unknown })?.index;
    const score = (row as { relevance_score?: unknown })?.relevance_score;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= expected) return null;
    if (typeof score !== 'number' || Number.isNaN(score)) return null;
    if (scores[index] !== undefined) return null; // a duplicated index means a document went unscored
    scores[index] = score;
  }
  return scores.every((s) => s !== undefined) ? (scores as number[]) : null;
}

export function createReranker(
  opts: { env?: Record<string, string | undefined>; endpoint?: RerankEndpoint; fetchImpl?: RerankFetch } = {},
): Reranker | null {
  const endpoint = opts.endpoint ?? resolveRerankEndpoint({ env: opts.env });
  const fetchImpl = opts.fetchImpl ?? fetch;

  return async (query, documents) => {
    // Nothing to reorder, and the call would still cost a model pass.
    if (documents.length < 2 || !query.trim()) return null;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      // Local llama-server runs unauthenticated; only send a header when a
      // hosted endpoint actually needs one.
      if (endpoint.apiKey) headers.Authorization = `Bearer ${endpoint.apiKey}`;

      const res = await fetchImpl(endpoint.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: endpoint.model,
          query: query.slice(0, DOC_CHARS),
          documents: documents.map((d) => d.slice(0, DOC_CHARS)),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return parseRerankResponse(await res.json(), documents.length);
    } catch {
      return null;
    }
  };
}
