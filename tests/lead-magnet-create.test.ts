import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

/**
 * Lead magnets are created FROM the OS (the operator, 2026-08-14: "I want to be
 * able to create these in the OS"), not only from the seed file. Two things
 * have to hold for that to be true:
 *   1. a row can be inserted at runtime with an `origin` of 'os'
 *   2. re-seeding must not delete it — the seed may only prune its own rows
 * Before this, seeding called deleteWhereIdNotIn(seededIds), which wiped
 * anything a human had made.
 */

let db: FounderDb;
let file: string;

beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-create-')), 'test.db');
  db = openDb(file);
});

afterEach(() => {
  db?.close();
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
});

const made = (over: Partial<Parameters<FounderDb['leadMagnets']['insert']>[0]> = {}) => ({
  id: 'claude-trading',
  name: 'The Claude Trading Setup',
  offer: 'The Robinhood MCP setup, the agent prompt, and the guardrails',
  url: 'https://founderos-trading-demo.example.com',
  status: 'live' as const,
  captures: 'email' as const,
  destination: 'Beehiiv · newsletter',
  source: 'IG reel · trading agent (comment TRADE)',
  launchedAt: '2026-08-14',
  notes: '',
  origin: 'os' as const,
  ...over,
});

describe('lead magnets created in the OS', () => {
  it('round-trips a runtime row, defaulting origin to os', () => {
    db.leadMagnets.insert(made());
    const [row] = db.leadMagnets.all().filter((r) => r.id === 'claude-trading');
    expect(row.name).toBe('The Claude Trading Setup');
    expect(row.url).toBe('https://founderos-trading-demo.example.com');
    expect(row.origin).toBe('os');
  });

  it('seeded rows are marked origin seed', () => {
    seedDatabase(db);
    const seeded = db.leadMagnets.all();
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.every((r) => r.origin === 'seed')).toBe(true);
  });

  it('SURVIVES a re-seed — the seed may only prune its own rows', () => {
    seedDatabase(db);
    db.leadMagnets.insert(made());
    seedDatabase(db); // the destructive step
    const ids = db.leadMagnets.all().map((r) => r.id);
    expect(ids, 'an OS-created lead magnet must not be deleted by seeding').toContain('claude-trading');
  });

  it('still prunes a seeded row that has left the seed file', () => {
    seedDatabase(db);
    db.leadMagnets.insert(made({ id: 'retired-seed-row', origin: 'seed' }));
    seedDatabase(db);
    expect(db.leadMagnets.all().map((r) => r.id)).not.toContain('retired-seed-row');
  });

  it('rejects a row whose url is not a url', () => {
    expect(() => db.leadMagnets.insert(made({ url: 'not-a-url' }))).toThrow();
  });
});
