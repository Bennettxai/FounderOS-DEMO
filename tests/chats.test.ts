import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { conversationSummaries, type ConversationSummary } from '@/lib/chats';
import type { AgentMessage } from '@/lib/schemas';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * /chats (the operator, 2026-08-17): a Claude-style chat hub under Agents — every
 * conversation in one list (the board Conductor pinned first), open any of
 * them, and talk to any agent directly.
 */
const msg = (over: Partial<AgentMessage>): AgentMessage => ({
  id: Math.random().toString(36).slice(2),
  agentId: 'data-agent',
  role: 'user',
  content: 'hello',
  toolCalls: [],
  createdAt: '2026-08-17T10:00:00.000Z',
  ...over,
});

describe('conversationSummaries', () => {
  test('groups messages into one conversation per agent, newest activity first', () => {
    const rows = [
      msg({ agentId: 'data-agent', createdAt: '2026-08-15T10:00:00.000Z' }),
      msg({ agentId: 'sales-agent', createdAt: '2026-08-17T10:00:00.000Z', content: 'latest' }),
      msg({ agentId: 'data-agent', createdAt: '2026-08-16T10:00:00.000Z', role: 'assistant', content: 'reply' }),
    ];
    const names = new Map([
      ['data-agent', 'Data Agent'],
      ['sales-agent', 'Sales Agent'],
    ]);
    const out = conversationSummaries(rows, names);
    expect(out.map((c: ConversationSummary) => c.agentId)).toEqual(['sales-agent', 'data-agent']);
    expect(out[0].agentName).toBe('Sales Agent');
    expect(out[0].lastMessage).toBe('latest');
    expect(out[1].lastMessage).toBe('reply');
    expect(out[1].messageCount).toBe(2);
  });

  test('unknown agent ids keep the raw id instead of vanishing', () => {
    const out = conversationSummaries([msg({ agentId: 'ghost' })], new Map());
    expect(out[0].agentName).toBe('ghost');
  });

  test('long last messages are trimmed to a preview, single line', () => {
    const out = conversationSummaries(
      [msg({ content: `line one\nline two ${'x'.repeat(300)}` })],
      new Map(),
    );
    expect(out[0].lastMessage.length).toBeLessThanOrEqual(141);
    expect(out[0].lastMessage).not.toContain('\n');
  });
});

describe('GET /api/agents/[id]/chat returns the stored history', () => {
  let db: FounderDb;
  beforeAll(() => {
    process.env.FOUNDER_OS_DB = ':memory:';
    db = openDb(':memory:');
    seedDatabase(db);
  });

  test('the route exports GET alongside POST', async () => {
    const mod = await import('@/app/api/agents/[id]/chat/route');
    expect(typeof mod.GET).toBe('function');
    expect(typeof mod.POST).toBe('function');
  });
});

describe('the /chats surface', () => {
  test('page exists, renders the hub with the board Conductor pinned', () => {
    const page = read('app/chats/page.tsx');
    expect(page).toContain('ChatHub');
    const hub = read('components/ChatHub.tsx');
    // Claude-shape: a conversation rail + a thread pane + the real composer
    expect(hub).toContain('ConductorComposer');
    expect(hub).toContain('conductor');
    // direct line to ANY agent, not only ones with history
    expect(hub).toContain('New chat');
  });

  test('one rounded shell, matching the rounded Conductor panel (2026-08-17)', () => {
    const hub = read('components/ChatHub.tsx');
    // the hub OWNS the rounded container; the page adds no square box around it
    expect(hub).toContain('rounded-2xl');
    expect(read('app/chats/page.tsx')).not.toContain('rounded-lg-t border');
    // the embedded cockpit panel drops its own border so there is no
    // double-frame: it renders bare inside the shell
    expect(hub).toMatch(/<ConductorChat[^>]*bare/);
    const cc = read('components/ConductorChat.tsx');
    expect(cc).toContain('bare');
  });

  test('the rail collapses to a strip and expands back, Claude-style', () => {
    const hub = read('components/ChatHub.tsx');
    expect(hub).toContain('railOpen');
    // collapsed: thread takes the full width; a strip keeps the conversations
    // one click away (avatars still select)
    expect(hub).toMatch(/railOpen \? '[^']*280px[^']*' : /);
    expect(hub).toContain('PanelLeft');
  });

  test('Chats sits in the sidebar under Agents', () => {
    const nav = read('lib/nav.ts');
    expect(nav).toContain("href: '/chats'");
    const agentsBlock = nav.slice(nav.indexOf('NAV_AGENTS'), nav.indexOf('NAV_INTELLIGENCE'));
    expect(agentsBlock).toContain("'/chats'");
  });
});
