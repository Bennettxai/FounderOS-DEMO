import type { WorkflowStep } from '@/lib/schemas';

/**
 * Threads a workflow's flat, ordered step list into a rooted tree for the
 * expand-in-place view.
 *
 * Most steps still thread as a strict sequence: step i's parent is step
 * i-1, step 0 is the root. A step can override that by naming an explicit
 * `branch` (its declared parent's id + the condition that routes into it,
 * see `WorkflowBranchSchema` in lib/schemas.ts); two or more steps naming
 * the same parent fan out as real siblings under it, with the condition
 * label rendered on the connector into each. `workflowStepParent` below is
 * the parent-index function that reads that field; `buildWorkflowTree`
 * itself stays generic over "how do I find a step's parent" so this walk
 * needed no changes to support real branching. See
 * tests/workflow-tree.test.ts for both the default-spine and fan-out paths,
 * exercised against synthetic fixtures and the real branch topology.
 */
export type WorkflowTreeNode = {
  step: WorkflowStep;
  /** position in the source array */
  index: number;
  /** 0 at the root */
  depth: number;
  children: WorkflowTreeNode[];
};

export type WorkflowTree = {
  root: WorkflowTreeNode | null;
  /** nodes actually reachable from the root: steps orphaned by a broken
      parent pointer are dropped rather than silently mis-threaded */
  nodeCount: number;
  maxDepth: number;
};

/** Default topology: step i's parent is step i-1, step 0 is the root. */
const linearParent = (i: number) => (i === 0 ? null : i - 1);

/**
 * Real topology: a step whose `branch` names a prior step's id threads
 * there instead of "the previous array slot": the parent-index override
 * the module doc above describes. A step with no `branch`, or one whose
 * `branch.from` doesn't resolve to any step in this list, falls back to the
 * default linear parent so malformed data degrades to "still a sequence"
 * rather than orphaning the step.
 */
export function workflowStepParent(index: number, steps: WorkflowStep[]): number | null {
  if (index === 0) return null;
  const branch = steps[index].branch;
  if (branch) {
    const parentIndex = steps.findIndex((s) => s.id === branch.from);
    if (parentIndex !== -1) return parentIndex;
  }
  return index - 1;
}

export function buildWorkflowTree(
  steps: WorkflowStep[],
  parentIndex: (index: number, steps: WorkflowStep[]) => number | null = linearParent,
): WorkflowTree {
  if (steps.length === 0) return { root: null, nodeCount: 0, maxDepth: 0 };

  const nodes: WorkflowTreeNode[] = steps.map((step, index) => ({ step, index, depth: 0, children: [] }));

  // Group children by parent index, walking the source array in order so a
  // parent's children list is always in original array order: rendering
  // never depends on object identity or a Map's insertion-order quirks
  // beyond "earlier in the array, earlier in the tree."
  const childIndexesByParent = new Map<number, number[]>();
  let rootIndex: number | null = null;
  steps.forEach((_, i) => {
    const p = parentIndex(i, steps);
    if (p === null) {
      if (rootIndex === null) rootIndex = i; // first parentless step is the root
      return;
    }
    const list = childIndexesByParent.get(p);
    if (list) list.push(i);
    else childIndexesByParent.set(p, [i]);
  });

  if (rootIndex === null) return { root: null, nodeCount: 0, maxDepth: 0 };

  let nodeCount = 0;
  let maxDepth = 0;

  // Each index contributes to exactly one parent's child list (the forEach
  // above visits every i once), so this walk can never revisit a node or
  // loop: the parent relation is a function, which makes the whole
  // structure a forest by construction. Reachability from the root, not
  // cycle-avoidance, is the only thing that can drop a step (see the
  // "unreachable" test).
  function attach(i: number, depth: number): WorkflowTreeNode {
    nodeCount += 1;
    if (depth > maxDepth) maxDepth = depth;
    const node = nodes[i];
    node.depth = depth;
    const kids = childIndexesByParent.get(i) ?? [];
    node.children = kids.map((k) => attach(k, depth + 1));
    return node;
  }

  const root = attach(rootIndex, 0);
  return { root, nodeCount, maxDepth };
}

/**
 * External systems (tool ids) a workflow touches, in first-seen order
 * across its steps, deduplicated. Feeds the collapsed card's "connected
 * systems" chips: honest to exactly what the steps declare, nothing added.
 */
export function workflowToolIds(steps: WorkflowStep[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const step of steps) {
    for (const tool of step.tools) {
      if (!seen.has(tool)) {
        seen.add(tool);
        out.push(tool);
      }
    }
  }
  return out;
}
