import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import type { Workflow } from '@/lib/schemas';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

function workflow(id: string, overrides: Partial<Workflow> = {}): Workflow {
  return {
    id,
    name: 'Test workflow',
    subtitle: 'A workflow built for a round-trip test.',
    revenueUsd: 0,
    order: 0,
    steps: [
      {
        id: `${id}-s1`,
        title: 'First step',
        detail: 'The first thing that happens.',
        ownerKind: 'agent',
        owner: 'Bot',
        hoursPerWeek: 1,
        tools: ['gmail'],
        edgeLabel: null,
        leakUsd: null,
        automation: null,
        branch: null,
      },
    ],
    ...overrides,
  };
}

describe('db.workflows', () => {
  test('insert + all round-trips a workflow including branch metadata', () => {
    db = openDb(':memory:');
    const wf = workflow('wf-test', {
      steps: [
        { id: 'wf-test-s1', title: 'Start', detail: 'Kicks off.', ownerKind: 'agent', owner: 'Bot', hoursPerWeek: 0, tools: [], edgeLabel: null, leakUsd: null, automation: null, branch: null },
        {
          id: 'wf-test-s2',
          title: 'Approved path',
          detail: 'Runs when approved.',
          ownerKind: 'agent',
          owner: 'Bot',
          hoursPerWeek: 0,
          tools: [],
          edgeLabel: null,
          leakUsd: null,
          automation: null,
          branch: { from: 'wf-test-s1', condition: 'approved' },
        },
      ],
    });
    db.workflows.insert(wf);
    expect(db.workflows.all()).toEqual([wf]);
  });

  test('get returns a single workflow by id, or null when missing', () => {
    db = openDb(':memory:');
    const wf = workflow('wf-get');
    db.workflows.insert(wf);
    expect(db.workflows.get('wf-get')).toEqual(wf);
    expect(db.workflows.get('wf-nope')).toBeNull();
  });

  test('insert with an existing id updates in place (create + update share one path)', () => {
    db = openDb(':memory:');
    const wf = workflow('wf-update');
    db.workflows.insert(wf);
    const updated = workflow('wf-update', { name: 'Renamed workflow', order: 3 });
    db.workflows.insert(updated);
    const all = db.workflows.all();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Renamed workflow');
    expect(all[0].order).toBe(3);
  });

  test('remove deletes exactly the named workflow and leaves the rest', () => {
    db = openDb(':memory:');
    db.workflows.insert(workflow('wf-keep'));
    db.workflows.insert(workflow('wf-delete'));
    expect(db.workflows.all().map((w) => w.id).sort()).toEqual(['wf-delete', 'wf-keep']);

    db.workflows.remove('wf-delete');

    expect(db.workflows.all().map((w) => w.id)).toEqual(['wf-keep']);
    expect(db.workflows.get('wf-delete')).toBeNull();
  });

  test('remove on an id that does not exist is a harmless no-op', () => {
    db = openDb(':memory:');
    db.workflows.insert(workflow('wf-only'));
    expect(() => db.workflows.remove('wf-missing')).not.toThrow();
    expect(db.workflows.all()).toHaveLength(1);
  });
});
