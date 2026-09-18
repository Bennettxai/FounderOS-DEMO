import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * A custom property that is referenced but never defined does not error and
 * does not warn. `color: var(--muted)` with no --muted is simply an invalid
 * value, so the declaration is dropped and the element paints transparent.
 *
 * That is exactly how the Home pulse tiles shipped with invisible bars: the
 * Tailwind palette maps os-muted → var(--text-2) and os-dim → var(--text-3),
 * but eight files reach for the raw `var(--muted)` / `var(--dim)` names that
 * the palette never defines. Same for `--surface2` against `--surface-2`.
 *
 * This walks every var() reference in the app and fails on any that no rule
 * defines, so the next one is caught here instead of on a screenshot.
 */

/** Set by JS at runtime (pointer position, measured widths, graph camera) or
 *  by next/font on <html>, so globals.css is not where they come from. */
const RUNTIME_VARS = new Set([
  '--lx', '--ly', '--rx', '--ry', '--sx', '--sy',
  '--conductor-w', '--sidebar-w', '--funnel-s', '--agent-angle',
  '--kg-cam-k', '--kg-ddx', '--kg-ddy', '--kg-sdx', '--kg-sdy', '--kg-syn-delay', '--kg-c-',
  '--font-mono',
  // blueprint canvas (Slab import, 2026-09-17): set inline per node/edge by HierarchyCanvas
  '--c', '--d', '--ec', '--ga', '--gs', '--gox', '--goy', '--tx', '--ty', '--sc',
  // kind colours are picked by template (`var(--bh-k-${kind})`); every concrete --bh-k-* is defined in globals.css
  '--bh-k-',
]);

function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(process.cwd(), dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel);
      else if (/\.(ts|tsx|css)$/.test(name)) out.push(rel);
    }
  };
  walk('app'); walk('components'); walk('lib');
  return out;
}

describe('CSS custom properties', () => {
  const css = read('app/globals.css');
  const defined = new Set([...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));

  test('every var() the app references is defined somewhere', () => {
    const missing: string[] = [];
    for (const file of sources()) {
      const body = read(file);
      for (const m of body.matchAll(/var\((--[a-z0-9-]+)/g)) {
        const name = m[1];
        if (defined.has(name) || RUNTIME_VARS.has(name)) continue;
        missing.push(`${name} in ${file}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  test('the palette aliases exist, because call sites use both spellings', () => {
    for (const alias of ['--muted', '--dim', '--surface2']) {
      expect(defined.has(alias), `${alias} is not defined`).toBe(true);
    }
  });
});
