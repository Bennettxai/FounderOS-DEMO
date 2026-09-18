import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, test } from 'vitest';

/**
 * The stylesheet is appended to by every Slab import slice, and nothing
 * else in the net parses it: an unclosed block sailed through 2909 green
 * tests on 2026-09-17 and took every page on the dev server down. So parse
 * it, the way the build does, and fail loudly on a syntax error.
 */
describe('app/globals.css', () => {
  test('parses as CSS (no unclosed block, no stray brace)', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
    expect(() => postcss.parse(css, { from: 'app/globals.css' })).not.toThrow();
    expect(css.split('{').length).toBe(css.split('}').length);
  });
});
