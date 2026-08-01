/**
 * Organic tree layout for the focused G-Brain department.
 *
 * When a department is selected we stop drawing it as concentric rings and grow
 * it as a real tree, from the bottom up: the department is the trunk's base,
 * its SOP tasks are the main limbs, each task's single worker (an agent or a
 * human — monogamous, one per task) sits directly above it, and the tools that
 * worker uses are the leaves in the canopy. Skeleton branches lean at most
 * ~45° off vertical so the joints read as a tree that grew, not a right-angled
 * diagram; the canopy gets a de-overlap sweep so leaves never crowd.
 *
 * Pure + deterministic: no React, no DB. The component feeds these positions to
 * the force simulation as glide targets and draws the branches with `branchPath`.
 */

export type Pt = { x: number; y: number };

export type TreeNodePos = { x: number; y: number; depth: number };

/** A skeleton branch (trunk → branch → leaf). Angle-capped at ≤45° from vertical. */
export type TreeBranch = { source: string; target: string; depth: number };

export type TreeLayoutInput = {
  selfId: string;
  teamId: string;
  /** the focused team's SOP task nodes, in display order */
  taskIds: string[];
  /** taskId → the single worker (agent or person) who does it — monogamous */
  workerByTask: Record<string, string>;
  /** workerId → the tool ids that worker uses */
  toolsByWorker: Record<string, string[]>;
  width: number;
  height: number;
  /** horizontal breathing room kept at each edge (default 70) */
  margin?: number;
};

export type TreeLayoutResult = {
  positions: Map<string, TreeNodePos>;
  /** the tree skeleton — each ≤45° off vertical */
  branches: TreeBranch[];
  /** shared-tool "also uses" vines (non-owner agent → tool); not angle-capped */
  extraLinks: { source: string; target: string }[];
};

// y for each depth as a fraction of canvas height: self (root) at the ground,
// a real trunk up to the department, then task limbs, the worker band directly
// above them, and the tool canopy along the top. The team→task hop gets the
// biggest rise so the widest fan (tasks) has room under the ≤45° cap.
const DEPTH_FRAC = [0.86, 0.76, 0.5, 0.28, 0.09]; // 0 self · 1 team · 2 tasks · 3 workers · 4 tools — sized for the SETTLED physics (the node column pushes self ~16u below target), so the memory core at the trunk base keeps clear of the bottom edge even after equilibrium

// fan tasks out to the full 45° cone so they're well-spread and readable
const CONE = 1.0;
// spacing of the centralized tool shelf (shrinks evenly when a dept is dense)
const TOOL_SPACING = 90;
// fraction of a pillar's half-slice the resting layout gives its agents/tools
const SECTOR_FILL = 0.84;

const round2 = (n: number): number => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};

/**
 * An organic curved branch from `a` (parent, lower) to `b` (child, higher):
 * it rises mostly vertically out of the parent, bends through the middle, then
 * eases vertically into the child — an S that looks grown, never a straight rod.
 */
export function branchPath(a: Pt, b: Pt): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // Leave the junction diagonally (so limbs separate at the fork, not up the
  // trunk), then ease toward vertical as the branch reaches its leaf — the
  // shape of a branch growing out and up. A straight trunk (dx≈0) stays straight.
  const c1x = a.x + dx * 0.32;
  const c1y = a.y + dy * 0.42;
  const c2x = b.x - dx * 0.1;
  const c2y = a.y + dy * 0.78;
  return `M ${round2(a.x)} ${round2(a.y)} C ${round2(c1x)} ${round2(c1y)}, ${round2(c2x)} ${round2(c2y)}, ${round2(b.x)} ${round2(b.y)}`;
}

/**
 * A gentle quadratic arc from `a` to `b`, bowed perpendicular to the chord by
 * `bow`×length — turns the unfocused graph's straight spokes into soft curves
 * that read as a living web. Deterministic; consistent bow direction gives the
 * whole graph a subtle, coherent swirl rather than a starburst of rods.
 */
export function edgeArc(a: Pt, b: Pt, bow = 0.12): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const off = bow * len;
  const cx = mx + (-dy / len) * off; // perpendicular to the chord
  const cy = my + (dx / len) * off;
  return `M ${round2(a.x)} ${round2(a.y)} Q ${round2(cx)} ${round2(cy)}, ${round2(b.x)} ${round2(b.y)}`;
}

/** Smooth trunk→leaf taper: branch stroke width by depth, monotonic, min 1. */
export function branchWidth(depth: number): number {
  return round2(Math.max(1, 3.6 - depth * 0.8)); // 1→2.8, 2→2.0, 3→1.2
}

export type RestLayoutInput = {
  selfId: string;
  /** ordered pillars; tools must be deduped to one primary pillar each */
  pillars: { teamId: string; taskIds: string[]; workerIds: string[]; toolIds: string[] }[];
  /** radius per depth: [self, team, task, worker, tool]. Omit to derive from width/height. */
  ringR?: number[];
  cx: number;
  cy: number;
  /** angle of the first pillar (default straight up) */
  startAngle?: number;
  /** canvas size — used to derive responsive ring radii when ringR is omitted */
  width?: number;
  height?: number;
};

export type RestLayoutResult = { positions: Map<string, Pt> };

// Ring radii as fractions of the smaller canvas dimension. Five rings now —
// the SOP-task ring slots between the teams and the workers — spaced so the
// outer (tool) ring keeps label headroom on an 880×600 canvas. Scaling by the
// smaller dimension keeps every ring on-canvas on any aspect ratio.
const RING_FRAC = [0, 90 / 600, 146 / 600, 198 / 600, 248 / 600];

/** Responsive ring radii [self, team, task, worker, tool] for a given canvas size. */
export function responsiveRingR(width: number, height: number): number[] {
  const m = Math.max(1, Math.min(width, height));
  return RING_FRAC.map((f) => round2(f * m));
}

/**
 * The symmetric resting shape for the *unfocused* graph: self at the centre,
 * the pillars evenly spaced around ring 1, and each pillar's tasks (ring 2),
 * workers (ring 3) and tools (ring 4) balanced within that pillar's angular
 * sector — a clean sunburst the floaty forces gently hold the nodes to (and
 * drift them back to). Pure + deterministic.
 */
export function radialRestLayout(input: RestLayoutInput): RestLayoutResult {
  const { selfId, pillars, cx, cy } = input;
  const startAngle = input.startAngle ?? -Math.PI / 2;
  const ringR = input.ringR ?? responsiveRingR(input.width ?? 880, input.height ?? 600);
  const positions = new Map<string, Pt>();
  const polar = (r: number, a: number): Pt => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });

  positions.set(selfId, { x: cx, y: cy });

  // Density-weighted sectors: each pillar's angular span ∝ its node count, so a
  // crowded pillar (e.g. Sales) gets a wider wedge and its tools stop bunching,
  // while a sparse one stays tight. Centers sit at each span's midpoint, rotated
  // so the first pillar stays at `startAngle` — for a balanced graph (equal
  // weights) this reproduces the old evenly-spaced sunburst exactly.
  const n = Math.max(1, pillars.length);
  const weights = pillars.map((p) => Math.max(1, p.taskIds.length + p.workerIds.length + p.toolIds.length));
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  const spans = weights.map((w) => (w / total) * Math.PI * 2);
  const centersRaw: number[] = [];
  let cum = 0;
  for (let i = 0; i < n; i++) {
    centersRaw[i] = cum + spans[i] / 2;
    cum += spans[i];
  }
  const offset = startAngle - (centersRaw[0] ?? 0);

  pillars.forEach((p, i) => {
    const center = centersRaw[i] + offset;
    positions.set(p.teamId, polar(ringR[1], center));
    const half = (spans[i] / 2) * SECTOR_FILL;
    const ring = (ids: string[], r: number) => {
      const k = ids.length;
      ids.forEach((id, j) => {
        const t = k <= 1 ? 0 : (j / (k - 1)) * 2 - 1; // -1 … 1, symmetric about the pillar
        positions.set(id, polar(r, center + t * half));
      });
    };
    ring(p.taskIds, ringR[2]);
    ring(p.workerIds, ringR[3]);
    ring(p.toolIds, ringR[4]);
  });

  return { positions };
}

export function treeLayout(input: TreeLayoutInput): TreeLayoutResult {
  const { selfId, teamId, taskIds, workerByTask, toolsByWorker, width: W, height: H } = input;
  const margin = input.margin ?? 70;
  const cx = W / 2;
  const yOf = (depth: number) => H * DEPTH_FRAC[depth];
  const clampX = (x: number) => Math.max(margin, Math.min(W - margin, x));

  const positions = new Map<string, TreeNodePos>();
  const branches: TreeBranch[] = [];
  const extraLinks: { source: string; target: string }[] = [];

  // trunk — self at the base, the department just above it, both centered
  positions.set(selfId, { x: cx, y: yOf(0), depth: 0 });
  positions.set(teamId, { x: cx, y: yOf(1), depth: 1 });
  branches.push({ source: selfId, target: teamId, depth: 1 });

  // task limbs — fan above the department; the cone is capped by the rise so
  // the ≤45° lean always holds against this band's actual height gap.
  const teamY = yOf(1);
  const taskY = yOf(2);
  const workerY = yOf(3);
  const n = taskIds.length;
  const taskX = new Map<string, number>();
  taskIds.forEach((id, i) => {
    const dy = teamY - taskY; // > 0
    const half = Math.min(W / 2 - margin, dy * CONE);
    const t = n <= 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1 … 1
    const x = clampX(cx + t * half);
    taskX.set(id, x);
    positions.set(id, { x, y: taskY, depth: 2 });
    branches.push({ source: teamId, target: id, depth: 2 });
  });

  // workers — monogamous, so each sits DIRECTLY above its one task: a clean
  // vertical hop that keeps the task→worker pairing readable at a glance.
  const workerX = new Map<string, number>();
  const workerIds: string[] = [];
  for (const taskId of taskIds) {
    const w = workerByTask[taskId];
    if (!w) continue;
    const x = taskX.get(taskId) ?? cx;
    workerX.set(w, x);
    workerIds.push(w);
    positions.set(w, { x, y: workerY, depth: 3 });
    branches.push({ source: taskId, target: w, depth: 3 });
  }

  // assign each unique tool a primary owner (first worker, in order, that uses it)
  const owner = new Map<string, string>();
  const usersOf = new Map<string, string[]>();
  for (const id of workerIds) {
    for (const tool of toolsByWorker[id] ?? []) {
      const users = usersOf.get(tool) ?? usersOf.set(tool, []).get(tool)!;
      if (!users.includes(id)) users.push(id);
      if (!owner.has(tool)) owner.set(tool, id);
    }
  }

  // canopy — ONE centralized row across the top: every unique tool, ordered
  // by its owner's x (then name) to minimize crossings, spread symmetrically
  // about the trunk axis. Branches still run owner → tool, so shared tooling
  // reads as lines converging on the shared shelf.
  const toolBandY = yOf(4);
  const toolIds = [...owner.keys()].sort((a, b) => {
    const ax = workerX.get(owner.get(a)!) ?? cx;
    const bx = workerX.get(owner.get(b)!) ?? cx;
    return ax - bx || a.localeCompare(b);
  });
  const k = toolIds.length;
  const spacing = k <= 1 ? 0 : Math.min(TOOL_SPACING, (W - 2 * margin) / (k - 1));
  toolIds.forEach((tool, i) => {
    const x = clampX(cx + (i - (k - 1) / 2) * spacing);
    positions.set(tool, { x: round2(x), y: toolBandY, depth: 4 });
    branches.push({ source: owner.get(tool)!, target: tool, depth: 4 });
  });

  // shared tools — the non-owner users connect with a fainter vine
  for (const [tool, users] of usersOf) {
    const primary = owner.get(tool);
    for (const u of users) if (u !== primary) extraLinks.push({ source: u, target: tool });
  }

  return { positions, branches, extraLinks };
}

export type FocusWheel = { hub: Pt; scale: number; stage: number; squeeze: number };

/**
 * The wheel you turn INTO (Alex, 2026-07-12): while a pillar is focused the
 * background wheel is not a diagram floating mid-canvas — it becomes a huge
 * apparatus whose hub sinks BELOW the bottom edge, enlarged so its pillar ring
 * passes exactly through the focused tree's team band. The focused sector
 * points straight up at the viewer (stage = -π/2); stepping ←/→ rolls the
 * neighboring sectors over the rim. Unfocused sectors stay attached to the
 * same wheel — visible, transparent, one machine.
 *
 * `squeeze` compresses every sector's angular offset from the stage: on a
 * rigid wheel the neighbors would hang ~60° down the rim (below the canvas),
 * so a step read as "rising from the bottom". Squeezed, the neighbors hold at
 * the canvas SIDES and a turn sweeps laterally along the top arc — the motion
 * Alex asked for: from left and right, not from below.
 */
export function focusWheel(width: number, height: number, ringR: number[]): FocusWheel {
  const hub = { x: width / 2, y: height * 1.3 };
  const teamBandY = height * DEPTH_FRAC[1]; // where treeLayout puts the department
  const scale = (hub.y - teamBandY) / Math.max(1, ringR[1]);
  return { hub, scale, stage: -Math.PI / 2, squeeze: 0.45 };
}

/**
 * Project a node's symmetric resting spot onto the focus wheel: take its polar
 * angle about the home center (plus the live wheel turn), squeeze the offset
 * from the stage, scale its radius up, and re-anchor at the lowered hub.
 * Pure; the sim glides nodes toward this.
 */
export function wheelPoint(rest: Pt, homeCenter: Pt, fw: FocusWheel, wheelAngle: number): Pt {
  const raw = Math.atan2(rest.y - homeCenter.y, rest.x - homeCenter.x) + wheelAngle;
  const a = fw.stage + shortestAngleDelta(fw.stage, raw) * fw.squeeze;
  const r = Math.hypot(rest.x - homeCenter.x, rest.y - homeCenter.y) * fw.scale;
  return { x: fw.hub.x + r * Math.cos(a), y: fw.hub.y + r * Math.sin(a) };
}

/** Signed shortest cyclic distance from index `from` to `to` on an n-ring. */
export function cyclicDist(from: number, to: number, n: number): number {
  let d = (to - from) % n;
  if (d > n / 2) d -= n;
  if (d <= -n / 2) d += n;
  return d;
}

/** Float variant for the eased wheel phase: shortest signed delta with wrap. */
export function cyclicDeltaF(from: number, to: number, n: number): number {
  let d = (to - from) % n;
  if (d < 0) d += n;
  if (d > n / 2) d -= n;
  return d;
}

/**
 * The visible top of the wheel (Alex, 2026-07-12): pillars ride the RIM of
 * a huge wheel whose apex is the stage (the focused tree's team band). Offset
 * is in sectors — 0 at the apex, ±1 at the canvas edges a touch below it,
 * beyond that the rim has left the canvas. Feeding a smoothly-eased float
 * offset makes a step read as the wheel ROTATING: the neighbor arcs up and
 * over into the top positional view, exactly the way the arrow was pressed.
 */
const RIM_EDGE_INSET = 76; // flank pillar distance from the canvas edge
const RIM_DROP_FRAC = 0.13; // how far below the apex the flanks ride

/** One rim sector in radians — the angle the wheel turns per arrow press. */
export function wheelStageDelta(width: number, height: number): number {
  const dx = width / 2 - RIM_EDGE_INSET;
  const dy = height * RIM_DROP_FRAC;
  const R = (dx * dx + dy * dy) / (2 * dy);
  return Math.asin(dx / R);
}

/** The rim circle: hub, radius, and one sector's angle — the wheel's frame. */
export function wheelStageGeom(width: number, height: number): { hub: Pt; R: number; delta: number } {
  const apexY = height * DEPTH_FRAC[1];
  const dx = width / 2 - RIM_EDGE_INSET;
  const dy = height * RIM_DROP_FRAC;
  // the circle through the apex and both flank points
  const R = (dx * dx + dy * dy) / (2 * dy);
  return { hub: { x: width / 2, y: apexY + R }, R, delta: Math.asin(dx / R) };
}

export function wheelStageSpot(offset: number, width: number, height: number): Pt {
  const { hub, R, delta } = wheelStageGeom(width, height);
  const a = -Math.PI / 2 + offset * delta;
  return { x: round2(hub.x + R * Math.cos(a)), y: round2(hub.y + R * Math.sin(a)) };
}

/** Rotate a point around a center by theta radians (screen coords, y-down). */
export function rotateAbout(p: Pt, c: Pt, theta: number): Pt {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** Signed shortest angular distance from `a` to `b`, in (-π, π]. */
export function shortestAngleDelta(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}
