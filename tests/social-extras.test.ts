import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import {
  EmailListSnapshotSchema,
  SocialDmSchema,
  SocialDmSnapshotSchema,
  SocialPostSchema,
  type EmailListSnapshot,
} from '@/lib/schemas';
import { buildEmailList } from '@/lib/email-list';
import {
  totalDms,
  dmsByPlatform,
  monthlyAudienceGrowthPct,
  audienceGrowthPct,
  audienceTotal,
  audienceSeries,
  dmSeries,
  dmGrowthPct,
  postingCadenceByPlatform,
  postingSeries,
} from '@/lib/social';
import { PLATFORM_LABELS } from '@/lib/social';

describe('postingCadenceByPlatform', () => {
  const PLATFORMS = ['instagram', 'tiktok', 'twitter', 'youtube', 'linkedin'] as const;

  test('one entry per day, ascending, ending on endDate, every platform keyed', () => {
    const c = postingCadenceByPlatform('2026-06-14', 30);
    expect(c).toHaveLength(30);
    expect(c[0].date < c[29].date).toBe(true);
    expect(c[29].date).toBe('2026-06-14');
    for (const p of PLATFORMS) expect(Number.isInteger(c[0].counts[p])).toBe(true);
  });

  test('deterministic and nonnegative', () => {
    const a = postingCadenceByPlatform('2026-06-14', 60);
    const b = postingCadenceByPlatform('2026-06-14', 60);
    expect(a).toEqual(b);
    for (const d of a) for (const p of PLATFORMS) expect(d.counts[p]).toBeGreaterThanOrEqual(0);
  });

  test('per-platform rhythms differ — IG/X post more often than YouTube', () => {
    const c = postingCadenceByPlatform('2026-06-14', 90);
    const days = (p: (typeof PLATFORMS)[number]) => c.filter((d) => d.counts[p] > 0).length;
    expect(days('youtube')).toBeLessThan(days('instagram'));
    expect(days('youtube')).toBeLessThan(days('twitter'));
    expect(days('youtube')).toBeGreaterThan(0);
  });

  test('postingSeries exposes one labelled series per platform with a total', () => {
    const s = postingSeries('2026-06-14', 90);
    expect(s).toHaveLength(PLATFORMS.length);
    for (const series of s) {
      expect(series.label).toBe(PLATFORM_LABELS[series.key]);
      expect(series.points).toHaveLength(90);
      expect(series.total).toBe(series.points.reduce((sum, p) => sum + p.count, 0));
    }
  });
});

let db: FounderDb;

afterEach(() => {
  db?.close();
});

const emailSnap = (capturedAt: string, subscribers: number): EmailListSnapshot =>
  EmailListSnapshotSchema.parse({ capturedAt, subscribers, source: 'test' });

describe('email-list schema + repo', () => {
  test('snapshots require a YYYY-MM-DD date and a nonnegative count', () => {
    expect(() => emailSnap('June 1', 100)).toThrow();
    expect(() => emailSnap('2026-06-12', -1)).toThrow();
    expect(() => emailSnap('2026-06-12', 30000)).not.toThrow();
  });

  test('repo round-trips snapshots in date order and exposes the latest', () => {
    db = openDb(':memory:');
    db.emailList.insertSnapshot(emailSnap('2026-06-12', 30000));
    db.emailList.insertSnapshot(emailSnap('2026-05-13', 28000));
    const series = db.emailList.snapshots();
    expect(series.map((s) => s.capturedAt)).toEqual(['2026-05-13', '2026-06-12']);
    expect(db.emailList.latest()?.subscribers).toBe(30000);
  });

  test('same-day insert overwrites (idempotent re-sync)', () => {
    db = openDb(':memory:');
    db.emailList.insertSnapshot(emailSnap('2026-06-12', 30000));
    db.emailList.insertSnapshot(emailSnap('2026-06-12', 30050));
    expect(db.emailList.snapshots()).toHaveLength(1);
    expect(db.emailList.latest()?.subscribers).toBe(30050);
  });
});

describe('buildEmailList', () => {
  test('reports subscribers, growth, and a series; honest nulls without history', () => {
    db = openDb(':memory:');
    const empty = buildEmailList(db);
    expect(empty.subscribers).toBeNull();
    expect(empty.growth.d30).toBeNull();

    db.emailList.insertSnapshot(emailSnap('2026-05-13', 28000));
    db.emailList.insertSnapshot(emailSnap('2026-06-12', 30000));
    const built = buildEmailList(db);
    expect(built.subscribers).toBe(30000);
    expect(built.asOf).toBe('2026-06-12');
    expect(built.growth.d30).toBeCloseTo(((30000 - 28000) / 28000) * 100, 5);
    expect(built.series.at(-1)).toEqual({ date: '2026-06-12', subscribers: 30000 });
  });
});

describe('DM totals', () => {
  test('seeded DB exposes per-platform DM counts that sum to the total', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const byPlatform = dmsByPlatform(db);
    expect(byPlatform.length).toBeGreaterThan(0);
    const sum = byPlatform.reduce((s, d) => s + d.count, 0);
    expect(totalDms(db)).toBe(sum);
    expect(totalDms(db)).toBeGreaterThan(0);
  });

  test('DM schema rejects unknown platforms and negative counts', () => {
    expect(() => SocialDmSchema.parse({ platform: 'myspace', count: 1, updatedAt: '2026-06-12' })).toThrow();
    expect(() => SocialDmSchema.parse({ platform: 'instagram', count: -1, updatedAt: '2026-06-12' })).toThrow();
    expect(() => SocialDmSchema.parse({ platform: 'instagram', count: 5, updatedAt: '2026-06-12' })).not.toThrow();
  });
});

describe('monthlyAudienceGrowthPct', () => {
  test('aggregates 30-day growth across channels with a baseline; null when none qualify', () => {
    db = openDb(':memory:');
    expect(monthlyAudienceGrowthPct(db)).toBeNull();

    // email has month-long history → qualifies
    db.emailList.insertSnapshot(emailSnap('2026-05-13', 28000));
    db.emailList.insertSnapshot(emailSnap('2026-06-12', 30000));
    // a platform with only a recent baseline does NOT reach back 30 days → excluded
    db.social.upsertAccount({ platform: 'instagram', handle: '@x', url: null, order: 1 });
    db.social.insertSnapshot({ platform: 'instagram', capturedAt: '2026-06-12', followers: 40000, source: 'test' });

    // only email qualifies: (30000-28000)/28000
    expect(monthlyAudienceGrowthPct(db)).toBeCloseTo(((30000 - 28000) / 28000) * 100, 5);

    // give instagram a 30-day baseline too → both aggregate
    db.social.insertSnapshot({ platform: 'instagram', capturedAt: '2026-05-13', followers: 38000, source: 'test' });
    const expected = ((30000 + 40000 - (28000 + 38000)) / (28000 + 38000)) * 100;
    expect(monthlyAudienceGrowthPct(db)).toBeCloseTo(expected, 5);
  });
});

describe('DM history snapshots', () => {
  test('schema requires a YYYY-MM-DD date and nonnegative count', () => {
    expect(() => SocialDmSnapshotSchema.parse({ platform: 'instagram', capturedAt: 'nope', count: 5, source: 't' })).toThrow();
    expect(() => SocialDmSnapshotSchema.parse({ platform: 'instagram', capturedAt: '2026-06-12', count: -1, source: 't' })).toThrow();
    expect(() => SocialDmSnapshotSchema.parse({ platform: 'instagram', capturedAt: '2026-06-12', count: 5, source: 't' })).not.toThrow();
  });

  test('repo round-trips DM snapshots ordered by date', () => {
    db = openDb(':memory:');
    db.social.insertDmSnapshot({ platform: 'instagram', capturedAt: '2026-06-12', count: 1240, source: 'test' });
    db.social.insertDmSnapshot({ platform: 'instagram', capturedAt: '2026-05-12', count: 1000, source: 'test' });
    db.social.insertDmSnapshot({ platform: 'tiktok', capturedAt: '2026-06-12', count: 386, source: 'test' });
    expect(db.social.dmSnapshots('instagram').map((s) => s.capturedAt)).toEqual(['2026-05-12', '2026-06-12']);
    expect(db.social.dmSnapshots().length).toBe(3);
  });

  test('dmSeries totals DMs per day (carry-forward) and dmGrowthPct uses the window', () => {
    db = openDb(':memory:');
    db.social.insertDmSnapshot({ platform: 'instagram', capturedAt: '2026-05-13', count: 1000, source: 'test' });
    db.social.insertDmSnapshot({ platform: 'instagram', capturedAt: '2026-06-12', count: 1240, source: 'test' });
    db.social.insertDmSnapshot({ platform: 'tiktok', capturedAt: '2026-06-12', count: 360, source: 'test' });
    const series = dmSeries(db);
    expect(series.at(-1)).toEqual({ date: '2026-06-12', value: 1600 }); // 1240 + 360
    // 30d growth of the total: ig went 1000→1240 over the window (tiktok has no baseline)
    expect(dmGrowthPct(db, 30)).toBeCloseTo(((1600 - 1000) / 1000) * 100, 5);
  });
});

describe('audience series + range growth', () => {
  test('audienceSeries returns per-channel series + an All series that sums them', () => {
    db = openDb(':memory:');
    db.social.upsertAccount({ platform: 'instagram', handle: '@x', url: null, order: 1 });
    db.social.insertSnapshot({ platform: 'instagram', capturedAt: '2026-06-12', followers: 40000, source: 'test' });
    db.emailList.insertSnapshot(emailSnap('2026-06-12', 30000));
    const { channels, all } = audienceSeries(db);
    expect(channels.map((c) => c.key)).toContain('instagram');
    expect(channels.map((c) => c.key)).toContain('email');
    expect(all.points.at(-1)).toEqual({ date: '2026-06-12', value: 70000 });
  });

  test('audienceGrowthPct computes per range; audienceTotal sums latest channel values', () => {
    db = openDb(':memory:');
    db.social.upsertAccount({ platform: 'instagram', handle: '@x', url: null, order: 1 });
    db.social.insertSnapshot({ platform: 'instagram', capturedAt: '2026-04-13', followers: 36000, source: 'test' });
    db.social.insertSnapshot({ platform: 'instagram', capturedAt: '2026-06-12', followers: 40000, source: 'test' });
    db.emailList.insertSnapshot(emailSnap('2026-04-13', 27000));
    db.emailList.insertSnapshot(emailSnap('2026-06-12', 30000));
    expect(audienceTotal(db)).toBe(70000);
    // 60d window from 06-12 starts 04-13 → baseline 63000 → +11.11%
    expect(audienceGrowthPct(db, 60)).toBeCloseTo(((70000 - 63000) / 63000) * 100, 4);
    // back-compat: monthly == audienceGrowthPct(db, 30)
    expect(monthlyAudienceGrowthPct(db)).toBe(audienceGrowthPct(db, 30));
  });
});

describe('seed history is deep enough for growth math', () => {
  test('followers + DMs carry multi-month history; the real email list is young but honest', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    // followers span ~90 days, so the merged audience computes every window
    expect(audienceGrowthPct(db, 7)).not.toBeNull();
    expect(audienceGrowthPct(db, 30)).not.toBeNull();
    expect(audienceGrowthPct(db, 60)).not.toBeNull();
    expect(dmGrowthPct(db, 60)).not.toBeNull();
    expect(db.social.dmSnapshots().length).toBeGreaterThan(50);
    // the email list is the real Beehiiv account (imported 2026-05-28): its
    // short window is computable, but 60d honestly predates the list → null
    const email = buildEmailList(db);
    expect(email.subscribers).toBe(2141);
    expect(email.growth.d7).not.toBeNull();
    expect(email.growth.d60).toBeNull();
  });

  test('re-seed stays idempotent (no duplicate snapshot rows)', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const before = db.social.dmSnapshots().length;
    seedDatabase(db);
    expect(db.social.dmSnapshots().length).toBe(before);
  });
});

describe('social post queue', () => {
  test('post schema requires a caption and at least one platform', () => {
    expect(() =>
      SocialPostSchema.parse({
        id: 'p1',
        caption: '',
        mediaUrl: null,
        platforms: ['instagram'],
        status: 'queued',
        scheduledFor: null,
        createdAt: '2026-06-13T00:00:00Z',
      }),
    ).toThrow();
    expect(() =>
      SocialPostSchema.parse({
        id: 'p1',
        caption: 'hello',
        mediaUrl: null,
        platforms: [],
        status: 'queued',
        scheduledFor: null,
        createdAt: '2026-06-13T00:00:00Z',
      }),
    ).toThrow();
  });

  test('enqueue persists and queued() returns only queued posts newest-first', () => {
    db = openDb(':memory:');
    db.socialPosts.enqueue({
      id: 'p1',
      caption: 'first',
      mediaUrl: null,
      platforms: ['instagram', 'tiktok'],
      status: 'queued',
      scheduledFor: null,
      createdAt: '2026-06-13T10:00:00Z',
    });
    db.socialPosts.enqueue({
      id: 'p2',
      caption: 'second',
      mediaUrl: 'https://cdn/x.jpg',
      platforms: ['twitter'],
      status: 'queued',
      scheduledFor: '2026-06-20T09:00:00Z',
      createdAt: '2026-06-13T11:00:00Z',
    });
    const queued = db.socialPosts.queued();
    expect(queued.map((p) => p.id)).toEqual(['p2', 'p1']);
    expect(queued[0].platforms).toEqual(['twitter']);
    expect(db.socialPosts.all()).toHaveLength(2);
  });
});
