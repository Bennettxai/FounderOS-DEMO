import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

describe('openDb', () => {
  test('creates an empty database with all tables queryable', () => {
    db = openDb(':memory:');
    expect(db.departments.all()).toEqual([]);
    expect(db.agents.all()).toEqual([]);
    expect(db.tools.all()).toEqual([]);
    expect(db.roadmap.all()).toEqual([]);
    expect(db.metrics.all()).toEqual([]);
    expect(db.domains.all()).toEqual([]);
    expect(db.phases.all()).toEqual([]);
  });

  test('round-trips an agent including its tools array', () => {
    db = openDb(':memory:');
    db.departments.insert({
      id: 'dept-tech',
      name: 'Tech & Automations',
      slug: 'tech',
      tagline: 'Build the machine that builds.',
      color: '#3b82f6',
      order: 1,
    });
    const agent = {
      id: 'agent-command-center',
      departmentId: 'dept-tech',
      name: 'Command Center',
      role: 'Chief Orchestrator',
      status: 'active' as const,
      tier: 'lead' as const,
      description: 'Routes work across the agent fleet via OpenClaw.',
      model: 'claude-fable-5',
      tools: ['openclaw', 'mcp'],
      parentId: null,
      instance: 'builtin',
    };
    db.agents.insert(agent);
    expect(db.agents.all()).toEqual([agent]);
  });

  test('lists agents scoped to a department', () => {
    db = openDb(':memory:');
    db.departments.insert({
      id: 'dept-a',
      name: 'A',
      slug: 'a',
      tagline: '',
      color: '#fff',
      order: 1,
    });
    db.departments.insert({
      id: 'dept-b',
      name: 'B',
      slug: 'b',
      tagline: '',
      color: '#fff',
      order: 2,
    });
    const base = {
      role: 'r',
      status: 'idle' as const,
      tier: 'specialist' as const,
      description: '',
      model: 'm',
      tools: [],
      parentId: null,
      instance: 'builtin',
    };
    db.agents.insert({ ...base, id: 'a1', departmentId: 'dept-a', name: 'A1' });
    db.agents.insert({ ...base, id: 'b1', departmentId: 'dept-b', name: 'B1' });
    expect(db.agents.byDepartment('dept-a').map((a) => a.id)).toEqual(['a1']);
  });

  test('returns departments ordered by their order column', () => {
    db = openDb(':memory:');
    db.departments.insert({
      id: 'second',
      name: 'Second',
      slug: 's2',
      tagline: '',
      color: '#fff',
      order: 2,
    });
    db.departments.insert({
      id: 'first',
      name: 'First',
      slug: 's1',
      tagline: '',
      color: '#fff',
      order: 1,
    });
    expect(db.departments.all().map((d) => d.id)).toEqual(['first', 'second']);
  });

  test('round-trips a business reference model domain with items array', () => {
    db = openDb(':memory:');
    const domain = {
      id: 'brm-9',
      number: 9,
      title: 'Legal',
      color: '#fbbf24',
      items: ['Contracts', 'Compliance'],
    };
    db.domains.insert(domain);
    expect(db.domains.all()).toEqual([domain]);
  });
});
