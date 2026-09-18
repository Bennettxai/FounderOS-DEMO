import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildKnowledgeGraph, SELF_ID } from '@/lib/knowledge-graph';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Paperclip board agents in the G-Brain graph (the operator, 2026-08-07): the live
 * non-lead seats (Conductor, Forge, the Hermes pool, …) orbit the core as a
 * perfectly even inner ring, each wearing the Vantage mark, each clickable
 * into a run-capable card. The five department leads stay merged into their
 * pillar nodes — they never appear twice.
 */

const BOARD = [
  { id: 'pc-conductor', name: 'Conductor' },
  { id: 'pc-forge', name: 'Forge' },
  { id: 'pc-hermes', name: 'Hermes Workers' },
];

describe('buildKnowledgeGraph board agents', () => {
  test('each live seat becomes a board node wired straight to the operator', () => {
    const g = buildKnowledgeGraph([], [], [], [], BOARD);
    const nodes = g.nodes.filter((n) => n.kind === 'board');
    expect(nodes.map((n) => n.id).sort()).toEqual(['board:pc-conductor', 'board:pc-forge', 'board:pc-hermes']);
    for (const n of nodes) {
      expect(g.edges).toContainEqual({ source: SELF_ID, target: n.id, kind: 'board' });
    }
  });

  test('seat order is deterministic (sorted by name) so the ring never reshuffles', () => {
    const shuffled = [BOARD[2], BOARD[0], BOARD[1]];
    const g = buildKnowledgeGraph([], [], [], [], shuffled);
    expect(g.nodes.filter((n) => n.kind === 'board').map((n) => n.label)).toEqual([
      'Conductor',
      'Forge',
      'Hermes Workers',
    ]);
  });

  test('no board param (or an unreachable board) → zero board nodes, no demo', () => {
    const g = buildKnowledgeGraph([], []);
    expect(g.nodes.filter((n) => n.kind === 'board')).toEqual([]);
    expect(g.edges.filter((e) => e.kind === 'board')).toEqual([]);
  });
});

describe('board ring render contract', () => {
  test('rest layout places board seats on an evenly-divided inner circle', () => {
    const kg = read('components/KnowledgeGraph.tsx');
    expect(kg).toContain('const BOARD_R');
    expect(kg).toContain('((i + 0.5) / board.length) * Math.PI * 2'); // even angular spacing = symmetric
  });

  test('board seats are first-class graph citizens: legend, palette, click-to-card', () => {
    const kg = read('components/KnowledgeGraph.tsx');
    expect(kg).toContain("['team', 'board', 'task', 'person', 'employee', 'tool']");
    expect(kg).toContain("board: 'var(--muted)'"); // edge colour — no green (the operator)
    expect(kg).toContain('setSelectedBoardId(n.id)');
    expect(kg).toContain('agentCard || toolCard || headCard || boardCard'); // sidecar guard knows the card
  });

  test('the canvas pans on drag and zooms on the scroll wheel', () => {
    const kg = read('components/KnowledgeGraph.tsx');
    expect(kg).toContain("addEventListener('wheel', onWheel, { passive: false })");
    expect(kg).toContain('onCanvasPointerDown');
    expect(kg).toContain('userViewRef.current = null'); // clicks hand the camera back
  });

  test('the Hermes seat card embeds the live worker-pool dashboard', () => {
    expect(read('app/brain/page.tsx')).toContain('hermesUrl');
    const kg = read('components/KnowledgeGraph.tsx');
    expect(kg).toContain('/hermes/i.test(node.label)');
    const card = read('components/KnowledgeDetail.tsx');
    expect(card).toContain('<iframe src={embed.url}');
  });

  test('the page feeds only NON-lead live seats into the ring (leads are the pillars)', () => {
    const page = read('app/brain/page.tsx');
    expect(page).toContain('leadNames');
    expect(page).toContain('boardAgents');
  });
});

describe('agent icons: white Vantage mark + the OS emblem', () => {
  test('the logo rides in public/ and the icon flattens theme-adaptively (white on dark)', () => {
    expect(existsSync(join(process.cwd(), 'public', 'vantage-mark.png'))).toBe(true);
    const mark = read('components/VantageMark.tsx');
    expect(mark).toContain('/vantage-mark.png');
    // flattened white either inline or via the shared .mark-adaptive class
    // (globals.css), which also flips it black on the light themes
    expect(/brightness\(0\) invert\(1\)|mark-adaptive/.test(mark)).toBe(true);
  });

  test('AI agents wear the Vantage mark; board seats wear the OS emblem', () => {
    const kg = read('components/KnowledgeGraph.tsx');
    expect(kg).toContain("employee: { color: 'var(--kg-employee, var(--accent))', Icon: VantageMark");
    expect(kg).toContain("Icon: OsMarkGlyph, label: 'Board agents'");
    expect(read('components/GraphDirectory.tsx')).toContain('employee: VantageMark');
    expect(read('components/OsMark.tsx')).toContain('/os-emblem.png');
  });
});
