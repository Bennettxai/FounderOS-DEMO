import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { DEPARTMENT_HEADS, headForDepartment } from '@/lib/personnel';

/**
 * The rest of the OS is demo-first on purpose, but the roster is the one place
 * where incoherent data actively lies: a name in the org chart that is homed
 * nowhere, or that owns no work, looks like coverage that does not exist.
 *
 * This file pins the seeded roster to the shape the org board draws: every
 * person sits in a real department, carries a role and tools, and owns exactly
 * one SOP — and the named department heads are people who are actually on it.
 */
let db: FounderDb;
afterEach(() => db?.close());

const seeded = (): FounderDb => {
  db = openDb(':memory:');
  seedDatabase(db);
  return db;
};

const ROSTER = ['Marco', 'Nadia', 'Mia Torres', 'Dana Whitfield', 'Sasha Bell'];

describe('the seeded roster is coherent', () => {
  test('it is the five seeded humans, with no duplicates', () => {
    const names = seeded().people.all().map((p) => p.name);
    expect([...names].sort()).toEqual([...ROSTER].sort());
    expect(new Set(names).size).toBe(names.length);
  });

  test('every person is homed in a real department and carries a role and tools', () => {
    const d = seeded();
    const deptIds = new Set(d.departments.all().map((x) => x.id));
    for (const p of d.people.all()) {
      expect(deptIds.has(p.departmentId), `${p.name} -> ${p.departmentId}`).toBe(true);
      expect(p.role.trim().length, p.name).toBeGreaterThan(0);
      expect(p.tools.length, p.name).toBeGreaterThan(0);
    }
  });

  test('the sales head closes and the growth head runs Marketing/Growth', () => {
    const people = seeded().people.all();
    expect(people.find((p) => p.name === 'Marco')?.departmentId).toBe('dept-sales');
    expect(people.find((p) => p.name === 'Marco')?.role).toMatch(/sales/i);
    expect(people.find((p) => p.name === 'Nadia')?.departmentId).toBe('dept-marketing-growth');
  });

  test('every named department head is a person on the roster, in that department', () => {
    const people = seeded().people.all();
    for (const [departmentId, head] of Object.entries(DEPARTMENT_HEADS)) {
      const person = people.find((p) => p.name === head.name);
      expect(person, `${head.name} is named a head but is not on the roster`).toBeDefined();
      expect(person?.departmentId, head.name).toBe(departmentId);
      expect(headForDepartment(departmentId)?.name).toBe(head.name);
    }
    expect(headForDepartment('dept-nonexistent')).toBeNull();
  });

  test('one SOP per person, one person per SOP — the org board draws no orphans', () => {
    const d = seeded();
    const people = d.people.all();
    const personSops = d.sopTasks.all().filter((t) => t.assigneeKind === 'person');
    expect(personSops.length).toBe(people.length);
    const assignees = personSops.map((t) => t.assigneeId);
    expect(new Set(assignees).size).toBe(assignees.length);
    for (const t of personSops) {
      const owner = people.find((p) => p.id === t.assigneeId);
      expect(owner, `SOP ${t.id} points at no seeded person`).toBeDefined();
      expect(t.departmentId, t.id).toBe(owner!.departmentId);
    }
  });
});
