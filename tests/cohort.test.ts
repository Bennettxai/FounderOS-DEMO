import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, test } from 'vitest';
import {
  COHORT_CTA,
  COHORT_STORAGE_KEY,
  COHORT_URL,
  shouldShowCohortModal,
} from '@/lib/cohort';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * FounderOS ships with a cohort upsell (one-time welcome pop-up + footer CTA
 * pointing at the FounderOS course). NikOS removes the upsell from the layout;
 * the modal-decision logic in lib/cohort.ts is kept and tested so the wiring
 * can be re-enabled without re-deriving it.
 */
describe('cohort invite constants', () => {
  it('points at TheFounderOS.com over https', () => {
    expect(COHORT_URL).toBe('https://thefounderos.com');
  });

  it('carries the exact footer CTA line', () => {
    expect(COHORT_CTA).toBe(
      'Want help setting this up? Go to the FounderOS cohort to learn how to build the entire thing end-to-end and get it into production.',
    );
  });

  it('namespaces its storage key so it never collides with the theme key', () => {
    expect(COHORT_STORAGE_KEY).toMatch(/^founderos-/);
    expect(COHORT_STORAGE_KEY).not.toBe('alex-theme');
  });
});

describe('shouldShowCohortModal', () => {
  it('fires on the home screen for a fresh install (nothing stored)', () => {
    expect(shouldShowCohortModal({ pathname: '/', stored: null })).toBe(true);
  });

  it('stays down once dismissed', () => {
    expect(shouldShowCohortModal({ pathname: '/', stored: 'seen' })).toBe(false);
  });

  it('never interrupts a deeper view — home only', () => {
    expect(shouldShowCohortModal({ pathname: '/agents', stored: null })).toBe(false);
    expect(shouldShowCohortModal({ pathname: '/brain', stored: null })).toBe(false);
  });

  it('treats a trailing slash on home as home', () => {
    expect(shouldShowCohortModal({ pathname: '', stored: null })).toBe(true);
  });
});

describe('wiring', () => {
  test('NikOS removes the cohort upsell from the shared layout', () => {
    const layout = read('app/layout.tsx');
    expect(layout).not.toContain('CohortBanner');
    expect(layout).not.toContain('CohortModal');
  });

});
