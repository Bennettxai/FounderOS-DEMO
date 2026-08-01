import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb } from '@/lib/db';
import { recentActivity } from '@/lib/agents/activity';

function seed() {
  const db = openDb(':memory:');
  db.agentRuns.insert({ id: 'r1', agentId: 'data-agent', startedAt: '2026-06-12T01:00:00Z', finishedAt: '2026-06-12T01:00:01Z', ok: true, summary: 'ran the audit' });
  db.agentMessages.insert({ id: 'm1', agentId: 'sales-agent', role: 'assistant', content: 'pipeline looks good', toolCalls: [], createdAt: '2026-06-12T02:00:00Z' });
  db.broadcasts.insert({ id: 'b1', message: 'status report', createdAt: '2026-06-12T03:00:00Z' });
  db.broadcasts.insertReply({ id: 'br1', broadcastId: 'b1', agentId: 'comms-agent', ok: true, reply: 'inbox clear', finishedAt: '2026-06-12T03:00:01Z' });
  return db;
}

describe('recentActivity', () => {
  test('merges runs, agent messages, and broadcast replies newest-first', () => {
    const events = recentActivity(seed(), 50);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.kind)).toEqual(['broadcast', 'message', 'run']);
    expect(events[0].agentId).toBe('comms-agent');
    expect(events[2].ok).toBe(true);
  });

  test('excludes user messages (the feed is what agents did)', () => {
    const db = seed();
    db.agentMessages.insert({ id: 'm2', agentId: 'sales-agent', role: 'user', content: 'hello?', toolCalls: [], createdAt: '2026-06-12T04:00:00Z' });
    const events = recentActivity(db, 50);
    expect(events.some((e) => e.summary === 'hello?')).toBe(false);
  });

  test('honors the limit, keeping the newest', () => {
    const events = recentActivity(seed(), 2);
    expect(events.map((e) => e.kind)).toEqual(['broadcast', 'message']);
  });
});

describe('GET /api/agents/activity', () => {
  beforeAll(() => {
    process.env.FOUNDER_OS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'founder-os-activity-')), 'test.db');
  });

  test('returns an events array', async () => {
    const { GET } = await import('@/app/api/agents/activity/route');
    const res = await GET(new Request('http://localhost/api/agents/activity?limit=5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.events)).toBe(true);
  });
});
