import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { openDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { phaseProgress } from '@/lib/roadmap';
import { RoadmapItemSchema } from '@/lib/schemas';
import type { RoadmapItem } from '@/lib/schemas';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const item = (
  id: string,
  status: RoadmapItem['status'],
  phaseId: string | null,
): RoadmapItem => ({
  id,
  title: id,
  quarter: '2026-Q3',
  status,
  departmentId: null,
  description: '',
  phaseId,
});

/**
 * Mock 5h (interaction rebrand handoff, artboard 5h): /roadmap gets phase
 * cards with a real progress bar and click-to-select, status filter chips over
 * the quarter columns, and items that expand on click into their description
 * plus "open task" / "mark done". The percentages are not decoration: a phase
 * owns real roadmap rows, so its bar is done/total of those rows, and marking
 * an item done writes through the repo like every other number in the OS.
 */
describe('/roadmap mock-5h: a phase owns real roadmap rows', () => {
  test('a roadmap item carries the phase it belongs to', () => {
    expect(RoadmapItemSchema.parse(item('rm-x', 'now', 'phase-2')).phaseId).toBe('phase-2');
    expect(RoadmapItemSchema.parse(item('rm-y', 'now', null)).phaseId).toBeNull();
  });

  test('the seeded roadmap links every row to a phase that exists', () => {
    const db = openDb(':memory:');
    seedDatabase(db);
    const phaseIds = new Set(db.phases.all().map((p) => p.id));
    const items = db.roadmap.all();
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(i.phaseId, i.id).not.toBeNull();
      expect(phaseIds.has(i.phaseId!), i.id).toBe(true);
    }
  });

  test('every seeded phase has at least one row behind it', () => {
    const db = openDb(':memory:');
    seedDatabase(db);
    const items = db.roadmap.all();
    for (const p of db.phases.all()) {
      expect(items.some((i) => i.phaseId === p.id), p.id).toBe(true);
    }
  });

  test('phaseId survives a write and a read', () => {
    const db = openDb(':memory:');
    db.roadmap.insert(item('rm-keep', 'now', 'phase-3'));
    expect(db.roadmap.all()[0].phaseId).toBe('phase-3');
  });
});

describe('/roadmap mock-5h: phaseProgress counts what is actually done', () => {
  const phases = [
    { id: 'phase-1', number: 1, title: 'One', items: ['a'] },
    { id: 'phase-2', number: 2, title: 'Two', items: ['b'] },
  ];

  test('pct is done over total for the rows that phase owns', () => {
    const rows = phaseProgress(phases, [
      item('a', 'done', 'phase-1'),
      item('b', 'done', 'phase-1'),
      item('c', 'now', 'phase-1'),
      item('d', 'later', 'phase-2'),
    ]);
    expect(rows[0].done).toBe(2);
    expect(rows[0].total).toBe(3);
    expect(rows[0].pct).toBe(67);
    expect(rows[1].pct).toBe(0);
  });

  test('a phase with no rows reads zero rather than NaN', () => {
    const rows = phaseProgress(phases, []);
    expect(rows[0].total).toBe(0);
    expect(rows[0].pct).toBe(0);
  });

  test('the rows come back with the phase so the card can render them', () => {
    const rows = phaseProgress(phases, [item('a', 'done', 'phase-1')]);
    expect(rows[0].phase.title).toBe('One');
    expect(rows[0].items.map((i) => i.id)).toEqual(['a']);
  });
});

describe('/roadmap mock-5h: mark done writes through the repo', () => {
  test('setStatus flips a row and reports the row it changed', () => {
    const db = openDb(':memory:');
    db.roadmap.insert(item('rm-mark', 'now', 'phase-1'));
    const updated = db.roadmap.setStatus('rm-mark', 'done');
    expect(updated?.status).toBe('done');
    expect(db.roadmap.all()[0].status).toBe('done');
  });

  test('setStatus is null for an id that is not on the board', () => {
    const db = openDb(':memory:');
    expect(db.roadmap.setStatus('rm-ghost', 'done')).toBeNull();
  });
});

describe('PATCH /api/roadmap', () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-5h-'));
    process.env.FOUNDER_OS_DB = path.join(dir, 'test.db');
  });

  afterAll(() => {
    delete process.env.FOUNDER_OS_DB;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const patch = async (body: unknown) => {
    const { PATCH } = await import('@/app/api/roadmap/route');
    return PATCH(new Request('http://x/api/roadmap', { method: 'PATCH', body: JSON.stringify(body) }));
  };

  test('marks a seeded item done and hands back the whole board', async () => {
    const res = await patch({ id: 'rm-workers', status: 'done' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { item: RoadmapItem; quarters: unknown[] };
    expect(body.item.status).toBe('done');
    expect(Array.isArray(body.quarters)).toBe(true);
  });

  test('rejects a status that is not on the roadmap vocabulary', async () => {
    expect((await patch({ id: 'rm-workers', status: 'shipped-ish' })).status).toBe(400);
  });

  test('404s honestly for an id that is not there', async () => {
    expect((await patch({ id: 'rm-nope', status: 'done' })).status).toBe(404);
  });
});

describe('/roadmap mock-5h: the page frames a client board', () => {
  const page = read('app/roadmap/page.tsx');

  test('the header carries the shipped tally', () => {
    expect(page).toContain('shipped');
  });

  test('the board itself moved to a client component', () => {
    expect(page).toContain('<RoadmapBoard');
    expect(page).not.toContain('rounded-lg-t');
  });

  test('no em dashes in the rewritten page', () => {
    expect(page).not.toContain('—');
  });
});

describe('/roadmap mock-5h: the board', () => {
  const board = read('components/RoadmapBoard.tsx');

  test('is a client component', () => {
    expect(board.startsWith("'use client'")).toBe(true);
  });

  test('phase cards are lens rows that select, with a real progress bar', () => {
    expect(board).toContain('pressable is-row');
    expect(board).toContain('data-lens="r"');
    expect(board).toContain('pct');
    // the bar is a width transition, never an animated radius
    expect(board).toMatch(/width:\s*`?\$\{|width: `/);
    expect(board).not.toContain('rounded-lg-t');
  });

  test('status filter chips sit over the quarter columns', () => {
    expect(board).toContain('Chip');
    expect(board).toContain('data-lens="c"');
    for (const label of ['All', 'Done', 'Now', 'Next', 'Later']) {
      expect(board).toContain(`'${label}'`);
    }
  });

  test('an item expands on click into description and actions', () => {
    expect(board).toContain('open task');
    expect(board).toContain('AsyncButton');
    expect(board).toMatch(/mark (done|now)|markLabel/);
    expect(board).toContain("method: 'PATCH'");
    expect(board).toContain('/api/roadmap');
  });

  test('done items keep the mock dimming and the strike', () => {
    expect(board).toContain('opacity-[0.62]');
    expect(board).toContain('line-through');
  });

  test('floating surfaces use the rebrand radii', () => {
    expect(board).toContain('rounded-panel');
    expect(board).toContain('rounded-full');
  });
});
