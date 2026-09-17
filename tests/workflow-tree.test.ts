import { describe, it, expect } from 'vitest';
import { buildWorkflowTree, workflowStepParent, workflowToolIds } from '@/app/workflows/tree';
import type { WorkflowStep } from '@/lib/schemas';

function step(id: string, overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id,
    title: id,
    detail: '',
    ownerKind: 'agent',
    owner: 'Bot',
    hoursPerWeek: 0,
    tools: [],
    edgeLabel: null,
    leakUsd: null,
    automation: null,
    branch: null,
    ...overrides,
  };
}

describe('buildWorkflowTree', () => {
  it('is empty for an empty step list', () => {
    const tree = buildWorkflowTree([]);
    expect(tree.root).toBeNull();
    expect(tree.nodeCount).toBe(0);
    expect(tree.maxDepth).toBe(0);
  });

  it('threads a single step as a rootless-child, depth-0 tree', () => {
    const tree = buildWorkflowTree([step('a')]);
    expect(tree.root?.step.id).toBe('a');
    expect(tree.root?.depth).toBe(0);
    expect(tree.root?.children).toEqual([]);
    expect(tree.nodeCount).toBe(1);
    expect(tree.maxDepth).toBe(0);
  });

  it('threads the default (real workflow) topology into a single spine, in order', () => {
    const steps = [step('a'), step('b'), step('c'), step('d')];
    const tree = buildWorkflowTree(steps);
    expect(tree.nodeCount).toBe(4);
    expect(tree.maxDepth).toBe(3);

    // walk the spine and confirm it never branches and stays in order
    const seenIds: string[] = [];
    let node = tree.root;
    let depth = 0;
    while (node) {
      seenIds.push(node.step.id);
      expect(node.depth).toBe(depth);
      expect(node.children.length).toBeLessThanOrEqual(1);
      node = node.children[0] ?? null;
      depth += 1;
    }
    expect(seenIds).toEqual(['a', 'b', 'c', 'd']);
  });

  it('threads real branching when the topology names more than one child per parent', () => {
    // a forks into b and c; b continues to d
    const steps = [step('a'), step('b'), step('c'), step('d')];
    const parentIndex = (i: number) => {
      if (i === 0) return null; // a is root
      if (i === 1 || i === 2) return 0; // b, c both branch off a
      return 1; // d continues from b
    };
    const tree = buildWorkflowTree(steps, parentIndex);

    expect(tree.root?.step.id).toBe('a');
    expect(tree.root?.children).toHaveLength(2);
    // children stay in source array order (b before c), not re-sorted
    expect(tree.root?.children.map((c) => c.step.id)).toEqual(['b', 'c']);

    const branchB = tree.root!.children[0];
    const branchC = tree.root!.children[1];
    expect(branchB.children.map((c) => c.step.id)).toEqual(['d']);
    expect(branchC.children).toEqual([]);
    expect(branchB.depth).toBe(1);
    expect(branchB.children[0].depth).toBe(2);

    expect(tree.nodeCount).toBe(4);
    expect(tree.maxDepth).toBe(2);
  });

  it('drops steps unreachable from the root rather than mis-threading them', () => {
    // c declares a's index as its parent, but a is never itself attached
    // because rootIndex resolution only takes the FIRST parentless step —
    // here only step 0 is parentless, so step 2's stated parent (index 5,
    // out of range / never root-connected) makes it an orphan.
    const steps = [step('a'), step('b'), step('c')];
    const parentIndex = (i: number) => (i === 0 ? null : i === 1 ? 0 : 5);
    const tree = buildWorkflowTree(steps, parentIndex);
    expect(tree.root?.step.id).toBe('a');
    expect(tree.nodeCount).toBe(2); // a, b — c's declared parent never resolves
  });
});

describe('workflowStepParent', () => {
  it('threads a plain sequence exactly like the old default (no branch fields anywhere)', () => {
    const steps = [step('a'), step('b'), step('c')];
    const tree = buildWorkflowTree(steps, workflowStepParent);
    expect(tree.root?.step.id).toBe('a');
    expect(tree.root?.children.map((c) => c.step.id)).toEqual(['b']);
    expect(tree.root?.children[0].children.map((c) => c.step.id)).toEqual(['c']);
    expect(tree.nodeCount).toBe(3);
  });

  it('forks real siblings when two steps name the same branch.from, condition carried on each', () => {
    // triage forks into a noise leaf and a deal path that keeps going —
    // the wf-deals shape, at synthetic scale.
    const steps = [
      step('triage'),
      step('noise', { branch: { from: 'triage', condition: 'noise' } }),
      step('deal', { branch: { from: 'triage', condition: 'deal' } }),
      step('send'), // no branch — defaults to the previous array slot (deal)
    ];
    const tree = buildWorkflowTree(steps, workflowStepParent);
    expect(tree.root?.step.id).toBe('triage');
    expect(tree.root?.children.map((c) => c.step.id)).toEqual(['noise', 'deal']);
    expect(tree.root?.children[0].step.branch).toEqual({ from: 'triage', condition: 'noise' });
    expect(tree.root?.children[1].step.branch).toEqual({ from: 'triage', condition: 'deal' });
    expect(tree.root?.children[1].children.map((c) => c.step.id)).toEqual(['send']);
    expect(tree.nodeCount).toBe(4);
  });

  it('overrides the default previous-slot parent when branch.from points further back', () => {
    // approve forks into send and a revise leaf; send is immediately
    // followed by track (default parent = send, unaffected), and the
    // revise leaf sits at the END of the array but still attaches to
    // approve because its branch.from says so.
    const steps = [
      step('approve'),
      step('send', { branch: { from: 'approve', condition: 'approved' } }),
      step('track'), // default parent = send (previous slot) — correct either way
      step('revise', { branch: { from: 'approve', condition: 'rejected' } }),
    ];
    const tree = buildWorkflowTree(steps, workflowStepParent);
    const approve = tree.root!;
    expect(approve.children.map((c) => c.step.id)).toEqual(['send', 'revise']);
    const send = approve.children[0];
    expect(send.children.map((c) => c.step.id)).toEqual(['track']);
    expect(approve.children[1].children).toEqual([]);
    expect(tree.nodeCount).toBe(4);
  });

  it('falls back to the previous-slot parent when branch.from names an unknown step id', () => {
    const steps = [step('a'), step('b', { branch: { from: 'nope', condition: 'x' } })];
    const tree = buildWorkflowTree(steps, workflowStepParent);
    expect(tree.root?.children.map((c) => c.step.id)).toEqual(['b']);
  });
});

describe('workflowToolIds', () => {
  it('dedupes tools across steps in first-seen order', () => {
    const steps = [
      step('a', { tools: ['gmail', 'telegram'] }),
      step('b', { tools: ['gmail'] }),
      step('c', { tools: ['attio', 'telegram'] }),
    ];
    expect(workflowToolIds(steps)).toEqual(['gmail', 'telegram', 'attio']);
  });

  it('is empty when no step declares a tool', () => {
    expect(workflowToolIds([step('a'), step('b', { tools: [] })])).toEqual([]);
  });
});
