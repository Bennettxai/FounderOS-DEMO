import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { contentAgents } from '@/lib/content';

let db: FounderDb;
afterEach(() => db?.close());

describe('contentAgents', () => {
  test('returns the research crew (Research pillar), lead first', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const crew = contentAgents(db.agents.all());
    expect(crew[0].tier).toBe('lead');
    const ids = crew.map((a) => a.id);
    for (const id of ['research-agent', 'bounty-radar', 'surf-research', 'data-agent']) {
      expect(ids).toContain(id);
    }
  });

  test('only the research pillar — excludes other departments', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const crew = contentAgents(db.agents.all());
    expect(crew.every((a) => a.departmentId === 'dept-research')).toBe(true);
    expect(crew.map((a) => a.id)).not.toContain('map-builder');
    expect(crew.map((a) => a.id)).not.toContain('ops-agent');
  });

  test('deterministic + non-empty', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const a = contentAgents(db.agents.all()).map((x) => x.id);
    const b = contentAgents(db.agents.all()).map((x) => x.id);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(4);
  });
});
