import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');

/** PLAN step 10 gap fills: the pieces of the remaining-routes pass that the
    earlier rebrand commits had not covered yet. Source pins, repo style. */
describe('step 10 gap fills', () => {
  test('ChatHub rail rows are lensed rows with a selected bar', () => {
    const hub = read('components/ChatHub.tsx');
    expect(hub).toContain('pressable is-row');
    // the selected conversation carries a 2px accent bar, not just a fill
    expect(hub).toMatch(/w-\[2px\]/);
  });

  test('TaskBoard cards can advance without dragging', () => {
    const board = read('components/TaskBoard.tsx');
    expect(board).toContain('nextStatus');
    expect(board).toMatch(/title=\{`Advance to/);
  });

  test('WorkflowTree steps click-select and open the step-detail drawer (Slab tree, 2026-09-17)', () => {
    const tree = read('components/WorkflowTree.tsx');
    expect(tree).toContain('selectedStepId');
    expect(tree).toMatch(/view step detail/i);
  });

  test('PostComposer confirms the queue on the button', () => {
    const composer = read('components/PostComposer.tsx');
    expect(composer).toMatch(/queued ·/);
    expect(composer).toContain('setDone');
  });
});
