import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EMAIL_CACHE_TTL_MS, invalidateEmailCache, latestEmails } from '@/lib/connectors/email';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * /comms is server-rendered, so every page view paid for four fresh IMAP round
 * trips. Measured on the host: 9.5s, while every other page was under 0.4s.
 * Deepening the feed to 40 per inbox made it worse, so the fix is to stop
 * blocking on it — not to give the depth back.
 */
describe('comms email caching', () => {
  /**
   * Measured: a cold /comms render is 18.4s, warm is 0.63s. So the window must
   * OUTLIVE the 15-minute sweep — otherwise whoever opens the page first after
   * an expiry eats the 18s. The sweep repopulates it before it can lapse, so
   * freshness is bounded by the sweep cadence rather than by this number.
   */
  test('the window outlives the 15-minute sweep that refills it', () => {
    expect(EMAIL_CACHE_TTL_MS).toBeGreaterThan(15 * 60_000);
  });

  test('the sweep warms comms, so the background job pays the cold cost', () => {
    const route = read('app/api/analytics/refresh/route.ts');
    expect(route).toMatch(/latestEmails\(40\)/);
    expect(route).toMatch(/unreadCounts\(\)/);
    expect(route).toMatch(/recentMessages\(30\)/);
    // allSettled: one dead connector must not abort the whole sweep
    expect(route).toMatch(/Promise\.allSettled/);
  });

  test('with no inboxes configured it stays empty and caches nothing', async () => {
    invalidateEmailCache();
    const items = await latestEmails(40, {});
    expect(items).toEqual([]);
  });

  test('an empty result is never cached, so one bad fetch cannot pin a blank page', () => {
    const src = read('lib/connectors/email.ts');
    expect(src).toMatch(/if \(items\.length > 0\) emailCache =/);
  });

  test('asking for MORE than is cached refetches, rather than being served less', () => {
    // >= not ===: a deeper cache answers a shallower request, but never the
    // other way round, or the feed would silently lose messages.
    const src = read('lib/connectors/email.ts');
    expect(src).toMatch(/emailCache\.limit >= limitPerInbox/);
    expect(src).not.toMatch(/emailCache\.limit <=/);
  });

  test('the per-inbox unread counts are cached too, not just the messages', () => {
    const src = read('lib/connectors/email.ts');
    expect(src).toMatch(/if \(unreadCache && now - unreadCache\.at < EMAIL_CACHE_TTL_MS\)/);
    // only kept when at least one inbox answered
    expect(src).toMatch(/if \(counts\.some\(\(c\) => !c\.error\)\) unreadCache =/);
  });

  test('sending a reply drops the cache instead of waiting out the window', () => {
    const route = read('app/api/comms/reply/route.ts');
    expect(route).toMatch(/if \(result\.ok\) invalidateEmailCache\(\)/);
  });
});

/**
 * The caches live in process memory, so a restart empties them — and this box
 * is redeployed often, by more than one agent. Without a boot warm-up the first
 * person to open comms after any deploy pays the ~20s cold render until the
 * 15-minute sweep happens to come round.
 */
describe('boot warm-up', () => {
  const inst = read('instrumentation.ts');

  test('primes by calling the refresh route, not by importing the connectors', () => {
    // importing imapflow here breaks the BUILD: instrumentation is bundled for
    // the edge runtime too and cannot resolve node's 'stream'. A runtime guard
    // is too late — the import is traced at build time.
    expect(inst).toMatch(/api\/analytics\/refresh/);
    expect(inst).not.toMatch(/from '@\/lib\/connectors/);
    expect(inst).not.toMatch(/import\('@\/lib\/connectors/);
  });

  test('never blocks the server becoming ready', () => {
    expect(inst).toMatch(/setTimeout\(/);
    expect(inst).toMatch(/\.catch\(/);
  });

  test('only runs on the node runtime, and can be switched off', () => {
    expect(inst).toMatch(/NEXT_RUNTIME !== 'nodejs'/);
    expect(inst).toMatch(/FOUNDER_OS_SKIP_WARMUP/);
  });

  test('the hook is actually enabled, or the file never runs', () => {
    expect(read('next.config.mjs')).toMatch(/instrumentationHook: true/);
  });
});

/**
 * The home feed asks for latestEmails(5) / recentChats(15) / recentMessages(15)
 * while /comms asks for 40/40/30. An exact-match cache meant home missed every
 * warmed entry and paid the full cost — measured at 18.2s on the home page
 * while /comms was already 0.6s.
 */
describe('a deeper cache answers a shallower request', () => {
  test('email serves a superset rather than refetching', () => {
    expect(read('lib/connectors/email.ts')).toMatch(/emailCache\.limit >= limitPerInbox/);
  });

  test('slack serves a superset, sliced to what was asked for', () => {
    const src = read('lib/connectors/slack.ts');
    expect(src).toMatch(/messageCache\.limit >= limit/);
    expect(src).toMatch(/messageCache\.items\.slice\(0, limit\)/);
  });

  test('whatsapp is cached at all now, and follows the same rule', () => {
    const src = read('lib/connectors/whatsapp.ts');
    expect(src).toMatch(/chatCache\.limit >= limit/);
    // the read path is worthless without a write-back
    expect(src).toMatch(/if \(items\.length > 0\) chatCache =/);
  });

  test('the sweep warms at the deepest limit any caller uses', () => {
    const route = read('app/api/analytics/refresh/route.ts');
    expect(route).toMatch(/recentChats\(40\)/);
  });
});

/**
 * The same trap, a different page: /brain's buildBrainGraph over the whole
 * store+vault (~9s, 1,974 combined notes as of 2026-09-06) was cached, but the
 * cache lived only inside the page component with nothing able to warm it —
 * every TTL expiry put the full 9s in whoever's next click.
 */
describe('the sweep warms brain too', () => {
  test('the refresh route calls warmBrainConstellation', () => {
    const route = read('app/api/analytics/refresh/route.ts');
    expect(route).toMatch(/warmBrainConstellation\(\)/);
    expect(route).toMatch(/from '@\/lib\/brain-constellation'/);
  });

  test('the page reads through the shared cache, not a page-local one', () => {
    const page = read('app/brain/page.tsx');
    expect(page).toMatch(/import \{ memoryConstellation, wikiFor \} from '@\/lib\/brain-constellation'/);
    expect(page).not.toMatch(/let memoryCache/);
    expect(page).not.toMatch(/let wikiCache/);
  });
});
