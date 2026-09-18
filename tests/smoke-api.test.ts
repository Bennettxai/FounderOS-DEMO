import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

beforeAll(() => {
  process.env.FOUNDER_OS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'founder-os-apismoke-')), 'test.db');
  process.env.FUNNEL_PROVIDER = 'seed'; // keep /api/funnel off the live Attio API in tests
  process.env.MEMORY_API_TOKEN = 'smoke-memory-token';
  process.env.MANYCHAT_WEBHOOK_SECRET = 'smoke-manychat-token';

  // /api/skills/[slug] reads real SKILL.md files off the host. On the operator's Mac
  // ~/.claude/skills/codex exists, on a CI runner nothing does, so the smoke
  // case 404'd there and passed here. Point the catalog at a fixture so the
  // route's 200 path is exercised identically on every machine.
  const skills = mkdtempSync(path.join(tmpdir(), 'founder-os-skills-'));
  mkdirSync(path.join(skills, 'codex'), { recursive: true });
  writeFileSync(
    path.join(skills, 'codex', 'SKILL.md'),
    '---\nname: codex\ndescription: Fixture skill for the API smoke test.\n---\n\n# Codex\n',
  );
  process.env.FOUNDER_OS_SKILLS_DIR = skills;
});

type RouteEntry = {
  route: string; // path under app/api, source of truth for coverage
  load: () => Promise<{ GET?: (req: Request, ctx?: any) => unknown }>;
  url: string; // includes any required query params
  params?: Record<string, string>; // for dynamic [param] routes
  headers?: Record<string, string>;
};

// Every app/api/**/route.ts that exports GET, with valid params so each returns
// a real 200 (not a 400/404 for a missing arg). Live-connector routes
// (connections, social/sync) must still answer 200 with honest state.
const ROUTES: RouteEntry[] = [
  { route: 'agents', load: () => import('@/app/api/agents/route'), url: 'http://localhost/api/agents' },
  { route: 'comms/digest', load: () => import('@/app/api/comms/digest/route'), url: 'http://localhost/api/comms/digest' },
  { route: 'comms/digest/read', load: () => import('@/app/api/comms/digest/read/route'), url: 'http://localhost/api/comms/digest/read' },
  { route: 'cron/tick', load: () => import('@/app/api/cron/tick/route'), url: 'http://localhost/api/cron/tick' },
  { route: 'agents/activity', load: () => import('@/app/api/agents/activity/route'), url: 'http://localhost/api/agents/activity?limit=5' },
  { route: 'agents/[id]/chat', load: () => import('@/app/api/agents/[id]/chat/route'), url: 'http://localhost/api/agents/data-agent/chat', params: { id: 'data-agent' } },
  { route: 'agents/failover', load: () => import('@/app/api/agents/failover/route'), url: 'http://localhost/api/agents/failover' },
  { route: 'agents/broadcast', load: () => import('@/app/api/agents/broadcast/route'), url: 'http://localhost/api/agents/broadcast' },
  { route: 'agents/work', load: () => import('@/app/api/agents/work/route'), url: 'http://localhost/api/agents/work?agentId=data-agent' },
  { route: 'board/deliverables', load: () => import('@/app/api/board/deliverables/route'), url: 'http://localhost/api/board/deliverables' },
  { route: 'board/live', load: () => import('@/app/api/board/live/route'), url: 'http://localhost/api/board/live' },
  { route: 'board/tasks', load: () => import('@/app/api/board/tasks/route'), url: 'http://localhost/api/board/tasks' },
  { route: 'brain', load: () => import('@/app/api/brain/route'), url: 'http://localhost/api/brain' },
  { route: 'brand-deals', load: () => import('@/app/api/brand-deals/route'), url: 'http://localhost/api/brand-deals' },
  { route: 'workflows', load: () => import('@/app/api/workflows/route'), url: 'http://localhost/api/workflows' },
  { route: 'blueprint', load: () => import('@/app/api/blueprint/route'), url: 'http://localhost/api/blueprint' },
  { route: 'brain/satellites', load: () => import('@/app/api/brain/satellites/route'), url: 'http://localhost/api/brain/satellites' },
  { route: 'adscout/saved', load: () => import('@/app/api/adscout/saved/route'), url: 'http://localhost/api/adscout/saved' },
  { route: 'adscout/watchlist', load: () => import('@/app/api/adscout/watchlist/route'), url: 'http://localhost/api/adscout/watchlist' },
  { route: 'brain/graph', load: () => import('@/app/api/brain/graph/route'), url: 'http://localhost/api/brain/graph' },
  { route: 'brain/overview', load: () => import('@/app/api/brain/overview/route'), url: 'http://localhost/api/brain/overview' },
  { route: 'comms', load: () => import('@/app/api/comms/route'), url: 'http://localhost/api/comms' },
  { route: 'comms/email/attachment', load: () => import('@/app/api/comms/email/attachment/route'), url: 'http://localhost/api/comms/email/attachment?account=inbox-1&threadId=smoke&uid=1&part=1' },
  { route: 'comms/email/search', load: () => import('@/app/api/comms/email/search/route'), url: 'http://localhost/api/comms/email/search?account=inbox-1&q=smoke' },
  { route: 'comms/email/thread', load: () => import('@/app/api/comms/email/thread/route'), url: 'http://localhost/api/comms/email/thread?account=inbox-1&threadId=smoke&uid=1' },
  { route: 'conductor/chat', load: () => import('@/app/api/conductor/chat/route'), url: 'http://localhost/api/conductor/chat' },
  { route: 'conductor/context', load: () => import('@/app/api/conductor/context/route'), url: 'http://localhost/api/conductor/context?path=/agents' },
  { route: 'connections', load: () => import('@/app/api/connections/route'), url: 'http://localhost/api/connections' },
  { route: 'plaud/ingest', load: () => import('@/app/api/plaud/ingest/route'), url: 'http://localhost/api/plaud/ingest' },
  { route: 'calls/archive', load: () => import('@/app/api/calls/archive/route'), url: 'http://localhost/api/calls/archive' },
  { route: 'contacts/tags', load: () => import('@/app/api/contacts/tags/route'), url: 'http://localhost/api/contacts/tags' },
  { route: 'departments', load: () => import('@/app/api/departments/route'), url: 'http://localhost/api/departments' },
  { route: 'funnel', load: () => import('@/app/api/funnel/route'), url: 'http://localhost/api/funnel' },
  { route: 'funnel/lead-message', load: () => import('@/app/api/funnel/lead-message/route'), url: 'http://localhost/api/funnel/lead-message?name=Smoke%20Test%20Lead' },
  { route: 'lead-magnets', load: () => import('@/app/api/lead-magnets/route'), url: 'http://localhost/api/lead-magnets' },
  { route: 'admin/keys', load: () => import('@/app/api/admin/keys/route'), url: 'http://localhost/api/admin/keys' },
  { route: 'life/map', load: () => import('@/app/api/life/map/route'), url: 'http://localhost/api/life/map' },
  { route: 'metrics', load: () => import('@/app/api/metrics/route'), url: 'http://localhost/api/metrics' },
  // No ?q= on purpose: the ambient brief must not touch the gbrain CLI at all.
  { route: 'memory', load: () => import('@/app/api/memory/route'), url: 'http://localhost/api/memory', headers: { Authorization: 'Bearer smoke-memory-token' } },
  { route: 'roadmap', load: () => import('@/app/api/roadmap/route'), url: 'http://localhost/api/roadmap' },
  { route: 'skills/[slug]', load: () => import('@/app/api/skills/[slug]/route'), url: 'http://localhost/api/skills/codex', params: { slug: 'codex' } },
  { route: 'trading', load: () => import('@/app/api/trading/route'), url: 'http://localhost/api/trading' },
  { route: 'trading/limits', load: () => import('@/app/api/trading/limits/route'), url: 'http://localhost/api/trading/limits' },
  { route: 'social', load: () => import('@/app/api/social/route'), url: 'http://localhost/api/social' },
  { route: 'social/[platform]', load: () => import('@/app/api/social/[platform]/route'), url: 'http://localhost/api/social/instagram', params: { platform: 'instagram' } },
  { route: 'social/history', load: () => import('@/app/api/social/history/route'), url: 'http://localhost/api/social/history?limit=6' },
  { route: 'social/posts', load: () => import('@/app/api/social/posts/route'), url: 'http://localhost/api/social/posts' },
  { route: 'social/series', load: () => import('@/app/api/social/series/route'), url: 'http://localhost/api/social/series?metric=audience' },
  { route: 'social/sync', load: () => import('@/app/api/social/sync/route'), url: 'http://localhost/api/social/sync' },
  { route: 'usage', load: () => import('@/app/api/usage/route'), url: 'http://localhost/api/usage' },
  { route: 'tools', load: () => import('@/app/api/tools/route'), url: 'http://localhost/api/tools' },
  { route: 'ventures', load: () => import('@/app/api/ventures/route'), url: 'http://localhost/api/ventures' },
  { route: 'webhooks/manychat', load: () => import('@/app/api/webhooks/manychat/route'), url: 'http://localhost/api/webhooks/manychat', headers: { 'x-manychat-secret': 'smoke-manychat-token' } },
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
  test.each(ROUTES)('GET /api/$route', async ({ load, url, params, headers }) => {
    const mod = await load();
    expect(mod.GET, 'route should export GET').toBeTypeOf('function');
    const res = (await mod.GET!(new Request(url, { headers }), { params })) as Response;
    expect(res.status, `GET ${url} should be 200 (honest state, not 500/400)`).toBe(200);
    const body = await res.json();
    expect(body && typeof body === 'object').toBe(true);
  }, 20_000);

  /**
   * OAuth endpoints answer with a 302 to the provider (or back to the board),
   * never with a JSON 200, so they cannot meet this net's contract. They are
   * named here rather than silently skipped, and the redirect suite in
   * tests/oauth-routes.test.ts is what actually covers them.
   */
  const REDIRECT_ROUTES = ['oauth/[provider]/start', 'oauth/callback'];

  test('the API smoke net covers every GET route under app/api (no route escapes)', () => {
    const discovered = discoverGetRoutes(path.join(process.cwd(), 'app', 'api'))
      .filter((r) => !REDIRECT_ROUTES.includes(r))
      .sort();
    const covered = ROUTES.map((r) => r.route).sort();
    expect(covered).toEqual(discovered);
  });
});
