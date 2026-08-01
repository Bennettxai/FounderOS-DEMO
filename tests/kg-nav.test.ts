import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Graph navigation contract (Alex, 2026-07-12): side paddles turn the
 * wheel from mid-height — never only from the top bar — and the detail card
 * carries an explicit trail: Back · <pillar> steps node → pillar; the pillar
 * bar's Back steps pillar → home.
 */
describe('knowledge-graph wheel navigation', () => {
  test('inline view: side paddles at mid-height turn the wheel', () => {
    const src = read('components/KnowledgeGraph.tsx');
    expect(src).toContain('Turn to the previous pillar');
    expect(src).toContain('Turn to the next pillar');
    // vertically centered on the canvas edges, not the top bar
    expect(src).toMatch(/left-2 top-1\/2[^"]*-translate-y-1\/2/);
  });

  test('inline detail card walks back up the trail to the pillar', () => {
    const src = read('components/KnowledgeGraph.tsx');
    expect(src).toMatch(/Back to the \$\{focusedTeam\?\.label \?\? 'graph'\} pillar/);
  });

  test('fullscreen: selector rides the top-left, paddles hug the edges', () => {
    const src = read('components/KnowledgeGraphFullscreen.tsx');
    expect(src).toMatch(/absolute left-5 top-5 z-20/); // compact pillar selector
    expect(src).toMatch(/left-2 top-1\/2 z-20/); // left paddle
    expect(src).not.toContain('left-5 top-1/2'); // the old mid-left docked panel is gone
  });

  test('paddles stay pinned — no shifting when a detail card opens (Alex)', () => {
    // the arrow lives in ONE spot; a card may cover it, it never jumps around
    expect(read('components/KnowledgeGraphFullscreen.tsx')).not.toContain('right-[310px]');
    expect(read('components/KnowledgeGraph.tsx')).not.toContain('right-[264px]');
  });

  test('no auto-popping roster card on the Clients pillar (Alex: reads as a bug)', () => {
    const src = read('components/KnowledgeGraph.tsx');
    expect(src).not.toContain('ClientRosterCard');
    expect(src).not.toContain('rosterCard');
  });

  test('fullscreen detail aside carries the same back-trail', () => {
    const src = read('components/KnowledgeGraphFullscreen.tsx');
    expect(src).toMatch(/Back to the \$\{currentDept\?\.name \?\? 'graph'\} pillar/);
  });

  test('focus mode projects the rest of the graph onto the lowered wheel', () => {
    const src = read('components/KnowledgeGraph.tsx');
    expect(src).toContain('FOCUS_WHEEL');
    expect(src).toMatch(/wheelPoint\(r, \{ x: CX, y: CY \}, FOCUS_WHEEL, wheelRef.current\)/);
  });

  test('focus: departments ride the rim EXPANDED and a turn rigidly rotates them', () => {
    const src = read('components/KnowledgeGraph.tsx');
    // rim offsets come from the live float phase, not fixed slots
    expect(src).toMatch(/cyclicDeltaF\(phase, ti, n\)/);
    // every department has its own tree, mounted on the rim by rigid rotation
    expect(src).toMatch(/const allTrees: Map<string, TreeLayoutResult>/);
    expect(src).toMatch(/rotateAbout\(home, WHEEL_GEOM.hub, o \* WHEEL_GEOM.delta\)/);
    expect(src).toMatch(/const targetOf = \(d: SimNode\) => rim\(d\) \?\? tgt\(d\)/);
    // the phase carries momentum (wind up, coast, settle — a LARGE wheel)
    expect(src).toMatch(/stageVelRef.current \+= \(sd \* 0\.075 - stageVelRef.current\) \* 0\.09/);
    expect(src).toMatch(/stagePhaseRef.current \+= stageVelRef.current/);
    // and the dashed rails rotate with it about the sunken hub
    expect(src).toMatch(/rimGuideRef.current\?\.setAttribute/);
    // flank trees draw their limbs faint — expanded form, not condensed blobs
    expect(src).toMatch(/allTrees.get\(teamId\)\?\.branches/);
  });

  test('leaving a department GLIDES back into the circle — no teleport snap', () => {
    const src = read('components/KnowledgeGraph.tsx');
    // the near-rigid rest pull re-forms the sunburst visibly...
    expect(src).toMatch(/settleBoostRef.current = 0\.32/);
    // ...and no node positions are written directly on exit
    expect(src).not.toMatch(/n\.x = spun\.x/);
  });

  test('everything reads bright at rest — no dark tiers from the top view', () => {
    const src = read('components/KnowledgeGraph.tsx');
    const block = src.match(/const TIER_OPACITY[^}]+\}/)?.[0] ?? '';
    for (const m of block.matchAll(/:\s*([\d.]+)/g)) {
      expect(Number(m[1])).toBeGreaterThanOrEqual(0.9);
    }
  });

  test('flanks show a transparent PORTION of their department; the rest is hidden', () => {
    const src = read('components/KnowledgeGraph.tsx');
    expect(src).toMatch(/inFlankSector\s*\?\s*0\.2/); // the condensed cluster whisper
    expect(src).toMatch(/isFlank\s*\?\s*0\.6/); // the gateway itself
    expect(src).toMatch(/pointerEvents: hidden \? 'none' : undefined/);
    // and the background whisper web is gone during focus
    expect(src).toMatch(/if \(focusTree\) return null;/);
  });
});
