import { describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { buildKnowledgeGraph } from '@/lib/knowledge-graph';
import { ACTION_LENSES, ALL_LENSES, ENTITY_LENSES, FUNCTION_LENSES, lensNodeSet, type LensContext } from '@/lib/graph-lens';

function contextFromSeed(): LensContext {
  const db: FounderDb = openDb(':memory:');
  seedDatabase(db);
  const graph = buildKnowledgeGraph(db.agents.all(), db.departments.all(), db.people.all(), db.sopTasks.all());
  // dept resolver mirroring the component's teamForFocus: worker → its dept
  const deptOf = new Map<string, string>();
  for (const a of db.agents.all()) deptOf.set(`emp:${a.id}`, `team:${a.departmentId}`);
  for (const p of db.people.all()) deptOf.set(`person:${p.id}`, `team:${p.departmentId}`);
  return { nodes: graph.nodes, teamOf: (id) => deptOf.get(id) ?? null };
}

const ctx = contextFromSeed();

describe('graph lenses — Alex taxonomy (2026-07-12)', () => {
  test('the requested categories all exist', () => {
    expect(ENTITY_LENSES.map((l) => l.label)).toEqual([
      'All people', 'Sub-agents', 'Tools', 'Workflows', 'SOPs', 'Projects', 'Teams', 'Departments',
    ]);
    expect(FUNCTION_LENSES.map((l) => l.label)).toContain('Core');
    expect(FUNCTION_LENSES.map((l) => l.label)).toContain('Enabling');
    expect(FUNCTION_LENSES.map((l) => l.label)).toContain('Vantage team');
    expect(FUNCTION_LENSES.map((l) => l.label)).toContain('Launchpad Cohort team');
    expect(ACTION_LENSES).toHaveLength(11);
    expect(new Set(ALL_LENSES.map((l) => l.id)).size).toBe(ALL_LENSES.length);
  });

  test('entity lenses match by node kind against the real seeded graph', () => {
    expect(lensNodeSet('ent-people', ctx).size).toBe(5);
    expect(lensNodeSet('ent-subagents', ctx).size).toBe(30);
    expect(lensNodeSet('ent-departments', ctx).size).toBe(6);
    expect(lensNodeSet('ent-sops', ctx).size).toBeGreaterThan(20);
    expect(lensNodeSet('ent-tools', ctx).size).toBeGreaterThan(20);
  });

  test('workflows and projects are honestly empty until modeled', () => {
    expect(lensNodeSet('ent-workflows', ctx).size).toBe(0);
    expect(lensNodeSet('ent-projects', ctx).size).toBe(0);
  });

  test('core and enabling split the pillars cleanly and light whole sectors', () => {
    const core = lensNodeSet('fn-core', ctx);
    const enabling = lensNodeSet('fn-enabling', ctx);
    expect(core.has('team:dept-sales')).toBe(true);
    expect(enabling.has('team:dept-tech')).toBe(true);
    // a node is never both core and enabling
    for (const id of core) expect(enabling.has(id), id).toBe(false);
    // sectors include their workers, not just the gateways
    expect(core.has('emp:sales-agent')).toBe(true);
  });

  test('venture team lenses light their rosters', () => {
    const mer = lensNodeSet('fn-vantage', ctx);
    expect(mer.has('emp:vantage-sales')).toBe(true);
    expect(mer.has('emp:vantage-fanbasis')).toBe(true);
    const aa = lensNodeSet('fn-launchpad-cohort', ctx);
    expect(aa.has('emp:launchpad-cohort-sales')).toBe(true);
  });

  test('every action lens resolves to real seeded agents', () => {
    for (const lens of ACTION_LENSES) {
      const set = lensNodeSet(lens.id, ctx);
      expect(set.size, lens.label).toBeGreaterThan(0);
      for (const id of set) expect(id.startsWith('emp:'), `${lens.label} → ${id}`).toBe(true);
    }
  });

  test('specific action mappings hold', () => {
    expect(lensNodeSet('act-ad-creation', ctx).has('emp:arcads-creative')).toBe(true);
    expect(lensNodeSet('act-lead-generation', ctx).has('emp:sales-agent')).toBe(true);
    expect(lensNodeSet('act-social-scheduler', ctx).has('emp:zernio-publisher')).toBe(true);
    expect(lensNodeSet('act-ai-visuals', ctx).has('emp:higgsfield-creative')).toBe(true);
  });

  test('unknown lens returns an empty set, never throws', () => {
    expect(lensNodeSet('nope', ctx).size).toBe(0);
  });
});
