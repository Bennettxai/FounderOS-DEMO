import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { demoMemoryGraph } from '@/lib/memory-core';

/**
 * /brain is the knowledge graph and nothing else: a single full-bleed canvas
 * sized to the viewport, the way a fresh fork should see it. The engine's
 * health readouts (pillar health, doctor, storage, pipeline, query path) live
 * on /doctor so the graph tab stays one uninterrupted view.
 *
 * The memory core at the centre is the part a fork cannot inherit — it is
 * distilled from a markdown store on disk, which no forker has. Without a
 * stand-in the centre renders as a bare dot and the whole graph reads empty,
 * so the fallback is load-bearing here, not decorative.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('/brain is a full-bleed canvas', () => {
  const page = read('app/brain/page.tsx');

  test('the graph fills the viewport instead of sitting in a boxed section', () => {
    expect(page).toContain('fill');
    expect(page).toMatch(/h-\[calc\(100dvh/);
    expect(page).toContain('BrainGraphView');
  });

  test('the health readouts are not on this page any more', () => {
    for (const gone of ['PillarRadar', 'BrainCore', 'Query path', 'Pipeline']) {
      expect(page).not.toContain(gone);
    }
  });

  test('nothing on the page reaches for a private host or the owner data', () => {
    expect(page).not.toMatch(/hermes|tailnet|ts\.net|attio/i);
    expect(page.toLowerCase()).not.toContain('bennett');
  });
});

describe('/doctor keeps the health readouts', () => {
  const doctor = read('app/doctor/page.tsx');

  test('carries the pipeline and the query path moved off /brain', () => {
    expect(doctor).toContain('Pipeline');
    expect(doctor).toContain('Query path');
    expect(doctor).toContain('gbrain CLI');
  });

  test('carries the pillar health readouts', () => {
    expect(doctor).toContain('PillarRadar');
    expect(doctor).toContain('BrainCore');
  });

  test('is reachable from the sidebar', () => {
    const nav = read('lib/nav.ts');
    expect(nav).toContain("href: '/doctor'");
    expect(nav).toContain('Doctor');
  });
});

describe('demoMemoryGraph — the centre a fork actually sees', () => {
  const g = demoMemoryGraph();

  test('is a populated constellation, not an empty core', () => {
    // a bare dot is the bug; this has to read as a living second brain
    expect(g.nodes.length).toBeGreaterThan(100);
    expect(g.edges.length).toBeGreaterThan(g.nodes.length);
  });

  test('every node is laid out inside the unit disc, with finite coordinates', () => {
    for (const n of g.nodes) {
      expect(Number.isFinite(n.vx)).toBe(true);
      expect(Number.isFinite(n.vy)).toBe(true);
      // the core renders into a disc; a node outside it would be clipped away
      expect(Math.hypot(n.vx, n.vy)).toBeLessThanOrEqual(1.6);
    }
  });

  test('is deterministic, so the demo looks the same on every render', () => {
    const again = demoMemoryGraph();
    expect(again.nodes.map((n) => n.id)).toEqual(g.nodes.map((n) => n.id));
    expect(again.nodes[0].vx).toBe(g.nodes[0].vx);
  });

  test('holds generic business knowledge, with zero personal data', () => {
    const blob = JSON.stringify(g).toLowerCase();
    for (const leak of [
      'bennett', 'spooner', 'merydian', 'accelerant', 'attio', 'zernio',
      'fanbasis', 'manychat', 'wispr', 'obsidian', 'claude archive', 'larps',
    ]) {
      expect(blob).not.toContain(leak);
    }
    // and it is actually about running a business
    const folders = g.nodes.filter((n) => n.type === 'folder').map((n) => n.label);
    expect(folders).toContain('Sales Playbooks');
    expect(folders).toContain('Finance');
    expect(folders.length).toBeGreaterThanOrEqual(6);
  });

  test('the brain page falls back to it when there is no store on disk', () => {
    const page = read('app/brain/page.tsx');
    expect(page).toContain('demoMemoryGraph');
  });
});

/**
 * The graph is the piece this repo is forked for, so it must read as a generic
 * business template rather than one specific operator's stack. Ubiquitous SaaS
 * (Slack, Notion, Stripe) is deliberately kept — it makes the template useful.
 * The connector modules under lib/connectors keep their real vendor names too;
 * those are a feature. This guards the SEEDED ORG the graph is built from.
 */
describe('the knowledge graph is a blank canvas', () => {
  test('no node label or id names one operator specific stack', async () => {
    const { buildKnowledgeGraph } = await import('@/lib/knowledge-graph');
    const { openDb } = await import('@/lib/db');
    const { seedDatabase } = await import('@/lib/seed');
    const db = openDb(':memory:');
    seedDatabase(db);
    const g = buildKnowledgeGraph(db.agents.all(), db.departments.all(), db.people.all(), db.sopTasks.all());
    db.close();

    const identifying =
      /attio|zernio|fanbasis|higgsfield|manychat|arcads|wispr|fathom|remotion|openclaw|trakyo|beehiiv|webinarjam|pava|merydian|bennett|spooner|accelerant/i;
    const offenders = g.nodes.filter((n) => identifying.test(n.label) || identifying.test(n.id));
    expect(offenders.map((n) => `${n.kind}:${n.label}`)).toEqual([]);

    // and it is still a full graph, not one emptied out by the scrub
    expect(g.nodes.length).toBeGreaterThan(50);
  });
});
