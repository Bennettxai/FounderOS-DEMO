import { afterEach, describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb, type FounderDb } from '@/lib/db';
import { createRuntime, type RuntimeAgent } from '@/lib/agents/runtime';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

describe('agents table migration', () => {
  test('openDb upgrades a pre-hierarchy agents table in place', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'alex-migrate-')), 'old.db');
    const raw = new Database(file);
    raw.exec(`
      CREATE TABLE agents (
        id TEXT PRIMARY KEY,
        department_id TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        tier TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        tools TEXT NOT NULL DEFAULT '[]'
      );
      INSERT INTO agents VALUES ('legacy', 'dept-x', 'Legacy', 'r', 'active', 'lead', 'd', 'm', '[]');
    `);
    raw.close();

    db = openDb(file);
    const agents = db.agents.all();
    expect(agents).toHaveLength(1);
    expect(agents[0].parentId).toBeNull();
    expect(agents[0].instance).toBe('builtin');
  });
});

describe('agents repo: hierarchy fields', () => {
  test('round-trips parentId, instance, and the worker tier', () => {
    db = openDb(':memory:');
    db.departments.insert({ id: 'dept-x', name: 'X', slug: 'x', tagline: '', color: '#fff', order: 1 });
    db.agents.insert({
      id: 'parent-1', departmentId: 'dept-x', name: 'Parent', role: 'r', status: 'active',
      tier: 'lead', description: '', model: 'm', tools: [], parentId: null, instance: 'claude-code',
    });
    db.agents.insert({
      id: 'child-1', departmentId: 'dept-x', name: 'Child', role: 'r', status: 'active',
      tier: 'worker', description: '', model: 'm', tools: [], parentId: 'parent-1', instance: 'builtin',
    });
    const byId = new Map(db.agents.all().map((a) => [a.id, a]));
    expect(byId.get('child-1')?.parentId).toBe('parent-1');
    expect(byId.get('child-1')?.tier).toBe('worker');
    expect(byId.get('parent-1')?.instance).toBe('claude-code');
  });

  test('deleteWhereIdNotIn removes stale agents', () => {
    db = openDb(':memory:');
    db.departments.insert({ id: 'dept-x', name: 'X', slug: 'x', tagline: '', color: '#fff', order: 1 });
    for (const id of ['keep-1', 'stale-1']) {
      db.agents.insert({
        id, departmentId: 'dept-x', name: id, role: 'r', status: 'active',
        tier: 'lead', description: '', model: 'm', tools: [], parentId: null, instance: 'builtin',
      });
    }
    db.agents.deleteWhereIdNotIn(['keep-1']);
    expect(db.agents.all().map((a) => a.id)).toEqual(['keep-1']);
  });

  test('departments.deleteWhereIdNotIn removes stale departments', () => {
    db = openDb(':memory:');
    for (const [id, order] of [['dept-keep', 1], ['dept-stale', 2]] as const) {
      db.departments.insert({ id, name: id, slug: id, tagline: '', color: '#fff', order });
    }
    db.departments.deleteWhereIdNotIn(['dept-keep']);
    expect(db.departments.all().map((d) => d.id)).toEqual(['dept-keep']);
  });
});

describe('broadcasts', () => {
  const echo = (id: string, reply: string): RuntimeAgent => ({
    id,
    name: id,
    description: '',
    departmentId: 'dept-x',
    async run() {
      return { ok: true, summary: `status of ${id}` };
    },
    async respond(message: string) {
      return { ok: true, summary: `${reply}: ${message}` };
    },
  });

  const statusOnly: RuntimeAgent = {
    id: 'status-only',
    name: 'Status Only',
    description: '',
    departmentId: 'dept-x',
    async run() {
      return { ok: false, summary: 'no creds' };
    },
  };

  test('broadcast fans out to every agent, preferring respond() over run()', async () => {
    db = openDb(':memory:');
    const runtime = createRuntime(db, [echo('a1', 'a1 says'), statusOnly]);
    const result = await runtime.broadcast('what is going on?');

    expect(result.message).toBe('what is going on?');
    expect(result.replies).toHaveLength(2);
    const byAgent = new Map(result.replies.map((r) => [r.agentId, r]));
    expect(byAgent.get('a1')?.reply).toBe('a1 says: what is going on?');
    expect(byAgent.get('status-only')?.reply).toBe('no creds');
    expect(byAgent.get('status-only')?.ok).toBe(false);
  });

  test('broadcasts persist and come back newest-first with replies attached', async () => {
    db = openDb(':memory:');
    const runtime = createRuntime(db, [echo('a1', 'r')]);
    await runtime.broadcast('first');
    await runtime.broadcast('second');
    const recent = db.broadcasts.recent(5);
    expect(recent).toHaveLength(2);
    expect(recent[0].message).toBe('second');
    expect(recent[0].replies).toHaveLength(1);
    expect(recent[0].replies[0].agentId).toBe('a1');
  });

  test('a throwing agent records a failed reply without sinking the broadcast', async () => {
    db = openDb(':memory:');
    const boom: RuntimeAgent = {
      id: 'boom', name: 'Boom', description: '', departmentId: 'dept-x',
      async run(): Promise<never> {
        throw new Error('kaput');
      },
    };
    const runtime = createRuntime(db, [echo('a1', 'r'), boom]);
    const result = await runtime.broadcast('hello');
    const boomReply = result.replies.find((r) => r.agentId === 'boom');
    expect(boomReply?.ok).toBe(false);
    expect(boomReply?.reply).toContain('kaput');
    expect(result.replies).toHaveLength(2);
  });
});
