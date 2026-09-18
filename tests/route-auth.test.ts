import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Every mutating API handler (POST/PUT/PATCH/DELETE) must authenticate before
 * doing work. This net fails the build if a new mutating route ships without a
 * requireSession() guard — the failure mode that left the whole API open.
 *
 * The ManyChat webhook is the one exception: it is a machine-to-machine push
 * that cannot carry the operator's session cookie, so it authenticates with the
 * required MANYCHAT_WEBHOOK_SECRET (see its route + test) instead.
 */
const SECRET_AUTHENTICATED = new Set(['webhooks/manychat']);
const MUTATING = /export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/;

function routeFiles(dir: string, base = ''): { route: string; file: string }[] {
  const out: { route: string; file: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...routeFiles(path.join(dir, entry.name), rel));
    else if (entry.name === 'route.ts') out.push({ route: rel.replace(/\/route\.ts$/, ''), file: path.join(dir, entry.name) });
  }
  return out;
}

const apiDir = path.join(process.cwd(), 'app', 'api');
const mutatingRoutes = routeFiles(apiDir)
  .map((r) => ({ ...r, src: readFileSync(r.file, 'utf8') }))
  .filter((r) => MUTATING.test(r.src));

describe('every mutating API route authenticates', () => {
  test('there are mutating routes to check (net is live)', () => {
    expect(mutatingRoutes.length).toBeGreaterThan(10);
  });

  test.each(mutatingRoutes.filter((r) => !SECRET_AUTHENTICATED.has(r.route)))(
    '$route calls requireSession',
    ({ src }) => {
      expect(src).toContain("from '@/lib/session'");
      expect(src).toMatch(/requireSession\(/);
    },
  );

  test.each(mutatingRoutes.filter((r) => SECRET_AUTHENTICATED.has(r.route)))(
    '$route (webhook) authenticates via the required shared secret',
    ({ src }) => {
      expect(src).toContain('MANYCHAT_WEBHOOK_SECRET');
      expect(src).toContain('timingSafeEqual');
    },
  );
});
