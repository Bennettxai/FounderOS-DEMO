import { describe, expect, test } from 'vitest';
import { foldersToClusters, layoutBrainNodes, polar } from '@/lib/brain-viz';

describe('polar', () => {
  test('rounds to hydration-stable precision (server and client stringify identically)', () => {
    // raw cos/sin floats stringify differently across React server/client
    // passes ("...133605" vs "...13361") and warn on every /brain load
    for (let deg = 0; deg < 360; deg += 7.3) {
      const [x, y] = polar(260, 260, 206 + (deg % 9) - 4, deg);
      expect(x).toBe(Math.round(x * 100) / 100);
      expect(y).toBe(Math.round(y * 100) / 100);
    }
  });
});

describe('foldersToClusters', () => {
  test('maps store folders to clusters sorted by page count', () => {
    const clusters = foldersToClusters([
      { name: 'growth', files: 3 },
      { name: 'ops', files: 4 },
      { name: 'personal', files: 2 },
    ]);
    expect(clusters).toEqual([
      { label: 'ops', pages: 4 },
      { label: 'growth', pages: 3 },
      { label: 'personal', pages: 2 },
    ]);
  });

  test('caps at six clusters and folds the tail into misc', () => {
    const folders = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((name, i) => ({
      name,
      files: 8 - i,
    }));
    const clusters = foldersToClusters(folders);
    expect(clusters).toHaveLength(6);
    expect(clusters[5]).toEqual({ label: 'misc', pages: 3 + 2 + 1 }); // f + g + h
    expect(clusters.reduce((s, c) => s + c.pages, 0)).toBe(8 + 7 + 6 + 5 + 4 + 3 + 2 + 1);
  });

  test('drops empty folders and handles an empty store', () => {
    expect(foldersToClusters([])).toEqual([]);
    expect(foldersToClusters([{ name: 'empty', files: 0 }])).toEqual([]);
  });
});

describe('layoutBrainNodes', () => {
  const clusters = [
    { label: 'operations', pages: 4 },
    { label: 'growth', pages: 3 },
    { label: 'clients', pages: 3 },
  ];

  test('emits one node per page and one label per cluster', () => {
    const { nodes, labels } = layoutBrainNodes(clusters);
    expect(nodes).toHaveLength(10);
    expect(labels).toHaveLength(3);
    expect(labels.map((l) => l.label)).toEqual(['operations', 'growth', 'clients']);
  });

  test('cluster spans share 360° proportionally starting at -90°', () => {
    const { labels } = layoutBrainNodes(clusters);
    // operations spans -90° → 54° (4/10 of 360), so its mid-angle is -18°
    expect(labels[0].angle).toBeCloseTo(-18, 5);
    // growth spans 54° → 162°, mid 108°
    expect(labels[1].angle).toBeCloseTo(108, 5);
  });

  test('is deterministic and keeps nodes near the r=108 ring around (260,260)', () => {
    const a = layoutBrainNodes(clusters);
    const b = layoutBrainNodes(clusters);
    expect(a).toEqual(b);
    for (const node of a.nodes) {
      const r = Math.hypot(node.x - 260, node.y - 260);
      expect(r).toBeGreaterThan(103 - 1e-6); // 108 - max jitter 5
      expect(r).toBeLessThan(113 + 1e-6);
    }
  });

  test('handles an empty cluster list', () => {
    expect(layoutBrainNodes([])).toEqual({ nodes: [], labels: [] });
  });
});
