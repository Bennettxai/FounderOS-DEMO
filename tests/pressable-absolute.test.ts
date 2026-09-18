import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * The press layer sets position: relative for its lens. Five controls in the
 * OS are pressable AND absolutely placed (the graph's Fullscreen tab, the
 * funnel views' tabs, the workflow builder's close), and the relative was
 * winning: they rendered in flow at the bottom of their frames, clipped by
 * overflow, invisible on live (found 2026-09-17). Placement must survive.
 */
describe('pressable keeps absolute and fixed placement', () => {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
  test('the override follows the base rule', () => {
    const base = css.indexOf('.pressable {');
    const abs = css.indexOf('.pressable.absolute {');
    expect(base).toBeGreaterThan(-1);
    expect(abs).toBeGreaterThan(base);
    expect(css.slice(abs, css.indexOf('}', abs))).toContain('position: absolute');
    const fixed = css.indexOf('.pressable.fixed {');
    expect(css.slice(fixed, css.indexOf('}', fixed))).toContain('position: fixed');
  });
});
