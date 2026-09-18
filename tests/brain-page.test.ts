import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * /brain layout contract (the operator, 2026-07-12): the capture box is ONE
 * compact untitled part riding the right of the G-BRAIN header — text or
 * dropped documents — and the knowledge graph sits directly under the title.
 */
describe('/brain header capture + graph placement', () => {
  test('the compact dump rides the header right slot; no standalone dump section', () => {
    const page = read('app/brain/page.tsx');
    expect(page).toMatch(/right=\{<BrainDump compact \/>\}/);
    expect(page).not.toMatch(/<section[^>]*>\s*<BrainDump \/>/);
  });

  test('the tab is the graph alone: it fills the view, health readouts moved to /doctor', () => {
    const page = read('app/brain/page.tsx');
    const header = page.indexOf('<PageHeader');
    const graph = page.indexOf('<BrainGraphView');
    // the graph is the sole content rendered under the header
    expect(graph).toBeGreaterThan(header);
    // single, no-scroll view: a viewport-height flex column with the graph filling it
    expect(page).toMatch(/h-\[calc\(100dvh/);
    expect(page).toMatch(/<BrainGraphView\s+fill/);
    // every health readout moved out — none of them render on the G-Brain tab
    for (const gone of ['PillarRadar', 'BrainCore', 'Pipeline', 'Query path', 'Storage layers']) {
      expect(page).not.toContain(gone);
    }
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

/**
 * The engine's health readouts (pillar health, doctor core, storage layers,
 * pipeline, query path) moved off the graph tab onto their own /doctor view so
 * the G-Brain tab can be a single, uncluttered screen (the operator).
 */
describe('/doctor holds the engine health readouts', () => {
  test('pillar health, the doctor core, storage, pipeline and query path all live on /doctor', () => {
    const page = read('app/doctor/page.tsx');
    for (const has of ['PillarRadar', 'BrainCore', 'pillar health', 'Storage layers', 'Pipeline', 'Query path']) {
      expect(page, `/doctor should render ${has}`).toContain(has);
    }
    // it is the health view, not the graph
    expect(page).not.toContain('BrainGraphView');
  });
});
