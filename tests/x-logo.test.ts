import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * the operator, 2026-09-09: "make it x logo not twitter, for social."
 *
 * The platform id stays `twitter` on purpose. It is the key Zernio returns,
 * the value in SocialPlatformSchema, and the column in seeded history; a
 * rename is a data migration for a logo change. What changes is everything
 * the operator actually sees: the mark, the label, and the series colour.
 */
describe('X, not the Twitter bird', () => {
  const files = ['app/social/page.tsx', 'app/analytics/page.tsx'];

  test('no screen imports the lucide bird any more', () => {
    for (const f of [...files, 'components/PostComposer.tsx', 'components/AudienceConsistency.tsx']) {
      expect(read(f), f).not.toMatch(/\bTwitter\b(?!\s*\/)/);
    }
  });

  test('the social and analytics platform maps render the X mark', () => {
    for (const f of files) {
      const src = read(f);
      expect(src, f).toContain('XLogo');
      expect(src, f).toMatch(/twitter:\s*XLogo/);
    }
  });

  test('the mark is the real X glyph, not a close icon', () => {
    const logo = read('components/XLogo.tsx');
    // simple-icons `siX` path, inlined so it stays out of the client bundle's
    // simple-icons import (lib/brand-logos.tsx is server-only)
    expect(logo).toContain('M14.234 10.162 22.977 0h-2.072');
    expect(logo).toContain('currentColor');
    expect(logo).toContain('viewBox="0 0 24 24"');
  });

  test('the label is X everywhere it is shown', () => {
    expect(read('lib/social.ts')).toContain("twitter: 'X'");
    expect(read('components/AudienceConsistency.tsx')).toContain("twitter: 'X'");
    expect(read('components/PostComposer.tsx')).toContain("label: 'X'");
    for (const f of ['lib/social.ts', 'components/AudienceConsistency.tsx', 'components/PostComposer.tsx']) {
      expect(read(f), f).not.toContain('Twitter / X');
    }
  });

  test('a queued post shows the label, never the raw platform id', () => {
    const src = read('components/PostComposer.tsx');
    const chip = src.slice(src.indexOf('post.platforms.map'));
    // {p} renders "twitter"; the id is a key, not a thing to show the operator
    expect(chip.slice(0, 400)).not.toMatch(/>\s*\{p\}\s*</);
    expect(chip.slice(0, 400)).toContain('PLATFORM_LABEL');
  });

  test('the series colour leaves Twitter blue behind', () => {
    for (const f of ['lib/social.ts', 'components/AudienceConsistency.tsx']) {
      expect(read(f), f).not.toContain('#1d9bf0');
    }
  });
});
