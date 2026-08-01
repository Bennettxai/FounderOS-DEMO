import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { buildEmailList, syncBeehiivEmail } from '@/lib/email-list';

let db: FounderDb;
afterEach(() => db?.close());

describe('syncBeehiivEmail', () => {
  it('snapshots the live Beehiiv count so buildEmailList prefers it', async () => {
    db = openDb(':memory:');
    const ok = await syncBeehiivEmail(db, { today: '2026-06-19', source: async () => 5123 });
    expect(ok).toBe(true);
    expect(buildEmailList(db).subscribers).toBe(5123);
  });

  it('is a no-op (no fake number) when Beehiiv yields null', async () => {
    db = openDb(':memory:');
    const ok = await syncBeehiivEmail(db, { today: '2026-06-19', source: async () => null });
    expect(ok).toBe(false);
    expect(buildEmailList(db).subscribers).toBeNull(); // stays honest-empty (no seed in :memory:)
  });

  it('is a no-op when the source throws', async () => {
    db = openDb(':memory:');
    const ok = await syncBeehiivEmail(db, {
      today: '2026-06-19',
      source: async () => {
        throw new Error('beehiiv down');
      },
    });
    expect(ok).toBe(false);
  });
});
