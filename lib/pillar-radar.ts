import type { Agent, AgentRun, Department, SopTask } from '@/lib/schemas';
import { orderGraphDepartments } from '@/lib/knowledge-graph';
import { lifeAreaForDepartment } from '@/lib/life-map';

/**
 * Per-pillar health for the spider chart beside the G-Brain monitor: one axis
 * per department, scored 15..100 from real signals —
 *   55% how much of the pillar's agent roster is active,
 *   30% how fresh its latest agent run is,
 *   15% SOP coverage relative to roster size.
 * Pure + deterministic given its inputs.
 */
export type PillarAxis = {
  id: string;
  label: string;
  color: string;
  score: number;
  // the three signals the overall score is built from, each 0..100, exposed as
  // their own radar layers so you can see WHICH dimension drives each pillar
  roster: number;
  freshness: number;
  sop: number;
};

const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));

function runRecency(latest: AgentRun | undefined, now: number): number {
  if (!latest) return 0;
  const h = (now - new Date(latest.finishedAt).getTime()) / 3_600_000;
  if (!Number.isFinite(h) || h < 0) return 0;
  if (h <= 1) return 1;
  if (h <= 24) return 0.7;
  if (h <= 24 * 7) return 0.4;
  return 0.15;
}

export function pillarRadarAxes(
  departments: Department[],
  agents: Agent[],
  tasks: SopTask[],
  runsByAgent: Record<string, AgentRun>,
): PillarAxis[] {
  const ordered = orderGraphDepartments(departments, (d) => d.id);
  return ordered.map((d) => {
    const roster = agents.filter((a) => a.departmentId === d.id);
    const active = roster.filter((a) => a.status === 'active').length;
    const activeShare = roster.length > 0 ? active / roster.length : 0;
    const latest = roster
      .map((a) => runsByAgent[a.id])
      .filter((r): r is AgentRun => !!r)
      .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))[0];
    // freshest run wins; recency evaluated against the newest run's own clock
    // domain (Date.now at call time — deterministic within a render)
    const recency = runRecency(latest, Date.now());
    const sops = tasks.filter((t) => t.departmentId === d.id).length;
    const sopCoverage = roster.length > 0 ? Math.min(1, sops / roster.length) : sops > 0 ? 1 : 0;
    const score = Math.round(55 * activeShare + 30 * recency + 15 * sopCoverage);
    return {
      id: d.id,
      label: d.name,
      color: lifeAreaForDepartment(d.id)?.color ?? d.color,
      score: clamp(15, 100, Math.max(score, 15)),
      roster: Math.round(activeShare * 100),
      freshness: Math.round(recency * 100),
      sop: Math.round(sopCoverage * 100),
    };
  });
}

// ── Radar geometry + hover-to-sift layer picking ───────────────────────────

/** The overlaid data layers: overall health plus its three signals. */
export type PillarLayerKey = 'score' | 'roster' | 'freshness' | 'sop';
export const PILLAR_LAYER_KEYS: PillarLayerKey[] = ['score', 'roster', 'freshness', 'sop'];

/** Vertex for axis `i` of `count`, `radius` out from `center`. First axis at top. */
export function radarPoint(axisIndex: number, count: number, radius: number, center: number): [number, number] {
  const a = (axisIndex / Math.max(1, count)) * 2 * Math.PI - Math.PI / 2;
  return [center + radius * Math.cos(a), center + radius * Math.sin(a)];
}

/** A layer's polygon vertices at the current axis values. */
function layerVertices(axes: PillarAxis[], key: PillarLayerKey, R: number, center: number): [number, number][] {
  const n = axes.length;
  return axes.map((a, i) => radarPoint(i, n, (Math.max(5, a[key]) / 100) * R, center));
}

/** Distance from point p to segment ab. */
function distToSegment(p: { x: number; y: number }, a: [number, number], b: [number, number]): number {
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / len2));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

/**
 * The layer whose polygon the cursor is nearest — so moving the mouse over the
 * radar sifts through the layers, isolating one at a time. Ties and an empty
 * axis set resolve to 'score'.
 */
export function nearestPillarLayer(
  cursor: { x: number; y: number },
  axes: PillarAxis[],
  R: number,
  center: number,
): PillarLayerKey {
  if (axes.length === 0) return 'score';
  let best: PillarLayerKey = 'score';
  let bestD = Infinity;
  for (const key of PILLAR_LAYER_KEYS) {
    const v = layerVertices(axes, key, R, center);
    let d = Infinity;
    for (let i = 0; i < v.length; i++) {
      d = Math.min(d, distToSegment(cursor, v[i], v[(i + 1) % v.length]));
    }
    if (d < bestD) {
      bestD = d;
      best = key;
    }
  }
  return best;
}
