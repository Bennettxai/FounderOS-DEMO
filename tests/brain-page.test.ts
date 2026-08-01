import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * /brain layout contract (Alex, 2026-07-12): the capture box is ONE
 * compact untitled part riding the right of the G-BRAIN header — text or
 * dropped documents — and the knowledge graph sits directly under the title.
 */
describe('/brain header capture + graph placement', () => {
  test('the compact dump rides the header right slot; no standalone dump section', () => {
    const page = read('app/brain/page.tsx');
    expect(page).toMatch(/right=\{<BrainDump compact \/>\}/);
    expect(page).not.toMatch(/<section[^>]*>\s*<BrainDump \/>/);
  });

  test('the knowledge graph is the first section after the header', () => {
    const page = read('app/brain/page.tsx');
    const header = page.indexOf('<PageHeader');
    const graph = page.indexOf('Knowledge graph');
    const firstSection = page.indexOf('<section', header);
    expect(graph).toBeGreaterThan(header);
    // the first section on the page IS the graph section
    expect(page.indexOf('BrainGraphView', firstSection)).toBeLessThan(page.indexOf('</section>', firstSection));
  });

  test('BrainDump has a compact mode with document drop that reads files as text', () => {
    const dump = read('components/BrainDump.tsx');
    expect(dump).toMatch(/compact/);
    expect(dump).toMatch(/onDrop/);
    expect(dump).toMatch(/\.text\(\)/);
    // dropped docs keep their filename as the note title
    expect(dump).toMatch(/name\.replace/);
  });
});
