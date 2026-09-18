import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { syncFromZernioLive } from '@/lib/social-live';

let db: FounderDb;
afterEach(() => db?.close());

const LIVE = {
  instagram: { handle: '@vantage.os', followers: 20000 },
  tiktok: { handle: '@vantage.os', followers: 5000 },
  youtube: { handle: '@vantageos', followers: 900 },
  facebook: { handle: 'Alex Rivera', followers: 42 }, // untracked -> skipped
};

describe('syncFromZernioLive', () => {
  it('snapshots live follower counts for tracked platforms', async () => {
    db = openDb(':memory:');
    const recorded = await syncFromZernioLive(db, { today: '2026-06-19', source: async () => LIVE });
    expect(recorded).toBe(3); // facebook is not a tracked platform
    expect(db.social.snapshots('instagram')).toEqual([
      { platform: 'instagram', capturedAt: '2026-06-19', followers: 20000, source: 'zernio-config' },
    ]);
    expect(db.social.snapshots('youtube')[0].followers).toBe(900);
  });

  it('falls back to the static config when the live API yields nothing', async () => {
    db = openDb(':memory:');
    const recorded = await syncFromZernioLive(db, {
      today: '2026-06-19',
      source: async () => ({}),
      fallback: () => ({ twitter: { followers: 3000 } }),
    });
    expect(recorded).toBe(1);
    expect(db.social.snapshots('twitter')[0].followers).toBe(3000);
  });

  it('falls back when the live API throws', async () => {
    db = openDb(':memory:');
    const recorded = await syncFromZernioLive(db, {
      today: '2026-06-19',
      source: async () => {
        throw new Error('network down');
      },
      fallback: () => ({ linkedin: { followers: 1200 } }),
    });
    expect(recorded).toBe(1);
    expect(db.social.snapshots('linkedin')[0].followers).toBe(1200);
  });
});
