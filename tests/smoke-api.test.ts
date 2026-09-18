import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

beforeAll(() => {
  process.env.FOUNDER_OS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'founder-os-apismoke-')), 'test.db');
});

type RouteEntry = {
  route: string; // path under app/api, source of truth for coverage
  load: () => Promise<{ GET?: (req: Request, ctx?: any) => unknown }>;
  url: string; // includes any required query params
  params?: Record<string, string>; // for dynamic [param] routes
};

// Every app/api/**/route.ts that exports GET, with valid params so each returns
// a real 200 (not a 400/404 for a missing arg). Live-connector routes
// (connections, social/sync) must still answer 200 with honest state.
const ROUTES: RouteEntry[] = [
  { route: 'agents', load: () => import('@/app/api/agents/route'), url: 'http://localhost/api/agents' },
  { route: 'agents/activity', load: () => import('@/app/api/agents/activity/route'), url: 'http://localhost/api/agents/activity?limit=5' },
  { route: 'agents/broadcast', load: () => import('@/app/api/agents/broadcast/route'), url: 'http://localhost/api/agents/broadcast' },
  { route: 'agents/work', load: () => import('@/app/api/agents/work/route'), url: 'http://localhost/api/agents/work?agentId=data-agent' },
  { route: 'connections', load: () => import('@/app/api/connections/route'), url: 'http://localhost/api/connections' },
  { route: 'departments', load: () => import('@/app/api/departments/route'), url: 'http://localhost/api/departments' },
  { route: 'keys', load: () => import('@/app/api/keys/route'), url: 'http://localhost/api/keys' },
  { route: 'tools', load: () => import('@/app/api/tools/route'), url: 'http://localhost/api/tools' },
];

function discoverGetRoutes(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...discoverGetRoutes(path.join(dir, entry.name), rel));
    else if (entry.name === 'route.ts') {
      const src = readFileSync(path.join(dir, entry.name), 'utf8');
      if (/export\s+(async\s+)?function\s+GET/.test(src)) out.push(rel.replace(/\/route\.ts$/, ''));
    }
  }
  return out;
}

describe('platform smoke — every GET API route answers 200 with JSON', () => {
  test.each(ROUTES)('GET /api/$route', async ({ load, url, params }) => {
    const mod = await load();
    expect(mod.GET, 'route should export GET').toBeTypeOf('function');
    const res = (await mod.GET!(new Request(url), { params })) as Response;
    expect(res.status, `GET ${url} should be 200 (honest state, not 500/400)`).toBe(200);
    const body = await res.json();
    expect(body && typeof body === 'object').toBe(true);
  }, 20_000);

  test('the API smoke net covers every GET route under app/api (no route escapes)', () => {
    // skills/[slug] reads the local ~/.claude/skills dir at runtime (404 without
    // a slug on disk), so it is not a 200-required smoke route.
    const IGNORE = new Set(['skills/[slug]']);
    const discovered = discoverGetRoutes(path.join(process.cwd(), 'app', 'api')).filter((r) => !IGNORE.has(r)).sort();
    const covered = ROUTES.map((r) => r.route).sort();
    expect(covered).toEqual(discovered);
  });
});
