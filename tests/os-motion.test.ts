import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * OS-wide slab motion (the operator, 2026-09-17): the brand-deals slab's four
 * moves become shared utilities, extending the om-* vocabulary rather than
 * duplicating it: cards rise in on a stagger, numerals count in, bars fill,
 * lines draw. Finances and Social carry the full treatment; every page gets
 * the beat through PageHeader and SectionHead. Reduced motion lands
 * everything instantly.
 */
describe('slab motion: the shared utilities', () => {
  const css = read('app/globals.css');

  test('keyframes exist and ride the house ease', () => {
    for (const k of ['os-rise', 'os-draw', 'os-fill']) expect(css).toContain(`@keyframes ${k}`);
    const rise = css.match(/\.rise\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rise).toContain('os-rise');
    expect(rise).toContain('var(--ease)');
    expect(rise).toContain('var(--rise-i');
    expect(css).toMatch(/--rise-i:\s*0;/);
  });

  test('a rise-card hover changes two properties, on the lens clock', () => {
    const hover = css.match(/\.rise-card:hover\s*\{[^}]*\}/)?.[0] ?? '';
    expect(hover).toContain('transform');
    expect(hover).toContain('border-color');
    const base = css.match(/\.rise-card\s*\{[^}]*\}/)?.[0] ?? '';
    expect(base).toContain('var(--dur-lens)');
    expect(base).not.toContain('border-radius');
  });

  test('draw needs a unit path length; fill scales from the left', () => {
    const draw = css.match(/\.draw\s*\{[^}]*\}/)?.[0] ?? '';
    expect(draw).toContain('stroke-dasharray: 1');
    expect(draw).toContain('os-draw');
    const fill = css.match(/\.fill\s*\{[^}]*\}/)?.[0] ?? '';
    expect(fill).toContain('transform-origin: left');
    expect(fill).toContain('os-fill');
  });

  test('reduced motion kills all four moves', () => {
    const guards = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g) ?? [];
    const joined = guards.join('\n');
    for (const c of ['.rise', '.draw', '.fill']) expect(joined).toMatch(new RegExp(`${c.replace('.', '\\.')}[^{]*\\{[^}]*animation:\\s*none`));
  });

  test('Rise is a plain wrapper that sets the stagger index; CountUp formats money and audiences on the client', () => {
    const motion = read('components/motion.tsx');
    expect(motion).toContain('export function Rise');
    expect(motion).toContain("'--rise-i'");
    expect(motion).not.toContain("'use client'");
    const count = read('components/CountUp.tsx');
    expect(count).toContain("'use client'");
    expect(count).toMatch(/kind\?:/);
    expect(count).toContain("'usd'");
    expect(count).toContain("'followers'");
    expect(count).toContain('prefers-reduced-motion');
  });
});

describe('slab motion: every page gets the beat', () => {
  test('PageHeader and SectionHead rise', () => {
    expect(read('components/PageHeader.tsx')).toMatch(/className=\{`rise /);
    expect(read('components/terminal.tsx')).toMatch(/SectionHead[\s\S]*?className="rise /);
  });
});

describe('slab motion: Finances carries the full treatment', () => {
  const page = read('app/finances/page.tsx');

  test('the four summary tiles rise on a stagger and count their money in', () => {
    expect(page).toMatch(/from '@\/components\/motion'/);
    expect(page).toMatch(/from '@\/components\/CountUp'/);
    expect((page.match(/<Rise /g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect((page.match(/<CountUp [^>]*kind="usd"/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(page).toContain('rise-card');
  });

  test('the category bars fill and the business bars grow', () => {
    expect(read('components/MonthlyExpenses.tsx')).toMatch(/className="[^"]*\bfill\b/);
    expect(read('components/BusinessIncomeChart.tsx')).toMatch(/\bgrow\b/);
    expect(read('app/globals.css')).toContain('@keyframes os-grow');
  });
});

describe('slab motion: Social carries the full treatment', () => {
  const page = read('app/social/page.tsx');

  test('account cards rise on a stagger and count followers in; share bars fill', () => {
    expect(page).toMatch(/from '@\/components\/CountUp'/);
    expect(page).toMatch(/pressable is-row rise/);
    expect(page).toMatch(/'--rise-i'/);
    expect((page.match(/<CountUp [^>]*kind="followers"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((page.match(/\bfill\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test('the audience lines draw in, on the always-visible chart and inside the stat tiles', () => {
    const chart = read('components/AudienceConsistency.tsx');
    expect(chart).toMatch(/pathLength=\{1\} className="draw"/);
    const strip = read('components/SocialStatStrip.tsx');
    expect(strip).toContain('pathLength={1}');
    expect(strip).toMatch(/className="draw"/);
  });

  test('recent posts rise on a stagger too', () => {
    expect((page.match(/<Rise /g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('slab motion: house rules', () => {
  test.each(['components/motion.tsx', 'components/CountUp.tsx', 'app/finances/page.tsx', 'app/social/page.tsx'])('%s', (f) => {
    const src = read(f);
    expect(src).not.toMatch(/transition-(colors|all)\b/);
    expect(src).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
