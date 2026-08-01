import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * The G-Brain doctor/search pop-out must open with real motion — a scrim
 * fade and a panel glide — and land focus in the gbrain › search bar.
 * Regression guard: it used to snap in blank (and on non-dark themes the
 * entrance died entirely because --ease was scoped to the dark theme).
 */
describe('G-Brain query pop-out entrance', () => {
  test('overlay scrim fades and panel glides via dedicated classes', () => {
    const css = read('app/globals.css');
    expect(css).toContain('@keyframes overlay-in');
    expect(css).toContain('@keyframes panel-in');
    // reduced-motion kills both
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*?\.overlay-in[\s\S]*?animation:\s*none/);

    const core = read('components/BrainCore.tsx');
    expect(core).toMatch(/fixed inset-0[^"]*overlay-in|overlay-in[^"]*fixed inset-0/);
    expect(core).toContain('panel-in');
    expect(core).not.toMatch(/className="view /);
  });

  test('opening the pop-out focuses the search bar', () => {
    const query = read('components/BrainQuery.tsx');
    expect(query).toContain('autoFocus');
  });
});

describe('theme token completeness', () => {
  test('every theme resolves the full token set (universal :root covers shared constants)', () => {
    const css = read('app/globals.css');
    const blocks = [...css.matchAll(/(:root[^{}]*)\{([^}]*)\}/g)];
    const varsIn = (body: string) => new Set([...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

    const universal = new Set<string>();
    const perTheme: Record<string, Set<string>> = { dark: new Set(), light: new Set(), midnight: new Set(), ember: new Set(), mono: new Set() };

    for (const [, selector, body] of blocks) {
      const names = varsIn(body);
      const themes = [...selector.matchAll(/data-theme='(\w+)'/g)].map((m) => m[1]);
      // a bare :root in the selector list makes the block universal
      const hasBareRoot = selector
        .split(',')
        .some((s) => s.trim().split('\n').pop()!.trim() === ':root');
      if (hasBareRoot) for (const n of names) universal.add(n);
      for (const t of themes) names.forEach((n) => perTheme[t]?.add(n));
    }

    const union = new Set<string>([...universal]);
    for (const s of Object.values(perTheme)) for (const n of s) union.add(n);

    // --ease is a design constant: universal, not theme-scoped
    expect(universal.has('--ease')).toBe(true);

    for (const [theme, names] of Object.entries(perTheme)) {
      const resolved = new Set([...universal, ...names]);
      const missing = [...union].filter((n) => !resolved.has(n)).sort();
      expect(missing, `${theme} is missing tokens`).toEqual([]);
    }
  });
});
