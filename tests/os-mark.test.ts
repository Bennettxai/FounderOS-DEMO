import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Branding (Alex, 2026-07-13): the sidebar reads FOUNDER OS with the OS
 * ring mark from his Founder OS assets — the mark only, the wordmark rides
 * the mark; no raster emblem in the app chrome.
 */
describe('OS mark branding', () => {
  test('the mark is the ring with an UPRIGHT letter-S seam in brand red', () => {
    const mark = read('components/OsMark.tsx');
    expect(mark).toContain('#ef4444');
    // vertical S (Alex: "vertical like the O") — stacked arcs, no rotation
    expect(mark).toContain('d="M 50 22.53 A 13.74 13.74 0 0 0 50 50 A 13.74 13.74 0 0 1 50 77.47"');
    expect(mark).not.toContain('rotate(');
    expect(mark).toMatch(/circle cx=\{50\} cy=\{50\} r=\{30\.8\}/);
  });

  test('the sidebar brands with the mark, no raster emblem', () => {
    const sidebar = read('components/Sidebar.tsx');
    expect(sidebar).toContain('OsMark');
    expect(sidebar).toContain('FOUNDER OS');
    expect(sidebar).not.toMatch(/emblem|\.png/i);
    // the mark renders no text at all — the logo is the only lockup element
    expect(read('components/OsMark.tsx')).not.toMatch(/<text/);
  });
});
