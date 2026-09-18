import { describe, expect, test } from 'vitest';
import { openDb } from '@/lib/db';
import { SEED_VERSION, seedDatabase } from '@/lib/seed';

/**
 * Removing something from the seed has to reach a database that already exists,
 * or it only ever works on a fresh clone.
 *
 * Found the hard way on 2026-08-19. Notion and WebinarJam were deleted from
 * lib/seed.ts, tests passed, the deploy landed — and the host went on serving
 * the notion-sync agent and the tool-webinarjam row, because:
 *
 *  1. getDb() only calls seedDatabase() when one of a list of tables is EMPTY.
 *     On the host every table is full, so the seed had not run in months.
 *  2. `tools` had no deleteWhereIdNotIn, so even a re-seed would have left the
 *     retired tool rows behind. INSERT OR REPLACE adds and updates; it never
 *     removes a row that has LEFT the seed.
 *
 * A version stamp fixes the first (bump SEED_VERSION and every database
 * re-seeds once), and the prune fixes the second.
 */

describe('a retired row leaves a database that was seeded before the retirement', () => {
  test('tools that left the seed are pruned, operator rows are not', () => {
    const db = openDb(':memory:');
    seedDatabase(db);

    // a row that used to be seeded and has since been retired
    db.tools.insert({
      id: 'tool-webinarjam', name: 'WebinarJam', category: 'CRM & Revenue',
      status: 'available', color: '#888', description: 'retired',
    });
    expect(db.tools.all().map((t) => t.id)).toContain('tool-webinarjam');

    seedDatabase(db);
    expect(db.tools.all().map((t) => t.id)).not.toContain('tool-webinarjam');
    // the rest of the catalogue survives the prune
    expect(db.tools.all().length).toBeGreaterThan(20);
    db.close();
  });

  test('agents and SOP tasks that left the seed are pruned too', () => {
    const db = openDb(':memory:');
    seedDatabase(db);
    const agents = db.agents.all().map((a) => a.id);
    const sops = db.sopTasks.all().map((t) => t.id);
    db.close();

    expect(agents).not.toContain('notion-sync');
    expect(sops).not.toContain('sop-notion-sync');
  });
});

describe('a forced re-seed must not resurrect fake trades over the live feed', () => {
  test('seeded trading rows stay out once a real broker snapshot exists', () => {
    const db = openDb(':memory:');
    seedDatabase(db);

    // the host's state: an agent has pushed a real Robinhood snapshot, and the
    // seeded placeholder trades were deliberately evicted from the log
    db.trading.recordSnapshot(
      {
        accountId: 'individual', accountLabel: 'Individual', capturedAt: '2030-01-01T00:00:00.000Z',
        accountValueUsd: 999_999, buyingPowerUsd: 1, cashUsd: 1, dayPnlUsd: 0, totalPnlUsd: 0,
        source: 'robinhood',
      },
      [],
    );
    const before = db.trading.activity().length;

    // a SEED_VERSION bump re-runs the whole seed against that database
    seedDatabase(db);

    expect(db.trading.latestSnapshot()?.source).toBe('robinhood');
    expect(db.trading.activity().length, 'seeded trades came back').toBe(before);
    db.close();
  });
});

describe('SEED_VERSION is what makes a re-seed happen at all', () => {
  test('a fresh database records the current version', () => {
    const db = openDb(':memory:');
    seedDatabase(db);
    expect(db.meta.get('seed_version')).toBe(SEED_VERSION);
    db.close();
  });

  test('a database stamped with an older version is out of date', () => {
    const db = openDb(':memory:');
    seedDatabase(db);
    db.meta.set('seed_version', '0');
    expect(db.meta.get('seed_version')).not.toBe(SEED_VERSION);
    // re-seeding brings it back up to date, which is what getDb() relies on
    seedDatabase(db);
    expect(db.meta.get('seed_version')).toBe(SEED_VERSION);
    db.close();
  });

  test('getDb re-seeds on a version mismatch, not only on an empty table', () => {
    const src = readSource('lib/data.ts');
    expect(src).toContain('SEED_VERSION');
    expect(src).toContain("meta.get('seed_version')");
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
function readSource(p: string): string {
  return readFileSync(join(process.cwd(), p), 'utf8');
}
