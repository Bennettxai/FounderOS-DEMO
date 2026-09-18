import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Slab motion, every tab (the operator, 2026-09-17): after Finances and Social,
 * Home and every remaining page get the beat: their main blocks rise in on
 * a stagger through the shared Rise wrapper. Pages that own their whole
 * canvas (blueprint, adpilot, brand-deals, trading since 2026-09-18) carry
 * their own motion and are not listed here. The graph on /brain is untouched; only its chrome rises.
 */
const PAGES: Array<[string, number]> = [
  ['app/page.tsx', 3],
  ['app/agents/page.tsx', 1],
  ['app/analytics/page.tsx', 3],
  ['app/brain/page.tsx', 1],
  ['app/chats/page.tsx', 1],
  ['app/comms/page.tsx', 2],
  ['app/content/page.tsx', 3],
  ['app/content/lead-magnets/page.tsx', 1],
  ['app/doctor/page.tsx', 3],
  ['app/funnel/page.tsx', 2],
  ['app/integrations/page.tsx', 3],
  ['app/org/page.tsx', 1],
  ['app/personas/page.tsx', 1],
  ['app/reference/page.tsx', 1],
  ['app/roadmap/page.tsx', 1],
  ['app/skills/page.tsx', 1],
  ['app/social/[platform]/page.tsx', 2],
  ['app/social/beehiiv/page.tsx', 2],
  ['app/tasks/page.tsx', 2],
  ['app/usage/page.tsx', 1],
];

describe('slab motion: every tab rises', () => {
  test.each(PAGES)('%s carries at least %i staggered Rise blocks', (file, min) => {
    const src = read(file);
    expect(src).toMatch(/from '@\/components\/motion'/);
    const uses = (src.match(/<Rise[\s>]/g) ?? []).length;
    expect(uses, `${file}: <Rise> uses`).toBeGreaterThanOrEqual(min);
    expect(src).not.toMatch(/transition-(colors|all)\b/);
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  test('indices are distinct within a page so the stagger reads as a sequence', () => {
    for (const [file] of PAGES) {
      const src = read(file);
      const idx = [...src.matchAll(/<Rise[^>]*\bi=\{(\d+)\}/g)].map((m) => Number(m[1]));
      if (idx.length > 1) expect(new Set(idx).size, file).toBe(idx.length);
    }
  });
});

describe('slab motion: pies sweep clockwise from zero', () => {
  test('SharePie animates every slice in turn, on the house ease, and lands on the real shares', () => {
    const pie = read('components/SharePie.tsx');
    expect(pie).toContain('pathLength={1}');
    expect(pie).toContain('os-sweep');
    expect(pie).toMatch(/animationDelay/);
    expect(read('app/globals.css')).toContain('@keyframes os-sweep');
  });
});
