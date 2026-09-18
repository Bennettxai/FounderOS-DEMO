import { afterEach, describe, expect, test } from 'vitest';
import { createOptimalProvider, titleFromSnippet, type OptimalFetch } from '@/lib/connectors/optimal';
import { getBrainProvider } from '@/lib/brain';

type Route = (url: URL, init?: RequestInit) => { status?: number; body: unknown } | undefined;

/** A fetch stub routed on pathname, recording every call it saw. */
function fakeFetch(route: Route): OptimalFetch & { calls: { url: URL; init?: RequestInit }[] } {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const fn = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const hit = route(url, init);
    if (!hit) return new Response('{"error":"API route not found"}', { status: 404 });
    return new Response(JSON.stringify(hit.body), {
      status: hit.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as OptimalFetch & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

const healthy = {
  status: 'up',
  live: true,
  'ok?': true,
  checks: { store: ':ok', credential_key: ':ok', migrations: ':ok' },
  degraded: [],
};

const workspaces = {
  tenant_id: 'default',
  workspaces: [
    { id: 'default', slug: 'default', name: 'Default workspace', organization_id: 'default', status: 'active' },
    { id: 'default:vantage', slug: 'vantage', name: 'Vantage', organization_id: 'founderos', status: 'active' },
    { id: 'default:founderos', slug: 'founderos', name: 'FounderOS', organization_id: 'founderos', status: 'active' },
  ],
  pagination: { total: 3, offset: 0, limit: 50 },
};

/** Shape of one `/api/grep` match, exactly as the engine returns it (sn_ratio is a number here, a string on /api/search). */
function hit(slug: string, snippet: string, score: number) {
  return { slug, scale: 'section', intent: null, sn_ratio: 0.6, modality: 'text', snippet, score };
}

function grepBody(results: unknown[]) {
  return { query: 'x', workspace_id: 'w', pagination: { offset: 0, total: results.length, limit: 8, has_more: false }, results };
}

afterEach(() => {
  delete process.env.BRAIN_PROVIDER;
  delete process.env.OPTIMAL_ENGINE_WORKSPACES;
});

describe('titleFromSnippet', () => {
  test('prefers a markdown heading, then a title: line, then the node slug', () => {
    expect(titleFromSnippet('# Northwind Logistics\n\nRobin Sample, $9,200', 'sales')).toBe('Northwind Logistics');
    expect(titleFromSnippet('id: rm-auth\ntitle: Auth + remote access\nquarter: 2026-Q4', 'knowledge-base')).toBe('Auth + remote access');
    expect(titleFromSnippet('just a paragraph with no heading', 'knowledge-base')).toBe('knowledge-base');
  });
});

describe('OptimalEngine brain provider', () => {
  test('BRAIN_PROVIDER=optimal selects it', () => {
    process.env.BRAIN_PROVIDER = 'optimal';
    expect(getBrainProvider().name).toBe('optimal');
  });

  test('status: connected when /api/health is ok, names the engine and its workspaces', async () => {
    const fetch = fakeFetch((url) => {
      if (url.pathname === '/api/health') return { body: healthy };
      if (url.pathname === '/api/workspaces') return { body: workspaces };
      return undefined;
    });
    const brain = createOptimalProvider({ fetch, baseUrl: 'http://engine.test:4200' });
    const status = await brain.status();
    expect(status.connected).toBe(true);
    expect(status.provider).toBe('optimal');
    expect(status.detail).toMatch(/optimal engine up/i);
    expect(status.detail).toMatch(/2 workspaces/); // the compat "default" workspace is not counted
  });

  test('status: disconnected, never throws, when the engine is unreachable', async () => {
    const fetch = (async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:4200');
    }) as unknown as OptimalFetch;
    const brain = createOptimalProvider({ fetch, baseUrl: 'http://engine.test:4200' });
    const status = await brain.status();
    expect(status.connected).toBe(false);
    expect(status.provider).toBe('optimal');
    expect(status.detail).toMatch(/ECONNREFUSED/);
  });

  test('status: a degraded engine reports connected=false with the degraded checks named', async () => {
    const fetch = fakeFetch((url) => {
      if (url.pathname === '/api/health')
        return { body: { ...healthy, 'ok?': false, degraded: ['migrations'], checks: { store: ':ok', migrations: ':pending' } } };
      if (url.pathname === '/api/workspaces') return { body: workspaces };
      return undefined;
    });
    const brain = createOptimalProvider({ fetch, baseUrl: 'http://engine.test:4200' });
    const status = await brain.status();
    expect(status.connected).toBe(false);
    expect(status.detail).toMatch(/migrations/);
  });

  test('search: greps every real workspace in parallel, merges by score, skips the compat default', async () => {
    const fetch = fakeFetch((url) => {
      if (url.pathname === '/api/workspaces') return { body: workspaces };
      if (url.pathname === '/api/grep') {
        const ws = url.searchParams.get('workspace');
        if (ws === 'default:vantage')
          return { body: grepBody([hit('sales', '# Vantage pricing\n\nTier three has no payment link yet', 0.42)]) };
        if (ws === 'default:founderos')
          return {
            body: grepBody([
              hit('knowledge-base', 'title: Cohort pricing\ndescription: $1,200 per seat', 0.91),
              hit('sessions', 'Session 6 is the integration session', 0.12),
            ]),
          };
        if (ws === 'default') throw new Error('the compat workspace must not be searched');
      }
      return undefined;
    });
    const brain = createOptimalProvider({ fetch, baseUrl: 'http://engine.test:4200' });
    const results = await brain.search('pricing');

    expect(results.map((r) => r.title)).toEqual(['Cohort pricing', 'Vantage pricing', 'sessions']);
    expect(results[0]).toEqual({
      title: 'Cohort pricing',
      snippet: 'title: Cohort pricing description: $1,200 per seat',
      source: 'optimal://default:founderos/knowledge-base',
      score: 0.91,
    });

    const greps = fetch.calls.filter((c) => c.url.pathname === '/api/grep');
    expect(greps.map((c) => c.url.searchParams.get('workspace')).sort()).toEqual(['default:founderos', 'default:vantage']);
    for (const c of greps) expect(c.url.searchParams.get('q')).toBe('pricing');
  });

  test('search: OPTIMAL_ENGINE_WORKSPACES pins the workspaces instead of discovering them', async () => {
    process.env.OPTIMAL_ENGINE_WORKSPACES = 'default:personal, default:vantage';
    const fetch = fakeFetch((url) => {
      if (url.pathname === '/api/workspaces') throw new Error('must not discover when pinned');
      if (url.pathname === '/api/grep') return { body: grepBody([hit('n', 'text', 0.5)]) };
      return undefined;
    });
    const brain = createOptimalProvider({ fetch, baseUrl: 'http://engine.test:4200' });
    await brain.search('anything');
    expect(fetch.calls.map((c) => c.url.searchParams.get('workspace')).sort()).toEqual(['default:personal', 'default:vantage']);
  });

  test('search: caps the merged list at 8, trims snippets to 400 chars, tolerates one workspace failing', async () => {
    const fetch = fakeFetch((url) => {
      if (url.pathname === '/api/workspaces') return { body: workspaces };
      if (url.pathname === '/api/grep') {
        const ws = url.searchParams.get('workspace');
        if (ws === 'default:vantage') return { status: 500, body: { error: 'boom' } };
        return { body: grepBody(Array.from({ length: 12 }, (_, i) => hit(`n${i}`, 'x'.repeat(1000), 1 - i / 100))) };
      }
      return undefined;
    });
    const brain = createOptimalProvider({ fetch, baseUrl: 'http://engine.test:4200' });
    const results = await brain.search('r');
    expect(results).toHaveLength(8);
    expect(results[0].title).toBe('n0');
    expect(results[0].snippet).toHaveLength(400);
  });

  test('search: empty query and an unreachable engine both resolve to [] without throwing', async () => {
    const down = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as OptimalFetch;
    const brain = createOptimalProvider({ fetch: down, baseUrl: 'http://engine.test:4200' });
    await expect(brain.search('')).resolves.toEqual([]);
    await expect(brain.search('northwind-logistics')).resolves.toEqual([]);
  });

  test('capture: posts a claims-first ingest into the capture workspace and returns the receipt', async () => {
    const fetch = fakeFetch((url, init) => {
      if (url.pathname === '/api/ingest') {
        const body = JSON.parse(String(init?.body));
        expect(init?.method).toBe('POST');
        expect(body.text).toBe('# Northwind Logistics\n\nRobin wants an on-site workshop');
        expect(body.title).toBe('Northwind Logistics');
        expect(body.workspace).toBe('default:personal');
        expect(body.extract_claims).toBe(true);
        return { body: { ok: true, signal_id: 'sig-1', genre: 'note', type: 'fact', entities: [], source_package_id: 'sp-9' } };
      }
      return undefined;
    });
    const brain = createOptimalProvider({ fetch, baseUrl: 'http://engine.test:4200', captureWorkspace: 'default:personal' });
    const outcome = await brain.capture({ text: 'Robin wants an on-site workshop', title: 'Northwind Logistics' });
    expect(outcome).toEqual({ ok: true, slug: 'sig-1', contentHash: 'sp-9' });
  });

  test('capture: empty text and an engine error both come back as ok:false', async () => {
    const fetch = fakeFetch(() => ({ status: 422, body: { ok: false, error: 'intake rejected' } }));
    const brain = createOptimalProvider({ fetch, baseUrl: 'http://engine.test:4200' });
    await expect(brain.capture({ text: '   ' })).resolves.toEqual({ ok: false, error: 'nothing to capture (empty content)' });
    const failed = await brain.capture({ text: 'something' });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error).toMatch(/intake rejected/);
  });
});
