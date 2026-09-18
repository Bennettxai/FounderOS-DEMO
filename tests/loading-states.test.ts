import { describe, expect, test } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Every route this app serves is `force-dynamic` (live connector/DB reads at
 * request time) and none of them had a `loading.tsx`. In the App Router that
 * combination means a sidebar click produces NO visual response at all until
 * the entire server render finishes -- the click looks dead even on a page
 * that only takes 500ms, because nothing paints in between. `loading.tsx`
 * fixes both halves at once: it is what Next shows INSTANTLY on navigation
 * (a real click response), and it is also the boundary Next needs in order
 * to prefetch anything for a dynamic route (the "preload while I'm using it"
 * ask) -- a fully dynamic page with no loading boundary has nothing to
 * prefetch up to.
 *
 * This is a coverage net in the same shape as the page/route smoke nets: it
 * walks app/ itself for the ground truth, so a new route cannot silently
 * ship without a loading state the way three routes just did.
 */

function firstLevelSegments(): string[] {
  const appDir = path.join(process.cwd(), 'app');
  return readdirSync(appDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('api'))
    .map((e) => e.name)
    .filter((name) => existsSync(path.join(appDir, name, 'page.tsx')));
}

describe('every top-level route has an instant loading state', () => {
  test('the segment list itself is not stale (catches a route the net forgot)', () => {
    // Every one of these appears in the smoke test's PAGES list today; if this
    // ever diverges, a route was added or removed without updating both nets.
    expect(firstLevelSegments().sort()).toEqual(
      [
        'adpilot', 'agents', 'analytics', 'blueprint', 'brain', 'brand-deals', 'chats', 'comms', 'content',
        'doctor', 'finances', 'funnel', 'integrations', 'org', 'personas',
        'reference', 'roadmap', 'skills', 'social', 'tasks', 'trading', 'usage',
        'workflows',
      ].sort(),
    );
  });

  test.each(firstLevelSegments())('app/%s has a sibling loading.tsx', (segment) => {
    expect(existsSync(path.join(process.cwd(), 'app', segment, 'loading.tsx'))).toBe(true);
  });

  test('the home route (app/page.tsx) has a loading.tsx too', () => {
    expect(existsSync(path.join(process.cwd(), 'app', 'loading.tsx'))).toBe(true);
  });

  test('every loading.tsx renders without throwing and needs no props', async () => {
    const segments = ['', ...firstLevelSegments()];
    for (const seg of segments) {
      const mod = (await import(`@/app/${seg ? seg + '/' : ''}loading`)) as { default: () => unknown };
      expect(() => mod.default()).not.toThrow();
    }
  });
});
