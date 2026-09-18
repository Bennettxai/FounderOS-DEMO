import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Mock 5e (the operator, 2026-09-07): /chats becomes the mock's messenger. The
 * rail gets a search-threads box and a + for a fresh thread, every row a
 * status dot with the board Conductor pinned; the thread pane header carries
 * a live dot plus the board model tag and an open-on-board link; agent
 * bubbles get a name eyebrow; the composer states its keys. Real plumbing
 * stays: agent chat API, cockpit Conductor thread, live conductorModel.
 */
describe('/chats mock-5e: rail search + new thread', () => {
  const hub = read('components/ChatHub.tsx');

  test('the rail has a search-threads box that filters rows', () => {
    expect(hub).toContain('search threads');
    expect(hub).toMatch(/toLowerCase\(\)/);
  });

  test('a + button opens the fresh-thread picker', () => {
    expect(hub).toMatch(/title="New chat"/);
    expect(hub).toMatch(/<Plus\b/);
  });
});

describe('/chats mock-5e: rail rows', () => {
  const hub = read('components/ChatHub.tsx');

  test('every row leads with a status dot', () => {
    expect(hub).toContain('railDot');
  });

  test('the Conductor row is pinned, not timestamped', () => {
    expect(hub).toContain("'pinned'");
  });
});

describe('/chats mock-5e: thread pane', () => {
  const hub = read('components/ChatHub.tsx');

  test('the agent thread header leads with a status dot', () => {
    expect(hub).toContain('headerDot');
  });

  test('agent bubbles carry a name eyebrow like the Conductor thread', () => {
    expect(hub).toMatch(/toUpperCase\(\)/);
  });
});

describe('/chats mock-5e: Conductor header goes to the board', () => {
  const cc = read('components/ConductorChat.tsx');

  test('a live dot and the board model tag sit in the header', () => {
    expect(cc).toMatch(/bg-os-ok/);
    expect(cc).toMatch(/board · \{/);
  });

  test('an open-on-board link renders when the board URL is known', () => {
    expect(cc).toContain('boardUrl');
    expect(cc).toMatch(/open on board/);
  });

  test('the hub and page thread the real board URL through', () => {
    expect(read('components/ChatHub.tsx')).toContain('boardUrl');
    expect(read('app/chats/page.tsx')).toContain('PAPERCLIP_API_URL');
  });
});

describe('/chats mock-5e: composer states its keys', () => {
  test('Enter sends, Shift+Enter breaks · said out loud', () => {
    expect(read('components/ConductorComposer.tsx')).toContain('Enter sends · Shift+Enter breaks');
  });
});
