import { describe, it, expect } from 'vitest';
import { parseLiveAccounts, parseHistory, parsePostDays, zernioSummary } from '@/lib/connectors/zernio';

// Mirrors the real Zernio/Late `/api/v1/accounts` shape: live follower counts
// live at metadata.profileData.followersCount (NOT top-level profileData).
const ACCOUNTS_FIXTURE = {
  accounts: [
    { platform: 'instagram', username: 'vantage.os', metadata: { profileData: { followersCount: 20000 } } },
    { platform: 'tiktok', username: 'vantage.os', metadata: { profileData: { followersCount: 5000 } } },
    { platform: 'youtube', username: 'vantageos', metadata: { profileData: { followersCount: 900 } } },
    { platform: 'twitter', username: 'founderos', metadata: { profileData: { followersCount: 3000 } } },
    { platform: 'linkedin', username: 'Alex Rivera', metadata: { profileData: { followersCount: 1200 } } },
    // facebook count via page fan_count fallback
    { platform: 'facebook', username: 'Alex Rivera', metadata: { availablePages: [{ fan_count: 42 }] } },
    // no usable count anywhere -> omitted
    { platform: 'pinterest', username: 'x', metadata: { profileData: {} } },
  ],
};

describe('parseLiveAccounts', () => {
  it('extracts live followers from metadata.profileData.followersCount', () => {
    const map = parseLiveAccounts(ACCOUNTS_FIXTURE);
    expect(map.instagram?.followers).toBe(20000);
    expect(map.tiktok?.followers).toBe(5000);
    expect(map.youtube?.followers).toBe(900);
    expect(map.twitter?.followers).toBe(3000);
    expect(map.linkedin?.followers).toBe(1200);
  });

  it('falls back to page fan_count when profileData has no count', () => {
    const map = parseLiveAccounts(ACCOUNTS_FIXTURE);
    expect(map.facebook?.followers).toBe(42);
  });

  it('prefixes the handle with @', () => {
    expect(parseLiveAccounts(ACCOUNTS_FIXTURE).instagram?.handle).toBe('@vantage.os');
  });

  it('omits accounts with no resolvable follower count', () => {
    expect(parseLiveAccounts(ACCOUNTS_FIXTURE).pinterest).toBeUndefined();
  });

  it('returns an empty map for malformed input', () => {
    expect(parseLiveAccounts(null)).toEqual({});
    expect(parseLiveAccounts({})).toEqual({});
    expect(parseLiveAccounts({ accounts: 'nope' })).toEqual({});
  });
});

describe('zernioSummary', () => {
  // most hosts have no local social config file, so the static map is empty
  // there. The live payload is the only honest source of counts.
  it('counts platforms and followers from the live payload', () => {
    const s = zernioSummary(parseLiveAccounts(ACCOUNTS_FIXTURE), {});
    expect(s.platforms).toBe(6);
    expect(s.followers).toBe(20000 + 5000 + 900 + 3000 + 1200 + 42);
  });

  it('reads the handle off the live payload instead of hardcoding one', () => {
    expect(zernioSummary(parseLiveAccounts(ACCOUNTS_FIXTURE), {}).handle).toBe('@vantage.os');
  });

  it('prefers live counts over a stale static config', () => {
    const stale = { instagram: { handle: '@vantage.os', followers: 24000 } };
    const s = zernioSummary({ instagram: { handle: '@vantage.os', followers: 72230 } }, stale);
    expect(s.followers).toBe(72230);
  });

  it('falls back to the static config when live is empty', () => {
    const s = zernioSummary({}, { instagram: { handle: '@vantage.os', followers: 24000 } });
    expect(s).toMatchObject({ platforms: 1, followers: 24000, handle: '@vantage.os' });
  });

  it('reports zero with a null handle when both sources are empty', () => {
    expect(zernioSummary({}, {})).toEqual({ platforms: 0, followers: 0, handle: null });
  });
});

// Mirrors the `/api/history` shape: published posts with live post URLs.
const HISTORY_FIXTURE = [
  {
    id: '6a32c34d',
    post: 'Comment "loop" and I\'ll send you the guide.\n\nRight now you prompt AI.',
    platforms: ['instagram', 'tiktok', 'youtube'],
    status: 'success',
    created: '2026-06-17T15:54:53.452Z',
    postIds: [{ status: 'success', platform: 'instagram', postUrl: 'https://instagram.com/reel/EXAMPLE/' }],
  },
  {
    id: 'b2',
    post: 'second post',
    platforms: ['twitter'],
    status: 'success',
    created: '2026-06-15T10:00:00.000Z',
    postIds: [{ status: 'success', platform: 'twitter', postUrl: 'https://x.com/founderos/status/1' }],
  },
];

describe('parseHistory', () => {
  it('maps history entries to {platform, caption, url, publishedAt, status}', () => {
    const posts = parseHistory(HISTORY_FIXTURE);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      platform: 'instagram',
      url: 'https://instagram.com/reel/EXAMPLE/',
      publishedAt: '2026-06-17T15:54:53.452Z',
      status: 'success',
    });
    expect(posts[0].caption).toContain('Comment "loop"');
  });

  it('respects the limit', () => {
    expect(parseHistory(HISTORY_FIXTURE, 1)).toHaveLength(1);
  });

  it('returns [] for malformed input', () => {
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory({})).toEqual([]);
  });
});

describe('parsePostDays', () => {
  it('maps each post to its date + full cross-post platform list', () => {
    const days = parsePostDays(HISTORY_FIXTURE);
    expect(days).toEqual([
      { date: '2026-06-17', platforms: ['instagram', 'tiktok', 'youtube'] },
      { date: '2026-06-15', platforms: ['twitter'] },
    ]);
  });

  it('falls back to scheduleDate when created is absent and drops entries with neither', () => {
    const days = parsePostDays([
      { platforms: ['tiktok'], scheduleDate: '2026-06-10T09:00:00.000Z' },
      { platforms: ['instagram'] }, // no date -> dropped
      { created: '2026-06-09T00:00:00.000Z', platforms: [] }, // no platforms -> dropped
    ]);
    expect(days).toEqual([{ date: '2026-06-10', platforms: ['tiktok'] }]);
  });

  it('returns [] for malformed input', () => {
    expect(parsePostDays(null)).toEqual([]);
    expect(parsePostDays({})).toEqual([]);
  });
});
