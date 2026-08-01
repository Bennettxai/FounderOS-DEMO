import { describe, it, expect } from 'vitest';
import { parseBeehiivStats } from '@/lib/connectors/beehiiv';

// Mirrors Beehiiv v2 `GET /publications/{id}?expand[]=stats` → data.stats.
describe('parseBeehiivStats', () => {
  it('reads active_subscriptions from data.stats', () => {
    expect(parseBeehiivStats({ data: { stats: { active_subscriptions: 1234 } } })).toEqual({ subscribers: 1234 });
  });

  it('treats 0 as a real count', () => {
    expect(parseBeehiivStats({ data: { stats: { active_subscriptions: 0 } } })).toEqual({ subscribers: 0 });
  });

  it('falls back to total_subscriptions, then a top-level stats object', () => {
    expect(parseBeehiivStats({ data: { stats: { total_subscriptions: 88 } } })).toEqual({ subscribers: 88 });
    expect(parseBeehiivStats({ stats: { active_subscriptions: 42 } })).toEqual({ subscribers: 42 });
  });

  it('returns null for malformed / missing input', () => {
    expect(parseBeehiivStats(null)).toBeNull();
    expect(parseBeehiivStats({})).toBeNull();
    expect(parseBeehiivStats({ data: { stats: {} } })).toBeNull();
    expect(parseBeehiivStats({ data: { stats: { active_subscriptions: 'nope' } } })).toBeNull();
  });
});
