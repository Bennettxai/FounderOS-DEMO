import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { SocialAccountSchema, SocialSnapshotSchema, type SocialSnapshot } from '@/lib/schemas';
import {
  allTimeGrowthPct,
  buildSocialDashboard,
  growthPct,
  platformDetail,
  syncSocialSnapshots,
} from '@/lib/social';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

const snap = (platform: string, capturedAt: string, followers: number): SocialSnapshot =>
  SocialSnapshotSchema.parse({ platform, capturedAt, followers, source: 'test' });

describe('social schemas', () => {
  test('accepts the five tracked platforms only', () => {
    expect(() =>
      SocialAccountSchema.parse({ platform: 'myspace', handle: '@x', url: null, order: 1 }),
    ).toThrow();
    expect(() =>
      SocialAccountSchema.parse({ platform: 'instagram', handle: '@founderos.ai', url: null, order: 1 }),
    ).not.toThrow();
  });

  test('snapshots require a YYYY-MM-DD capture date', () => {
    expect(() => snap('instagram', 'June 13', 100)).toThrow();
    expect(() => snap('instagram', '2026-06-13', 100)).not.toThrow();
  });
});

describe('social repo', () => {
  test('round-trips accounts ordered by their order column', () => {
    db = openDb(':memory:');
    db.social.upsertAccount({ platform: 'tiktok', handle: '@founderos.ai', url: null, order: 2 });
    db.social.upsertAccount({ platform: 'instagram', handle: '@founderos.ai', url: null, order: 1 });
    expect(db.social.accounts().map((a) => a.platform)).toEqual(['instagram', 'tiktok']);
  });

  test('upserting the same platform replaces instead of duplicating', () => {
    db = openDb(':memory:');
    db.social.upsertAccount({ platform: 'twitter', handle: '@old', url: null, order: 1 });
    db.social.upsertAccount({ platform: 'twitter', handle: '@Founderosai', url: null, order: 1 });
    expect(db.social.accounts()).toHaveLength(1);
    expect(db.social.accounts()[0].handle).toBe('@Founderosai');
  });

  test('returns snapshots for a platform in chronological order', () => {
    db = openDb(':memory:');
    db.social.insertSnapshot(snap('instagram', '2026-06-10', 40000));
    db.social.insertSnapshot(snap('instagram', '2026-06-01', 39000));
    db.social.insertSnapshot(snap('tiktok', '2026-06-10', 9900));
    expect(db.social.snapshots('instagram').map((s) => s.capturedAt)).toEqual([
      '2026-06-01',
      '2026-06-10',
    ]);
  });

  test('same-day snapshot for a platform replaces the earlier capture', () => {
    db = openDb(':memory:');
    db.social.insertSnapshot(snap('instagram', '2026-06-13', 40000));
    db.social.insertSnapshot(snap('instagram', '2026-06-13', 40100));
    const rows = db.social.snapshots('instagram');
    expect(rows).toHaveLength(1);
    expect(rows[0].followers).toBe(40100);
  });

  test('latest() returns the newest snapshot per platform', () => {
    db = openDb(':memory:');
    db.social.insertSnapshot(snap('instagram', '2026-06-01', 39000));
    db.social.insertSnapshot(snap('instagram', '2026-06-10', 40000));
    db.social.insertSnapshot(snap('tiktok', '2026-06-05', 9900));
    const latest = db.social.latest();
    expect(latest).toHaveLength(2);
    expect(latest.find((s) => s.platform === 'instagram')?.followers).toBe(40000);
  });
});

describe('growthPct', () => {
  test('computes percentage growth across the window', () => {
    const series = [snap('instagram', '2026-06-01', 1000), snap('instagram', '2026-06-08', 1100)];
    expect(growthPct(series, 7)).toBeCloseTo(10);
  });

  test('uses the most recent snapshot at or before the window start as baseline', () => {
    const series = [
      snap('instagram', '2026-06-01', 1000),
      snap('instagram', '2026-06-05', 1050),
      snap('instagram', '2026-06-12', 1155),
    ];
    expect(growthPct(series, 7)).toBeCloseTo(10);
  });

  test('is null when history does not reach back far enough', () => {
    const series = [snap('instagram', '2026-06-12', 1000), snap('instagram', '2026-06-13', 1010)];
    expect(growthPct(series, 7)).toBeNull();
  });

  test('is null with fewer than two snapshots or a zero baseline', () => {
    expect(growthPct([snap('instagram', '2026-06-13', 1000)], 7)).toBeNull();
    expect(growthPct([], 7)).toBeNull();
    expect(
      growthPct([snap('youtube', '2026-06-01', 0), snap('youtube', '2026-06-08', 50)], 7),
    ).toBeNull();
  });

  test('allTimeGrowthPct compares earliest to latest', () => {
    const series = [snap('tiktok', '2026-01-01', 5000), snap('tiktok', '2026-06-13', 12000)];
    expect(allTimeGrowthPct(series)).toBeCloseTo(140);
    expect(allTimeGrowthPct([snap('tiktok', '2026-06-13', 12000)])).toBeNull();
  });
});

describe('syncSocialSnapshots', () => {
  test('records a snapshot today for every tracked platform with a follower count', () => {
    db = openDb(':memory:');
    const recorded = syncSocialSnapshots(
      db,
      {
        instagram: { handle: '@founderos.ai', followers: 42000 },
        tiktok: { handle: '@founderos.ai', followers: 12000 },
        facebook: { handle: 'Alex Rivera', followers: 100 }, // untracked platform
        linkedin: { handle: 'Alex Rivera' }, // no follower count yet
      },
      '2026-06-13',
    );
    expect(recorded).toBe(2);
    expect(db.social.snapshots('instagram')).toEqual([
      { platform: 'instagram', capturedAt: '2026-06-13', followers: 42000, source: 'zernio-config' },
    ]);
    expect(db.social.snapshots('linkedin')).toEqual([]);
  });

  test('re-syncing the same day overwrites rather than duplicates', () => {
    db = openDb(':memory:');
    syncSocialSnapshots(db, { instagram: { followers: 42000 } }, '2026-06-13');
    syncSocialSnapshots(db, { instagram: { followers: 40100 } }, '2026-06-13');
    const rows = db.social.snapshots('instagram');
    expect(rows).toHaveLength(1);
    expect(rows[0].followers).toBe(40100);
  });
});

describe('buildSocialDashboard', () => {
  test('lists the five platforms in account order with latest followers', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const dash = buildSocialDashboard(db);
    expect(dash.platforms.map((p) => p.platform)).toEqual([
      'instagram',
      'tiktok',
      'twitter',
      'youtube',
      'linkedin',
    ]);
    expect(dash.platforms[0].followers).toBe(42000);
    // Every platform now carries ~90d of seeded dummy history (incl. LinkedIn)
    // so each one charts and computes growth over every window.
    expect(dash.platforms[4].followers).toBe(1500);
  });

  test('sums total followers across latest snapshots', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(buildSocialDashboard(db).totalFollowers).toBe(42000 + 12000 + 5200 + 900 + 1500);
  });

  test('computes growth from snapshot history per platform', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const ig = buildSocialDashboard(db).platforms.find((p) => p.platform === 'instagram');
    // seeded ~90d history → latest is the real 40,061 and every window computes
    expect(ig?.followers).toBe(42000);
    expect(typeof ig?.growth.d7).toBe('number');
    expect(typeof ig?.growth.d30).toBe('number');
    expect(typeof ig?.growth.d60).toBe('number');
    expect(typeof ig?.growth.allTime).toBe('number');
    expect(ig?.series.length ?? 0).toBeGreaterThan(3);
  });
});

describe('platformDetail', () => {
  test('returns account, history, and growth for one platform', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const detail = platformDetail(db, 'instagram');
    expect(detail?.account.handle).toBe('@founderos.ai');
    expect(detail?.snapshots.length).toBeGreaterThanOrEqual(1);
    expect(detail?.growth).toHaveProperty('d7');
    expect(detail?.growth).toHaveProperty('d30');
    expect(detail?.growth).toHaveProperty('allTime');
  });

  test('is null for a platform that is not tracked', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(platformDetail(db, 'myspace' as never)).toBeNull();
  });
});

describe('seeded social data', () => {
  test('seeds the five accounts with real handles', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const byPlatform = new Map(db.social.accounts().map((a) => [a.platform, a]));
    expect(byPlatform.get('instagram')?.handle).toBe('@founderos.ai');
    expect(byPlatform.get('twitter')?.handle).toBe('@Founderosai');
    expect(byPlatform.get('linkedin')?.handle).toBe('Alex Rivera');
  });

  test('seeds multi-month history ending at the real current count', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(db.social.snapshots('youtube').at(-1)?.followers).toBe(900);
    // LinkedIn is fully dummy (no Zernio count) but still gets a history series
    expect(db.social.snapshots('linkedin').length).toBeGreaterThan(3);
    expect(db.social.snapshots('linkedin').at(-1)?.followers).toBe(1500);
  });

  test('re-seeding does not duplicate accounts or snapshots', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const accounts = db.social.accounts().length;
    const igSnaps = db.social.snapshots('instagram').length;
    seedDatabase(db);
    expect(db.social.accounts().length).toBe(accounts);
    expect(db.social.snapshots('instagram').length).toBe(igSnaps);
  });
});
