import { describe, expect, test } from 'vitest';
import { openDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { currentFocus, groupRoadmapByQuarter } from '@/lib/roadmap';
import type { RoadmapItem } from '@/lib/schemas';

const item = (id: string, quarter: string, status: RoadmapItem['status']): RoadmapItem => ({
  id,
  title: id,
  quarter,
  status,
  departmentId: null,
  description: '',
  phaseId: null,
});

/**
 * The home console used to label its focus panel with
 * `groupRoadmapByQuarter(...)[0]`, which is the EARLIEST quarter on record and
 * therefore said "Now · 2026-Q2" forever. Focus follows status, not the
 * calendar order of the backlog.
 */
describe('currentFocus', () => {
  test('returns the items actually marked now', () => {
    const focus = currentFocus([
      item('old', '2026-Q2', 'done'),
      item('live', '2026-Q3', 'now'),
      item('soon', '2026-Q4', 'next'),
    ]);
    expect(focus?.items.map((i) => i.id)).toEqual(['live']);
    expect(focus?.quarter).toBe('2026-Q3');
  });

  test('falls back to what is next when nothing is in flight', () => {
    const focus = currentFocus([item('old', '2026-Q2', 'done'), item('soon', '2026-Q4', 'next')]);
    expect(focus?.items.map((i) => i.id)).toEqual(['soon']);
    expect(focus?.quarter).toBe('2026-Q4');
  });

  test('labels with the earliest quarter that has live work', () => {
    const focus = currentFocus([item('a', '2026-Q4', 'now'), item('b', '2026-Q3', 'now')]);
    expect(focus?.quarter).toBe('2026-Q3');
  });

  test('is null when the roadmap is empty or fully done', () => {
    expect(currentFocus([])).toBeNull();
    expect(currentFocus([item('a', '2026-Q2', 'done')])).toBeNull();
  });
});

/**
 * Spring cleaning, 2026-09-06: the seeded roadmap had four 2026-Q2 items still
 * flagged "now" that shipped months ago, and three 2026-Q3 items flagged
 * "next" that are running in production. A roadmap that lies is worse than no
 * roadmap.
 */
describe('the seeded roadmap tells the truth', () => {
  const db = openDb(':memory:');
  seedDatabase(db);
  const items = db.roadmap.all();
  const byId = new Map(items.map((i) => [i.id, i]));

  test('everything shipped in 2026-Q2 is marked done', () => {
    const q2 = items.filter((i) => i.quarter === '2026-Q2');
    expect(q2.length).toBeGreaterThan(0);
    expect(q2.every((i) => i.status === 'done')).toBe(true);
  });

  test('the things that are demonstrably live are not still "next"', () => {
    // The cron tick runs on the host, the app IS on the host, and the brain
    // moved to local Ollama embeddings on 2026-08-31.
    for (const id of ['rm-scheduler', 'rm-host', 'rm-embeddings']) {
      expect(byId.get(id)?.status, id).toBe('done');
    }
  });

  test('the retired Notion connector never comes back', () => {
    expect(items.some((i) => /notion/i.test(i.title))).toBe(false);
  });

  test('current focus lands in the quarter we are actually in', () => {
    const focus = currentFocus(items);
    expect(focus?.quarter).toBe('2026-Q3');
    expect(focus!.items.length).toBeGreaterThan(0);
  });

  test('there is still work ahead of us', () => {
    expect(items.some((i) => i.status === 'next' || i.status === 'later')).toBe(true);
    expect(groupRoadmapByQuarter(items).map((q) => q.quarter)).toContain('2026-Q4');
  });
});

/**
 * roadmap_items had no prune path, so a row deleted from lib/seed.ts stayed on
 * the host forever. That is how a retired connector kept its place on the
 * board months after it was removed from the source.
 */
describe('roadmap rows that leave the seed leave the database', () => {
  test('deleteWhereIdNotIn drops stale rows', () => {
    const db = openDb(':memory:');
    db.roadmap.insert(item('rm-keep', '2026-Q3', 'now'));
    db.roadmap.insert(item('rm-ghost', '2026-Q2', 'now'));
    db.roadmap.deleteWhereIdNotIn(['rm-keep']);
    expect(db.roadmap.all().map((i) => i.id)).toEqual(['rm-keep']);
  });

  test('re-seeding evicts a row that is no longer in the seed', () => {
    const db = openDb(':memory:');
    db.roadmap.insert(item('rm-creds-notion', '2026-Q2', 'now'));
    seedDatabase(db);
    expect(db.roadmap.all().some((i) => i.id === 'rm-creds-notion')).toBe(false);
  });
});
