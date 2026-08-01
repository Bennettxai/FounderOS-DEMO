import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Bundle contract: the heavy interaction-driven visualizations must reach the
 * browser via next/dynamic with ssr:false and a dimension-matched placeholder,
 * so route First Load JS stays lean and nothing shifts when they hydrate.
 * (Home/comms graphs are lightweight hand-rolled SVG with no heavy deps, so
 * they are intentionally left eager.)
 */
describe('code-splitting the heavy graphs', () => {
  test('BrainGraphView loads KnowledgeGraph and NeuralGraph lazily, client-only', () => {
    const src = read('components/BrainGraphView.tsx');
    expect(src).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\('@\/components\/KnowledgeGraph'\)/);
    expect(src).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\('@\/components\/NeuralGraph'\)/);
    const ssrFalse = src.match(/ssr:\s*false/g) ?? [];
    expect(ssrFalse.length).toBeGreaterThanOrEqual(2);
    // dimension-matched skeletons: the wheel canvas is 680px tall, the neural
    // canvas keeps its 1200/640 viewBox aspect
    expect(src).toContain('h-[680px]');
    expect(src).toContain('1200 / 640');
    // no eager imports remain
    expect(src).not.toMatch(/import \{ KnowledgeGraph \}/);
    expect(src).not.toMatch(/import \{ NeuralGraph \}/);
  });

  test('the social page pulls AudienceConsistency through a lazy client wrapper', () => {
    expect(existsSync(join(process.cwd(), 'components/AudienceConsistencyLazy.tsx'))).toBe(true);
    const lazy = read('components/AudienceConsistencyLazy.tsx');
    expect(lazy).toContain("'use client'");
    expect(lazy).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\('@\/components\/AudienceConsistency'\)/);
    expect(lazy).toMatch(/ssr:\s*false/);
    expect(lazy).toContain('rounded-lg-t border border-os-border bg-os-surface'); // card-shaped placeholder
    const page = read('app/social/page.tsx');
    expect(page).toContain('AudienceConsistencyLazy');
    expect(page).not.toMatch(/from '@\/components\/AudienceConsistency';/);
  });

  test('the funnel page pulls both graph engines through a lazy client wrapper', () => {
    expect(existsSync(join(process.cwd(), 'components/FunnelGraphsLazy.tsx'))).toBe(true);
    const lazy = read('components/FunnelGraphsLazy.tsx');
    expect(lazy).toContain("'use client'");
    expect(lazy).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\('@\/components\/FunnelRadial'\)/);
    expect(lazy).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\('@\/components\/FunnelSpace'\)/);
    const ssrFalse = lazy.match(/ssr:\s*false/g) ?? [];
    expect(ssrFalse.length).toBeGreaterThanOrEqual(2);
    // aspect-matched skeletons: radial svg is 1100/680, the orbit space 1100/460
    expect(lazy).toContain('1100 / 680');
    expect(lazy).toContain('1100 / 460');
    const page = read('app/funnel/page.tsx');
    expect(page).toContain('FunnelRadialLazy');
    expect(page).toContain('FunnelSpaceLazy');
    expect(page).not.toMatch(/from '@\/components\/FunnelRadial';/);
    expect(page).not.toMatch(/from '@\/components\/FunnelSpace';/);
    // retired engines stay retired (2026-07-21 reverts)
    expect(page).not.toMatch(/FunnelNeural/);
    expect(existsSync(join(process.cwd(), 'components/FunnelNeural.tsx'))).toBe(false);
    expect(existsSync(join(process.cwd(), 'components/FunnelFlow.tsx'))).toBe(false);
  });
});
