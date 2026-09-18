import { afterAll, describe, expect, test } from 'vitest';
import { openDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import {
  SopPlaybookSchema,
  playbookFor,
  AUTONOMY_LEVELS,
  PLAYBOOK_STATUSES,
} from '@/lib/sop-playbooks';

// Every seeded SOP task must resolve to a valid, non-empty playbook so the
// detail card has a full breakdown for all 35 (the operator: "build it out for
// every single one of them").
describe('SOP playbooks', () => {
  const db = openDb(':memory:');
  seedDatabase(db);
  const tasks = db.sopTasks.all();
  afterAll(() => db.close());

  test('there are the expected 38 seeded SOP tasks', () => {
    expect(tasks.length).toBe(37); // -sop-notion-sync retired, +brand-deal and newsletter agents
  });

  test('every SOP task resolves to a schema-valid playbook', () => {
    for (const t of tasks) {
      const pb = playbookFor(t);
      expect(() => SopPlaybookSchema.parse(pb), `${t.id} playbook invalid`).not.toThrow();
    }
  });

  test('each playbook is actually built out (no empty structural fields)', () => {
    for (const t of tasks) {
      const pb = playbookFor(t);
      expect(pb.breaksInto.length, `${t.id} has no sub-skills`).toBeGreaterThanOrEqual(1);
      expect(pb.replaces.length, `${t.id} missing what-it-replaces`).toBeGreaterThan(0);
      expect(pb.ladder.humanLed.length).toBeGreaterThan(0);
      expect(pb.ladder.humanAssisted.length).toBeGreaterThan(0);
      expect(pb.ladder.fullyAutonomous.length).toBeGreaterThan(0);
      expect(pb.theHuman.length).toBeGreaterThan(0);
      expect(pb.buildNotes.length).toBeGreaterThan(0);
      expect(AUTONOMY_LEVELS).toContain(pb.autonomy);
      expect(PLAYBOOK_STATUSES).toContain(pb.status);
    }
  });

  test('each SOP carries a runnable skill file with real content', () => {
    for (const t of tasks) {
      const pb = playbookFor(t);
      expect(pb.skill.name.length).toBeGreaterThan(0);
      expect(pb.skill.slug).toMatch(/^[a-z0-9-]+$/);
      // dummy-but-real skill file: has frontmatter and the task's own steps
      expect(pb.skillMarkdown).toContain('---');
      expect(pb.skillMarkdown).toContain(pb.skill.name);
      expect(pb.skillMarkdown.length).toBeGreaterThan(120);
    }
  });

  test('person-owned SOPs are human-led; the flagship autonomous ones are not', () => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    // every real human on the roster (the operator, 2026-08-18)
    for (const id of ['sop-marco', 'sop-nadia', 'sop-mia', 'sop-dana', 'sop-sasha']) {
      expect(byId.get(id)?.assigneeKind).toBe('person');
      expect(playbookFor(byId.get(id)!).autonomy).toBe('human-led');
    }
    // a fully-autonomous agent lane
    expect(playbookFor(byId.get('sop-postly-publisher')!).autonomy).toBe('fully-autonomous');
  });
});
