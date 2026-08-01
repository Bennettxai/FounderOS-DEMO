import { SELF_ID, type KGNodeKind, type KnowledgeGraph } from '@/lib/knowledge-graph';

/**
 * The horizontal "neural network" projection of the SAME knowledge graph the
 * radial view draws: a feedforward stack read left to right —
 *
 *   tools (labeled inputs) → workers → SOP tasks → pillars → Notes (output)
 *
 * Pure layout math: layer membership, node positions on a fixed canvas, and
 * the adjacent-layer "weight" strands (deterministic hash-signed, magnitude
 * in (0, 1]) that the component renders as the silky green/red web. Same-
 * layer `reports` edges come back separately for faint same-column arcs.
 * No React, no DOM, fully deterministic.
 */

export const NEURAL_W = 1200;
export const NEURAL_H = 640;
// column x anchors, input → output
const LAYER_X = [110, 380, 640, 890, 1080];
const PAD_Y = 46;
// vertical spread per layer: the network reads as a funnel — a tall labeled
// input column tightening toward the single output neuron
const LAYER_SPREAD = [1.0, 0.66, 0.48, 0.34, 0];

export type NeuralLayerKind = 'tool' | 'worker' | 'task' | 'team' | 'self';

export type NeuralLayer = {
  kind: NeuralLayerKind;
  /** display name for the floating layer card */
  name: string;
  nodeIds: string[];
};

export type NeuralStrand = {
  source: string;
  target: string;
  /** deterministic pseudo-weight in [-1, -0.05] ∪ [0.05, 1]: sign colors the
   * strand (green/red), magnitude drives its opacity */
  weight: number;
};

export type NeuralLayout = {
  layers: NeuralLayer[];
  pos: Map<string, { x: number; y: number }>;
  strands: NeuralStrand[];
  reports: { source: string; target: string }[];
};

const LAYER_OF_KIND: Record<KGNodeKind, number | null> = {
  tool: 0,
  employee: 1,
  person: 1,
  task: 2,
  team: 3,
  self: 4,
};

const LAYER_META: { kind: NeuralLayerKind; name: string }[] = [
  { kind: 'tool', name: 'INPUT · TOOLS' },
  { kind: 'worker', name: 'HL 1 · WORKERS' },
  { kind: 'task', name: 'HL 2 · SOP TASKS' },
  { kind: 'team', name: 'HL 3 · PILLARS' },
  { kind: 'self', name: 'OUTPUT · OBSIDIAN' },
];

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic signed weight for an edge — sign and magnitude from the id
 * pair, never exactly 0 so every strand keeps a color and a visible opacity. */
export function strandWeight(source: string, target: string): number {
  const h = hashStr(`${source}→${target}`);
  const mag = 0.05 + ((h >>> 8) % 950) / 1000; // 0.05 .. 1.0
  return h % 2 === 0 ? mag : -mag;
}

export function neuralLayout(graph: KnowledgeGraph): NeuralLayout {
  const layerIndexOf = new Map<string, number>();
  const layerIds: string[][] = [[], [], [], [], []];
  for (const n of graph.nodes) {
    const li = LAYER_OF_KIND[n.kind];
    if (li === null) continue;
    layerIds[li].push(n.id);
    layerIndexOf.set(n.id, li);
  }
  // stable order inside each column: keep builder order (dept-grouped) so
  // related nodes sit near each other vertically
  const layers: NeuralLayer[] = LAYER_META.map((meta, i) => ({ ...meta, nodeIds: layerIds[i] }));

  const pos = new Map<string, { x: number; y: number }>();
  layers.forEach((layer, li) => {
    const n = layer.nodeIds.length;
    const span = (NEURAL_H - 2 * PAD_Y) * LAYER_SPREAD[li];
    const top = (NEURAL_H - span) / 2;
    layer.nodeIds.forEach((id, i) => {
      const y = n === 1 ? NEURAL_H / 2 : top + (i / (n - 1)) * span;
      pos.set(id, { x: LAYER_X[li], y });
    });
  });

  const strands: NeuralStrand[] = [];
  const reports: { source: string; target: string }[] = [];
  for (const e of graph.edges) {
    const a = layerIndexOf.get(e.source);
    const b = layerIndexOf.get(e.target);
    if (a === undefined || b === undefined) continue;
    if (e.kind === 'reports') {
      reports.push({ source: e.source, target: e.target });
      continue;
    }
    if (Math.abs(a - b) !== 1) continue; // feedforward strands only
    // orient every strand left → right
    const [source, target] = a < b ? [e.source, e.target] : [e.target, e.source];
    strands.push({ source, target, weight: strandWeight(source, target) });
  }

  return { layers, pos, strands, reports };
}
