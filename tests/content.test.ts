import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { contentAgents } from '@/lib/content';

let db: FounderDb;
afterEach(() => db?.close());

describe('contentAgents', () => {
  test('returns the content-creation crew (Marketing/Growth pillar), lead first', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const crew = contentAgents(db.agents.all());
    expect(crew[0].id).toBe('social-agent');
    const ids = crew.map((a) => a.id);
    for (const id of ['social-agent', 'zernio-publisher', 'arcads-creative', 'remotion-editor', 'higgsfield-creative', 'manychat-mcp']) {
      expect(ids).toContain(id);
    }
  });

  test('only the content pillar — excludes other departments', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const crew = contentAgents(db.agents.all());
    expect(crew.every((a) => a.departmentId === 'dept-marketing-growth')).toBe(true);
    expect(crew.map((a) => a.id)).not.toContain('sales-agent');
    expect(crew.map((a) => a.id)).not.toContain('data-agent');
  });

  test('deterministic + non-empty', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const a = contentAgents(db.agents.all()).map((x) => x.id);
    const b = contentAgents(db.agents.all()).map((x) => x.id);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(5);
  });
});
