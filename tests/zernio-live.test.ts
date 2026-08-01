import { describe, it, expect } from 'vitest';
import { parseLiveAccounts, parseHistory, parsePostDays } from '@/lib/connectors/zernio';

// Mirrors the real Zernio/Late `/api/v1/accounts` shape: live follower counts
// live at metadata.profileData.followersCount (NOT top-level profileData).
const ACCOUNTS_FIXTURE = {
  accounts: [
    { platform: 'instagram', username: 'founderos.ai', metadata: { profileData: { followersCount: 52936 } } },
    { platform: 'tiktok', username: 'founderos.ai', metadata: { profileData: { followersCount: 10269 } } },
    { platform: 'youtube', username: 'founderosai', metadata: { profileData: { followersCount: 1140 } } },
    { platform: 'twitter', username: 'Founderosai', metadata: { profileData: { followersCount: 4178 } } },
    { platform: 'linkedin', username: 'Alex Rivera', metadata: { profileData: { followersCount: 1880 } } },
    // facebook count via page fan_count fallback
    { platform: 'facebook', username: 'Alex Rivera', metadata: { availablePages: [{ fan_count: 42 }] } },
    // no usable count anywhere -> omitted
    { platform: 'pinterest', username: 'x', metadata: { profileData: {} } },
  ],
};

describe('parseLiveAccounts', () => {
  it('extracts live followers from metadata.profileData.followersCount', () => {
    const map = parseLiveAccounts(ACCOUNTS_FIXTURE);
    expect(map.instagram?.followers).toBe(52936);
    expect(map.tiktok?.followers).toBe(10269);
    expect(map.youtube?.followers).toBe(1140);
    expect(map.twitter?.followers).toBe(4178);
    expect(map.linkedin?.followers).toBe(1880);
  });

  it('falls back to page fan_count when profileData has no count', () => {
    const map = parseLiveAccounts(ACCOUNTS_FIXTURE);
    expect(map.facebook?.followers).toBe(42);
  });

  it('prefixes the handle with @', () => {
    expect(parseLiveAccounts(ACCOUNTS_FIXTURE).instagram?.handle).toBe('@founderos.ai');
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

// Mirrors the `/api/history` shape: published posts with live post URLs.
const HISTORY_FIXTURE = [
  {
    id: '6a32c34d',
    post: 'Comment "loop" and I\'ll send you the guide.\n\nRight now you prompt AI.',
    platforms: ['instagram', 'tiktok', 'youtube'],
    status: 'success',
    created: '2026-06-17T15:54:53.452Z',
    postIds: [{ status: 'success', platform: 'instagram', postUrl: 'https://www.instagram.com/reel/DEMO0000001/' }],
  },
  {
    id: 'b2',
    post: 'second post',
    platforms: ['twitter'],
    status: 'success',
    created: '2026-06-15T10:00:00.000Z',
    postIds: [{ status: 'success', platform: 'twitter', postUrl: 'https://x.com/Founderosai/status/1' }],
  },
];

describe('parseHistory', () => {
  it('maps history entries to {platform, caption, url, publishedAt, status}', () => {
    const posts = parseHistory(HISTORY_FIXTURE);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      platform: 'instagram',
      url: 'https://www.instagram.com/reel/DEMO0000001/',
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
