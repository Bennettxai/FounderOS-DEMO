import { describe, expect, test } from 'vitest';
import { wisprDetail } from '@/lib/connectors/wispr';

const counts = { dictations: 12345, notes: 0, todos: 0, meetings: 4 };

/**
 * the host rendered "last activity 13829m ago" for weeks. That is nine and a
 * half days, but nobody reads five-digit minutes, and the reason it is stale
 * is that the operator dictates on the laptop and the host only has a copy of
 * flow.sqlite. The readout has to say the true thing in a way you can read at
 * a glance.
 */
describe('wisprDetail', () => {
  test('reads minutes while the store is fresh', () => {
    expect(wisprDetail({ ...counts, minutesAgo: 7 })).toContain('last activity 7m ago');
  });

  test('rolls up to hours, then days, instead of five-digit minutes', () => {
    expect(wisprDetail({ ...counts, minutesAgo: 200 })).toContain('last activity 3h ago');
    expect(wisprDetail({ ...counts, minutesAgo: 13829 })).toContain('last activity 10d ago');
    expect(wisprDetail({ ...counts, minutesAgo: 13829 })).not.toMatch(/13829/);
  });

  test('names the reason once the store has stopped moving', () => {
    expect(wisprDetail({ ...counts, minutesAgo: 13829 })).toContain('stale on this box');
    expect(wisprDetail({ ...counts, minutesAgo: 200 })).not.toContain('stale on this box');
  });

  test('still reports the counts it read', () => {
    const detail = wisprDetail({ ...counts, minutesAgo: 1 });
    expect(detail).toContain('12,345 dictations');
    expect(detail).toContain('4 meetings');
  });
});
