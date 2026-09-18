import { describe, expect, test } from 'vitest';
import {
  createReranker,
  parseRerankResponse,
  resolveRerankEndpoint,
  type RerankFetch,
} from '@/lib/connectors/reranker';

function fakeFetch(reply: { status?: number; body: unknown } | Error): RerankFetch & {
  calls: RequestInit[];
  urls: string[];
} {
  const calls: RequestInit[] = [];
  const urls: string[] = [];
  const fn = (async (input: string | URL, init?: RequestInit) => {
    urls.push(String(input));
    calls.push(init ?? {});
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as RerankFetch & { calls: RequestInit[]; urls: string[] };
  fn.calls = calls;
  fn.urls = urls;
  return fn;
}

describe('rerank endpoint resolution', () => {
  test('defaults to the local llama-server, which needs no key', () => {
    const endpoint = resolveRerankEndpoint({ env: {} });
    expect(endpoint.url).toBe('http://127.0.0.1:8081/v1/rerank');
    expect(endpoint.model).toBe('qwen3-reranker-0.6b');
    expect(endpoint.apiKey).toBeUndefined();
  });

  test('honours an explicit base url, so the host can point elsewhere', () => {
    const endpoint = resolveRerankEndpoint({
      env: { RERANK_BASE_URL: 'http://os-host:8081/v1' },
    });
    expect(endpoint.url).toBe('http://os-host:8081/v1/rerank');
  });

  test('tolerates a trailing slash rather than producing a doubled path', () => {
    const endpoint = resolveRerankEndpoint({ env: { RERANK_BASE_URL: 'http://127.0.0.1:8081/v1/' } });
    expect(endpoint.url).toBe('http://127.0.0.1:8081/v1/rerank');
  });

  test('carries a key only when one is set, for a hosted wire-compatible endpoint', () => {
    expect(resolveRerankEndpoint({ env: { RERANK_API_KEY: 'sk_remote' } }).apiKey).toBe('sk_remote');
  });

  test('takes the model alias from the env, matching llama-server --alias', () => {
    expect(resolveRerankEndpoint({ env: { RERANK_MODEL: 'qwen3-reranker-4b' } }).model).toBe(
      'qwen3-reranker-4b',
    );
  });
});

describe('rerank response parsing', () => {
  test('maps scores back onto the document indexes the API answered with', () => {
    const scores = parseRerankResponse(
      {
        results: [
          { index: 2, relevance_score: 0.9 },
          { index: 0, relevance_score: 0.4 },
          { index: 1, relevance_score: 0.1 },
        ],
      },
      3,
    );
    expect(scores).toEqual([0.4, 0.1, 0.9]);
  });

  test('rejects a payload whose indexes do not cover the documents sent', () => {
    expect(parseRerankResponse({ results: [{ index: 0, relevance_score: 0.5 }] }, 3)).toBeNull();
    expect(parseRerankResponse({ results: [{ index: 7, relevance_score: 0.5 }] }, 1)).toBeNull();
    expect(parseRerankResponse({ nope: true }, 1)).toBeNull();
  });

  test('accepts the very small scores a local cross-encoder returns for a miss', () => {
    // llama-server separates hit from miss by orders of magnitude, not by the
    // 0.69-0.85 band the hosted model used. Near-zero is a real score.
    const scores = parseRerankResponse(
      {
        results: [
          { index: 0, relevance_score: 4.48e-9 },
          { index: 1, relevance_score: 0.425 },
        ],
      },
      2,
    );
    expect(scores).toEqual([4.48e-9, 0.425]);
  });
});

describe('createReranker', () => {
  test('exists without any key, because the default endpoint is local', () => {
    expect(createReranker({ env: {} })).not.toBeNull();
  });

  test('scores documents in the order they were sent', async () => {
    const fetchImpl = fakeFetch({
      body: {
        results: [
          { index: 1, relevance_score: 0.88 },
          { index: 0, relevance_score: 0.12 },
        ],
      },
    });
    const rerank = createReranker({ env: {}, fetchImpl });
    expect(rerank).not.toBeNull();

    const scores = await rerank!('vantage pricing', ['greeting page', 'pricing page']);
    expect(scores).toEqual([0.12, 0.88]);

    expect(fetchImpl.urls[0]).toBe('http://127.0.0.1:8081/v1/rerank');
    const sent = JSON.parse(String(fetchImpl.calls[0].body));
    expect(sent.query).toBe('vantage pricing');
    expect(sent.documents).toEqual(['greeting page', 'pricing page']);
    expect(sent.model).toBe('qwen3-reranker-0.6b');
  });

  test('sends no Authorization header to an unauthenticated local server', async () => {
    const fetchImpl = fakeFetch({ body: { results: [{ index: 0, relevance_score: 1 }, { index: 1, relevance_score: 0 }] } });
    await createReranker({ env: {}, fetchImpl })!('q', ['a', 'b']);
    expect(fetchImpl.calls[0].headers).not.toHaveProperty('Authorization');
  });

  test('sends one when a hosted endpoint is configured with a key', async () => {
    const fetchImpl = fakeFetch({ body: { results: [{ index: 0, relevance_score: 1 }, { index: 1, relevance_score: 0 }] } });
    await createReranker({ env: { RERANK_API_KEY: 'sk_remote' }, fetchImpl })!('q', ['a', 'b']);
    expect(String(fetchImpl.calls[0].headers?.['Authorization' as never])).toContain('sk_remote');
  });

  test('returns null on an API error instead of throwing into a page render', async () => {
    const rerank = createReranker({ env: {}, fetchImpl: fakeFetch({ status: 503, body: { error: 'loading' } }) });
    expect(await rerank!('q', ['a', 'b'])).toBeNull();
  });

  test('returns null when the server is not running at all', async () => {
    // the host has no llama-server yet. A refused connection must degrade to
    // the provider's own order, never surface as a page error.
    const rerank = createReranker({ env: {}, fetchImpl: fakeFetch(new Error('ECONNREFUSED')) });
    expect(await rerank!('q', ['a', 'b'])).toBeNull();
  });

  test('skips the round trip entirely for a single document', async () => {
    const fetchImpl = fakeFetch({ body: { results: [{ index: 0, relevance_score: 1 }] } });
    const rerank = createReranker({ env: {}, fetchImpl });
    expect(await rerank!('q', ['only one'])).toBeNull();
    expect(fetchImpl.calls).toHaveLength(0);
  });

  test('truncates long passages so a big pool cannot stall the query', async () => {
    const fetchImpl = fakeFetch({ body: { results: [{ index: 0, relevance_score: 1 }, { index: 1, relevance_score: 0 }] } });
    await createReranker({ env: {}, fetchImpl })!('q', ['x'.repeat(5000), 'y']);
    const sent = JSON.parse(String(fetchImpl.calls[0].body));
    expect(sent.documents[0].length).toBe(1200);
  });
});
