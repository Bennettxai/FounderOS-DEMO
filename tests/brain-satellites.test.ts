import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { summarizeSatellites } from '@/lib/brain-satellites';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * G-Brain satellites (Slab import, 2026-09-17): the small panels that
 * float around the Slab radial (identity block, page counter, ask bar with
 * its retrieval notice, viewfinder corners, footer ticker) placed around the operator's graph without touching the graph. The
 * capture box stays in the header, where the operator put it. Data comes from a
 * dedicated route so the page never waits on it.
 */
const NOW = Date.parse('2026-09-17T12:00:00Z');
const DAY = 86_400_000;

describe('summarizeSatellites: honest counts off the store', () => {
  const overview = {
    store: { path: '/x', totalFiles: 6, folders: [{ name: 'sales', files: 3 }, { name: 'inbox', files: 2 }, { name: 'tech', files: 1 }] },
    doctor: { connected: true, status: 'ok', healthScore: 92, checks: [], detail: '900+ pages' },
  };

  test('pages, clusters and freshness from real folders and mtimes', () => {
    const mtimes = [NOW - 1 * DAY, NOW - 10 * DAY, NOW - 40 * DAY, NOW - 100 * DAY, NOW - 200 * DAY, NOW - 365 * DAY];
    const s = summarizeSatellites({ overview, mtimes, status: { connected: true, provider: 'gbrain', detail: 'live' }, now: NOW });
    expect(s.mounted).toBe(true);
    expect(s.pages).toBe(6);
    expect(s.clusters.map((c) => c.label)).toEqual(['sales', 'inbox', 'tech']);
    expect(s.clusters.map((c) => c.pages)).toEqual([3, 2, 1]);
    expect(s.freshPct).toBe(33); // 2 of 6 within 30 days
    expect(s.stalePct).toBe(50); // 3 of 6 at or beyond 90 days
    expect(s.statusLine).toContain('gbrain');
  });

  test('no notes means no percentages, never 0% dressed as a fact', () => {
    const s = summarizeSatellites({ overview: { ...overview, store: { ...overview.store, totalFiles: 0, folders: [] } }, mtimes: [], status: { connected: false, provider: 'stub', detail: 'not wired' }, now: NOW });
    expect(s.mounted).toBe(false);
    expect(s.pages).toBe(0);
    expect(s.freshPct).toBeNull();
    expect(s.stalePct).toBeNull();
    expect(s.clusters).toEqual([]);
  });
});

describe('the satellite layer', () => {
  test('is a client island with the six Slab panels, fed by its own route', () => {
    const src = read('components/BrainSatellites.tsx');
    expect(src).toContain("'use client'");
    expect(src).toContain("fetch('/api/brain/satellites')");
    expect(src).toContain('g-brain ›');
    expect(src).toContain('/api/brain?q=');
    expect(src).toContain('retrieved from');
    expect(src).not.toContain('LEGEND'); // dropped on request: the graph has its own legend
    expect(src).toMatch(/<form[^>]*className=\{`[^`]*left-3 top-3/); // the ask bar sits top-left of the canvas
    expect(src).toMatch(/right-\[124px\] top-3/); // identity sits beside the graph's Fullscreen tab
    expect(src).toContain('MutationObserver'); // quiet mode reads the graph's own DOM, never its code
    expect(src).toContain('Back to the home view');
    expect(src).toContain('.kg-panel');
    expect(src).toMatch(/opacity: quiet \? 0 : 1/);
    expect(src).toContain('transition: \'opacity var(--dur-panel) var(--ease)\'');
    expect(src).not.toContain('gbr-corner'); // corners dropped: they collided with the graph's own controls
    expect(src).toContain('const CHIP'); // one recipe for every chip, mirroring the graph's Fullscreen tab
    expect(src).toMatch(/rounded-sm-t border border-os-border-strong bg-os-bg\/80 px-2 py-1 font-mono text-\[10\.5px\] text-os-muted backdrop-blur/);
    expect(src).toContain('live retrieval');
    expect(src).toContain('rise');
  });

  test('rides the colorway and the house rules: no raw hex, every button pressable, no single-property hover', () => {
    const src = read('components/BrainSatellites.tsx');
    expect(src).not.toMatch(/#[0-9a-f]{6}\b/i);
    expect(src).not.toMatch(/transition-(colors|all)\b/);
    expect(src).not.toContain('—');
    expect(src).not.toMatch(/\p{Extended_Pictographic}/u);
    for (const m of src.matchAll(/<button[^>]*>/gs)) expect(m[0]).toContain('pressable');
  });

  test('the route exists and is on the API smoke net', () => {
    expect(existsSync(join(process.cwd(), 'app/api/brain/satellites/route.ts'))).toBe(true);
    expect(read('tests/smoke-api.test.ts')).toContain("route: 'brain/satellites'");
  });

  test('the page mounts the layer over a relative graph frame and keeps the graph and the header capture as they were', () => {
    const page = read('app/brain/page.tsx');
    expect(page).toContain('<BrainSatellites');
    expect(page).toMatch(/className="[^"]*relative[^"]*"[^>]*>\s*(<Rise[^>]*>\s*)?<BrainGraphView/);
    expect(page).toMatch(/<BrainGraphView\s+fill/);
    expect(page).toMatch(/right=\{<BrainDump compact \/>\}/);
  });
});
