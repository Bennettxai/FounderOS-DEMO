import { describe, expect, test } from 'vitest';
import { buildHierarchy, flattenNodes } from '@/lib/hierarchy';
import type { Agent, Department } from '@/lib/schemas';

const dept = (id: string, order: number): Department => ({
  id,
  name: id.replace('dept-', ''),
  slug: id.replace('dept-', ''),
  tagline: 't',
  color: '#fff',
  order,
});

const agent = (
  id: string,
  departmentId: string,
  tier: 'lead' | 'specialist' | 'worker',
  parentId: string | null = null,
): Agent => ({
  id,
  departmentId,
  name: id,
  role: 'r',
  status: 'active',
  tier,
  description: 'd',
  model: 'm',
  tools: [],
  parentId,
  instance: 'builtin',
});

describe('buildHierarchy', () => {
  test('nests workers under their parent agent via parentId', () => {
    const tree = buildHierarchy(
      [dept('dept-comms', 1)],
      [
        agent('comms-agent', 'dept-comms', 'lead'),
        agent('gmail-worker', 'dept-comms', 'worker', 'comms-agent'),
        agent('slack-worker', 'dept-comms', 'worker', 'comms-agent'),
      ],
    );
    const roots = tree.departments[0].roots;
    expect(roots).toHaveLength(1);
    expect(roots[0].agent.id).toBe('comms-agent');
    expect(roots[0].children.map((c) => c.agent.id)).toEqual(['gmail-worker', 'slack-worker']);
  });

  test('supports deeper nesting: lead → specialist → worker', () => {
    const tree = buildHierarchy(
      [dept('dept-x', 1)],
      [
        agent('top', 'dept-x', 'lead'),
        agent('mid', 'dept-x', 'specialist', 'top'),
        agent('leaf', 'dept-x', 'worker', 'mid'),
      ],
    );
    const top = tree.departments[0].roots[0];
    expect(top.children[0].agent.id).toBe('mid');
    expect(top.children[0].children[0].agent.id).toBe('leaf');
  });

  test('agents without a parent are department roots; orphaned parentIds fall back to root', () => {
    const tree = buildHierarchy(
      [dept('dept-x', 1)],
      [agent('solo', 'dept-x', 'lead'), agent('orphan', 'dept-x', 'worker', 'gone-agent')],
    );
    expect(tree.departments[0].roots.map((r) => r.agent.id)).toEqual(['solo', 'orphan']);
  });

  test('orders departments by order field and counts active agents', () => {
    const tree = buildHierarchy(
      [dept('dept-b', 2), dept('dept-a', 1)],
      [agent('a1', 'dept-a', 'lead'), { ...agent('b1', 'dept-b', 'lead'), status: 'planned' as const }],
    );
    expect(tree.departments.map((d) => d.department.id)).toEqual(['dept-a', 'dept-b']);
    expect(tree.totalAgents).toBe(2);
    expect(tree.activeAgents).toBe(1);
  });

  test('flattenNodes walks the tree depth-first', () => {
    const tree = buildHierarchy(
      [dept('dept-x', 1)],
      [
        agent('top', 'dept-x', 'lead'),
        agent('child', 'dept-x', 'worker', 'top'),
        agent('solo', 'dept-x', 'specialist'),
      ],
    );
    expect(flattenNodes(tree.departments[0].roots).map((n) => n.agent.id)).toEqual(['top', 'child', 'solo']);
  });
});
