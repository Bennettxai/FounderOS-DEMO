import { describe, expect, test } from 'vitest';
import { defaultReranker, retrieveBrain, RETRIEVE_POOL, RETRIEVE_TOP } from '@/lib/brain-retrieval';
import type { BrainProvider, BrainSearchResult } from '@/lib/brain';

function results(...titles: string[]): BrainSearchResult[] {
  return titles.map((title, i) => ({
    title,
    snippet: `body of ${title}`,
    source: 'gbrain',
    score: 0.9 - i * 0.01,
  }));
}

function provider(hits: BrainSearchResult[]): BrainProvider & { queries: string[] } {
  const queries: string[] = [];
  return {
    name: 'fake',
    queries,
    async status() {
      return { connected: true, provider: 'fake', detail: 'ok' };
    },
    async search(q: string) {
      queries.push(q);
      return hits;
    },
  };
}

describe('retrieveBrain', () => {
  test('cuts the provider pool down to the top few', async () => {
    const hits = results(...Array.from({ length: 15 }, (_, i) => `page-${i}`));
    const out = await retrieveBrain(provider(hits), 'anything', { rerank: null });
    expect(out.hits).toHaveLength(RETRIEVE_TOP);
    expect(out.hits[0].title).toBe('page-0');
  });

  test('keeps provider order and says so when there is no reranker', async () => {
    const out = await retrieveBrain(provider(results('a', 'b', 'c')), 'q', { rerank: null });
    expect(out.ranked).toBe('provider');
    expect(out.hits.map((h) => h.title)).toEqual(['a', 'b', 'c']);
    expect(out.hits[0].rerankScore).toBeUndefined();
  });

  test('reorders by rerank score and reports that it did', async () => {
    // the third hit is the one that actually answers the question
    const rerank = async () => [0.1, 0.2, 0.95];
    const out = await retrieveBrain(provider(results('noise', 'more noise', 'the answer')), 'q', { rerank, top: 2 });
    expect(out.ranked).toBe('rerank');
    expect(out.hits.map((h) => h.title)).toEqual(['the answer', 'more noise']);
    expect(out.hits[0].rerankScore).toBe(0.95);
  });

  test('reranks the title and snippet together, so a bare slug still gets judged', async () => {
    let seen: string[] = [];
    const rerank = async (_q: string, docs: string[]) => {
      seen = docs;
      return docs.map(() => 0.5);
    };
    await retrieveBrain(provider(results('sops/pricing')), 'q', { rerank });
    expect(seen[0]).toContain('sops/pricing');
    expect(seen[0]).toContain('body of sops/pricing');
  });

  test('falls back to provider order when the reranker returns null', async () => {
    const out = await retrieveBrain(provider(results('a', 'b')), 'q', { rerank: async () => null });
    expect(out.ranked).toBe('provider');
    expect(out.hits.map((h) => h.title)).toEqual(['a', 'b']);
  });

  test('falls back to provider order when the reranker throws', async () => {
    const out = await retrieveBrain(provider(results('a', 'b')), 'q', {
      rerank: async () => {
        throw new Error('rerank exploded');
      },
    });
    expect(out.ranked).toBe('provider');
    expect(out.hits).toHaveLength(2);
  });

  test('never sends more than the pool to the reranker', async () => {
    let count = 0;
    const rerank = async (_q: string, docs: string[]) => {
      count = docs.length;
      return docs.map((_, i) => 1 - i / 100);
    };
    const hits = results(...Array.from({ length: 40 }, (_, i) => `page-${i}`));
    await retrieveBrain(provider(hits), 'q', { rerank });
    expect(count).toBe(RETRIEVE_POOL);
  });

  test('an empty result set is not an error and costs no rerank call', async () => {
    let called = false;
    const out = await retrieveBrain(provider([]), 'q', {
      rerank: async () => {
        called = true;
        return null;
      },
    });
    expect(out.hits).toEqual([]);
    expect(out.ranked).toBe('provider');
    expect(called).toBe(false);
  });

  test('a blank query never reaches the provider', async () => {
    const p = provider(results('a'));
    const out = await retrieveBrain(p, '   ', { rerank: null });
    expect(out.hits).toEqual([]);
    expect(p.queries).toEqual([]);
  });

  test('a provider that throws yields no hits rather than a broken page', async () => {
    const broken: BrainProvider = {
      name: 'broken',
      async status() {
        return { connected: false, provider: 'broken', detail: 'down' };
      },
      async search() {
        throw new Error('supabase paused');
      },
    };
    const out = await retrieveBrain(broken, 'q', { rerank: null });
    expect(out.hits).toEqual([]);
    // and it says WHY, so an honest caller can report a down store as down
    expect(out.error).toContain('supabase paused');
  });
});

describe('defaultReranker', () => {
  test('is off inside the test runner, so the suite never bills a paid API', () => {
    expect(defaultReranker()).toBeNull();
  });

  test('honours an explicit off switch', () => {
    const previous = process.env.BRAIN_RERANK;
    process.env.BRAIN_RERANK = '0';
    try {
      expect(defaultReranker()).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.BRAIN_RERANK;
      else process.env.BRAIN_RERANK = previous;
    }
  });
});

describe('GET /api/brain?q= reads through the hub', () => {
  test('reports how the hits were ordered and caps them at the top few', async () => {
    const previous = process.env.BRAIN_PROVIDER;
    process.env.BRAIN_PROVIDER = 'stub';
    try {
      const { GET } = await import('@/app/api/brain/route');
      const res = await GET(new Request('http://localhost/api/brain?q=vantage%20pricing'));
      const body = await res.json();
      expect(body.ranked).toBe('provider');
      expect(body.results.length).toBeLessThanOrEqual(RETRIEVE_TOP);
    } finally {
      if (previous === undefined) delete process.env.BRAIN_PROVIDER;
      else process.env.BRAIN_PROVIDER = previous;
    }
  });
});
