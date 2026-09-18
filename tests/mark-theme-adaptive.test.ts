import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * the operator, 2026-08-07: on Daylight (and the other light themes) the G-Brain
 * graph lost its AI agents. Both marks are white-on-transparent PNGs, so a
 * hardcoded "always white" filter makes them invisible the moment the canvas
 * turns white. They have to flip to black with the theme.
 *
 * The marks are drawn inside an SVG <image>, where a Tailwind class cannot
 * reach the filter, so the contract is a shared CSS class plus per-theme
 * overrides in globals.css.
 */
const LIGHT_THEMES = ['light', 'mono-light'] as const;

describe('graph marks invert with the theme', () => {
  const css = read('app/globals.css');
  const vantage = read('components/VantageMark.tsx');
  const osmark = read('components/OsMark.tsx');

  test('neither mark hardcodes a white-only filter any more', () => {
    expect(vantage).not.toContain("filter: 'brightness(0) invert(1)'");
    expect(osmark).not.toContain("filter: 'brightness(0) invert(1)'");
  });

  test('both marks opt into the shared adaptive class', () => {
    expect(vantage).toContain('mark-adaptive');
    expect(osmark).toContain('mark-adaptive');
  });

  test('the class paints the marks white by default (dark canvases)', () => {
    const rule = css.match(/\.mark-adaptive\s*\{[^}]*\}/);
    expect(rule, '.mark-adaptive rule missing from globals.css').not.toBeNull();
    expect(rule![0]).toContain('brightness(0) invert(1)');
  });

  test('every light theme overrides them to solid black', () => {
    for (const theme of LIGHT_THEMES) {
      const selector = new RegExp(
        `:root\\[data-theme='${theme}'\\][^{]*\\.mark-adaptive[^{]*\\{[^}]*\\}`,
      );
      const rule = css.match(selector);
      expect(rule, `no .mark-adaptive override for the ${theme} theme`).not.toBeNull();
      // black, and explicitly NOT re-inverted back to white
      expect(rule![0]).toContain('brightness(0)');
      expect(rule![0]).not.toContain('invert(1)');
    }
  });
});
