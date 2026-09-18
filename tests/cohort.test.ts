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
 * Demo growth loop: a one-time welcome pop-up on the home screen the first
 * time someone runs the demo, plus a permanent footer CTA on every view. Both
 * point at the FounderOS cohort. The copy and the "once per browser" rule are
 * the load-bearing bits — lock them here.
 */
describe('cohort invite constants', () => {
  it('points at founderos.example.com over https', () => {
    expect(COHORT_URL).toBe('https://founderos.example.com');
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
  test('the footer CTA renders inside the shared layout, under every page', () => {
    const layout = read('app/layout.tsx');
    expect(layout).toContain('CohortBanner');
    expect(layout).toContain('CohortModal');
    // banner sits after {children} inside <main>, so it is the last thing on
    // every view rather than a per-page opt-in
    expect(layout.indexOf('{children}')).toBeLessThan(layout.indexOf('<CohortBanner'));
  });

  test('the banner is a server-rendered link to founderos.example.com carrying the CTA', () => {
    const src = read('components/CohortBanner.tsx');
    expect(src).toContain('COHORT_CTA');
    expect(src).toContain('COHORT_URL');
    expect(src).toContain('rel="noreferrer"');
    expect(src).not.toContain("'use client'"); // static — no JS shipped for it
  });

  test('the modal is client-side, once per browser, and links to the cohort', () => {
    const src = read('components/CohortModal.tsx');
    expect(src).toContain("'use client'");
    expect(src).toContain('shouldShowCohortModal');
    expect(src).toContain('COHORT_STORAGE_KEY');
    expect(src).toContain('COHORT_URL');
    // dismissal persists, so it never nags twice
    expect(src).toMatch(/localStorage\.setItem\(COHORT_STORAGE_KEY/);
  });
});
