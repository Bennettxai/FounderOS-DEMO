import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

function seeded(): FounderDb {
  db = openDb(':memory:');
  seedDatabase(db);
  return db;
}

function withSalesDept(): FounderDb {
  db = openDb(':memory:');
  db.departments.insert({
    id: 'dept-sales', name: 'Sales', slug: 'sales', tagline: 'Pipeline and deals.', color: '#fafafa', order: 1,
  });
  return db;
}

describe('people + sopTasks repos', () => {
  test('empty db has queryable people and sop_tasks tables', () => {
    db = openDb(':memory:');
    expect(db.people.all()).toEqual([]);
    expect(db.sopTasks.all()).toEqual([]);
  });

  test('round-trips a person including their tools array', () => {
    const d = withSalesDept();
    const person = {
      id: 'person-marco',
      departmentId: 'dept-sales',
      name: 'Marco',
      role: 'Head of Sales',
      tools: ['fathom', 'attio'],
    };
    d.people.insert(person);
    expect(d.people.all()).toEqual([person]);
  });

  test('round-trips a task including its written-out steps', () => {
    const d = withSalesDept();
    const task = {
      id: 'sop-close-calls',
      departmentId: 'dept-sales',
      title: 'Run discovery & close calls',
      summary: 'Live sales calls from booked to closed-won.',
      steps: ['Review the lead in Attio', 'Run the discovery script', 'Log outcome + next step'],
      assigneeKind: 'person' as const,
      assigneeId: 'person-marco',
    };
    d.sopTasks.insert(task);
    expect(d.sopTasks.all()).toEqual([task]);
  });

  test('rejects a task whose SOP has fewer than 3 written-out steps', () => {
    const d = withSalesDept();
    expect(() =>
      d.sopTasks.insert({
        id: 'sop-thin',
        departmentId: 'dept-sales',
        title: 'Underspecified job',
        summary: '',
        steps: ['only one step'],
        assigneeKind: 'agent',
        assigneeId: 'sales-agent',
      }),
    ).toThrow();
  });
});

describe('seeded SOP graph data', () => {
  test('seeding is idempotent for people and tasks', () => {
    const d = seeded();
    const people = d.people.all().length;
    const tasks = d.sopTasks.all().length;
    expect(people).toBeGreaterThan(0);
    expect(tasks).toBeGreaterThan(0);
    seedDatabase(d);
    expect(d.people.all().length).toBe(people);
    expect(d.sopTasks.all().length).toBe(tasks);
  });

  test('every task assignee exists and belongs to the task department', () => {
    const d = seeded();
    const agents = new Map(d.agents.all().map((a) => [a.id, a.departmentId]));
    const people = new Map(d.people.all().map((p) => [p.id, p.departmentId]));
    for (const t of d.sopTasks.all()) {
      const dept = t.assigneeKind === 'agent' ? agents.get(t.assigneeId) : people.get(t.assigneeId);
      expect(dept, `${t.id} assignee ${t.assigneeId} missing`).toBeDefined();
      expect(dept, `${t.id} assignee ${t.assigneeId} in wrong department`).toBe(t.departmentId);
    }
  });

  test('monogamy: no worker (human or agent) is assigned more than one task', () => {
    const d = seeded();
    const seen = new Set<string>();
    for (const t of d.sopTasks.all()) {
      const key = `${t.assigneeKind}:${t.assigneeId}`;
      expect(seen.has(key), `${key} assigned to more than one task`).toBe(false);
      seen.add(key);
    }
  });

  test('every agent has exactly one task', () => {
    const d = seeded();
    const assigned = d.sopTasks.all().filter((t) => t.assigneeKind === 'agent').map((t) => t.assigneeId);
    expect(assigned.sort()).toEqual(d.agents.all().map((a) => a.id).sort());
  });

  test('every person has exactly one task and at least one tool', () => {
    const d = seeded();
    const assigned = d.sopTasks.all().filter((t) => t.assigneeKind === 'person').map((t) => t.assigneeId);
    expect(assigned.sort()).toEqual(d.people.all().map((p) => p.id).sort());
    for (const p of d.people.all()) {
      expect(p.tools.length, `${p.id} has no tools`).toBeGreaterThan(0);
    }
  });

  test('every seeded SOP is built out: at least 5 concrete steps, none thin', () => {
    const d = seeded();
    for (const t of d.sopTasks.all()) {
      expect(t.steps.length, `${t.id} has only ${t.steps.length} steps`).toBeGreaterThanOrEqual(5);
      for (const s of t.steps) {
        expect(s.length, `${t.id} step too thin: "${s}"`).toBeGreaterThanOrEqual(20);
      }
    }
  });

  test('person tools stay inside the tool namespace agents already use', () => {
    const d = seeded();
    const known = new Set(d.agents.all().flatMap((a) => a.tools));
    for (const p of d.people.all()) {
      for (const slug of p.tools) {
        expect(known.has(slug), `${p.id} tool ${slug} unknown to the org`).toBe(true);
      }
    }
  });
});
