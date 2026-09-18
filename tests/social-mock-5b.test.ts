import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Mock 5b (the operator, 2026-09-07): /social stat cards say more with real data.
 * The growth card names the platform actually leading 7-day growth, the DM
 * card carries its Instagram · ManyChat source, the reply tile becomes
 * NEEDS REPLY with the age of the oldest waiting thread, and the audience
 * chart runs 30d / 90d / 1y with 90d selected. No invented numbers anywhere.
 */
describe('/social mock-5b: audience chart ranges', () => {
  const chart = read('components/AudienceConsistency.tsx');

  test('chips are 30d / 90d / 1y and 90d starts selected', () => {
    expect(chart).toContain("'90': '90d'");
    expect(chart).toContain("'365': '1y'");
    expect(chart).toMatch(/useState<Range>\(90\)/);
  });

  test('the card header names the range out loud', () => {
    expect(chart).toContain('Audience ·');
  });
});

describe('/social mock-5b: stat cards', () => {
  const strip = read('components/SocialStatStrip.tsx');

  test('the growth card names the real 7-day leader', () => {
    expect(strip).toContain('growthLeader');
    expect(strip).toMatch(/leads/);
  });

  test('the DM card carries its source: Instagram · ManyChat', () => {
    expect(strip).toContain('Instagram · ManyChat');
  });

  test('the reply tile is Needs reply with the oldest waiting age', () => {
    expect(strip).toContain('Needs reply');
    expect(strip).toMatch(/oldest/);
  });
});

describe('/social mock-5b: page feeds the leader from live platform growth', () => {
  test('the page computes growthLeader from the dashboard platforms', () => {
    const page = read('app/social/page.tsx');
    expect(page).toContain('growthLeader');
  });
});
