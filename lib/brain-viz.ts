/**
 * Deterministic geometry for the G-Brain knowledge-core visualization.
 * Pure functions — the SVG component renders whatever these emit, so the
 * layout is testable without a DOM.
 */

export type BrainCluster = { label: string; pages: number };
export type BrainNode = { x: number; y: number };
export type BrainClusterLabel = { angle: number; label: string; pages: number };

const CX = 260;
const CY = 260;
const RING_R = 108;
const MAX_CLUSTERS = 6;

/** Real brain-store folders → up to six viz clusters; the tail folds into `misc`. */
export function foldersToClusters(folders: { name: string; files: number }[]): BrainCluster[] {
  const nonEmpty = folders
    .filter((f) => f.files > 0)
    .sort((a, b) => b.files - a.files || a.name.localeCompare(b.name));
  if (nonEmpty.length <= MAX_CLUSTERS) {
    return nonEmpty.map((f) => ({ label: f.name, pages: f.files }));
  }
  const head = nonEmpty.slice(0, MAX_CLUSTERS - 1);
  const tail = nonEmpty.slice(MAX_CLUSTERS - 1);
  return [
    ...head.map((f) => ({ label: f.name, pages: f.files })),
    { label: 'misc', pages: tail.reduce((sum, f) => sum + f.files, 0) },
  ];
}

/**
 * Clusters share 360° proportionally to page count starting at -90°;
 * per-node jitter `((ci*7 + i*13) % 10) - 5` is added to the ring radius.
 */
export function layoutBrainNodes(clusters: BrainCluster[]): {
  nodes: BrainNode[];
  labels: BrainClusterLabel[];
} {
  const total = clusters.reduce((sum, c) => sum + c.pages, 0);
  if (total === 0) return { nodes: [], labels: [] };

  const nodes: BrainNode[] = [];
  const labels: BrainClusterLabel[] = [];
  let angle = -90;
  clusters.forEach((cluster, ci) => {
    const span = (cluster.pages / total) * 360;
    labels.push({ angle: angle + span / 2, label: cluster.label, pages: cluster.pages });
    for (let i = 0; i < cluster.pages; i++) {
      const a = ((angle + (span * (i + 0.5)) / cluster.pages) * Math.PI) / 180;
      const jitter = ((ci * 7 + i * 13) % 10) - 5;
      const r = RING_R + jitter;
      nodes.push({ x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) });
    }
    angle += span;
  });
  return { nodes, labels };
}

export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  // 2-decimal rounding: raw floats stringify differently between the server
  // and client React passes and warn about a cx/cy hydration mismatch
  return [Math.round((cx + r * Math.cos(a)) * 100) / 100, Math.round((cy + r * Math.sin(a)) * 100) / 100];
}
