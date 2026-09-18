import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMPOSER_MAX_PX, COMPOSER_MIN_PX, composerHeight } from '@/lib/composer';

const read = (p: string) => readFileSync(p, 'utf8');

/**
 * the operator, 2026-08-18: "Typing in the conductor chat box, my words disappear
 * after I type one line."
 *
 * The composer sized itself with
 *   rows={Math.min(4, Math.max(1, input.split('\n').length))}
 * which counts NEWLINE CHARACTERS, not wrapped lines. Type a long paragraph
 * without ever pressing Enter and that stays 1, so the box stayed one row tall
 * and everything above the caret scrolled out of sight. Only someone who typed
 * literal line breaks would ever have seen it grow.
 *
 * The fix measures what the browser actually laid out (scrollHeight) instead of
 * guessing from the string.
 */
describe('composerHeight', () => {
  test('grows to fit what the browser actually laid out', () => {
    expect(composerHeight(64)).toBe(64);
  });

  test('stops growing at the cap so the composer cannot eat the panel', () => {
    expect(composerHeight(9000)).toBe(COMPOSER_MAX_PX);
  });

  test('never collapses below one line, so an empty box is still clickable', () => {
    expect(composerHeight(0)).toBe(COMPOSER_MIN_PX);
    expect(composerHeight(5)).toBe(COMPOSER_MIN_PX);
  });

  /** Server render and jsdom both report 0/NaN; neither may produce a 0px box. */
  test('survives a measurement that is not a usable number', () => {
    expect(composerHeight(Number.NaN)).toBe(COMPOSER_MIN_PX);
    expect(composerHeight(-40)).toBe(COMPOSER_MIN_PX);
  });

  test('the cap leaves room for a real paragraph, not two lines', () => {
    // ~19.5px per line at text-xs/leading-relaxed
    expect(COMPOSER_MAX_PX / 20).toBeGreaterThanOrEqual(8);
  });
});

describe('the composer no longer guesses its height from the string', () => {
  const src = () => read('components/ConductorComposer.tsx');

  test("the newline-counting rows= is gone", () => {
    expect(src()).not.toMatch(/input\.split\(['"]\\n['"]\)\.length/);
  });

  test('it measures the laid-out height instead', () => {
    expect(src()).toMatch(/scrollHeight/);
    expect(src()).toMatch(/composerHeight/);
  });

  /**
   * Height must be reset to auto before reading scrollHeight, or the box can
   * only ever grow: scrollHeight of an already-tall element stays tall when
   * the text is deleted, so it would never shrink back after sending.
   */
  test('it resets height before measuring, so the box shrinks back after send', () => {
    expect(src()).toMatch(/height = ['"]auto['"]/);
  });

  test('past the cap it scrolls internally rather than clipping', () => {
    expect(src()).toMatch(/overflow-y-auto/);
  });
});
