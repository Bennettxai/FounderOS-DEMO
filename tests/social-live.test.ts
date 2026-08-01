import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { syncFromZernioLive } from '@/lib/social-live';

let db: FounderDb;
afterEach(() => db?.close());

const LIVE = {
  instagram: { handle: '@founderos.ai', followers: 52936 },
  tiktok: { handle: '@founderos.ai', followers: 10269 },
  youtube: { handle: '@founderosai', followers: 1140 },
  facebook: { handle: 'Alex Rivera', followers: 42 }, // untracked -> skipped
};

describe('syncFromZernioLive', () => {
  it('snapshots live follower counts for tracked platforms', async () => {
    db = openDb(':memory:');
    const recorded = await syncFromZernioLive(db, { today: '2026-06-19', source: async () => LIVE });
    expect(recorded).toBe(3); // facebook is not a tracked platform
    expect(db.social.snapshots('instagram')).toEqual([
      { platform: 'instagram', capturedAt: '2026-06-19', followers: 52936, source: 'zernio-config' },
    ]);
    expect(db.social.snapshots('youtube')[0].followers).toBe(1140);
  });

  it('falls back to the static config when the live API yields nothing', async () => {
    db = openDb(':memory:');
    const recorded = await syncFromZernioLive(db, {
      today: '2026-06-19',
      source: async () => ({}),
      fallback: () => ({ twitter: { followers: 4178 } }),
    });
    expect(recorded).toBe(1);
    expect(db.social.snapshots('twitter')[0].followers).toBe(4178);
  });

  it('falls back when the live API throws', async () => {
    db = openDb(':memory:');
    const recorded = await syncFromZernioLive(db, {
      today: '2026-06-19',
      source: async () => {
        throw new Error('network down');
      },
      fallback: () => ({ linkedin: { followers: 1880 } }),
    });
    expect(recorded).toBe(1);
    expect(db.social.snapshots('linkedin')[0].followers).toBe(1880);
  });
});
