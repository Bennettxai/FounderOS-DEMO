import { afterAll, describe, expect, test } from 'vitest';
import {
  branchPath,
  branchWidth,
  cyclicDeltaF,
  cyclicDist,
  edgeArc,
  focusWheel,
  radialRestLayout,
  responsiveRingR,
  rotateAbout,
  shortestAngleDelta,
  treeLayout,
  wheelPoint,
  wheelStageGeom,
  wheelStageSpot,
  type RestLayoutInput,
  type TreeLayoutInput,
} from '@/lib/tree-layout';

describe('wheel-turn helpers', () => {
  test('rotateAbout spins a point around a center', () => {
    const p = rotateAbout({ x: 10, y: 0 }, { x: 0, y: 0 }, Math.PI / 2);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(10, 6);
    const q = rotateAbout({ x: 5, y: 5 }, { x: 5, y: 5 }, 1.3);
    expect(q.x).toBeCloseTo(5, 6);
    expect(q.y).toBeCloseTo(5, 6);
  });

  test('shortestAngleDelta always takes the short way around', () => {
    expect(shortestAngleDelta(0, Math.PI / 3)).toBeCloseTo(Math.PI / 3, 6);
    expect(shortestAngleDelta(0.1, -0.1)).toBeCloseTo(-0.2, 6);
    // wrap: from 350° to 10° is +20°, not -340°
    expect(shortestAngleDelta((350 / 180) * Math.PI, (10 / 180) * Math.PI)).toBeCloseTo((20 / 180) * Math.PI, 6);
    expect(Math.abs(shortestAngleDelta(0, Math.PI))).toBeCloseTo(Math.PI, 6);
  });
});

describe('focusWheel — the lowered, enlarged wheel you turn into', () => {
  const W = 880;
  const H = 600;
  const ringR = responsiveRingR(W, H);
  const fw = focusWheel(W, H, ringR);

  test('hub sinks below the canvas, centered horizontally', () => {
    expect(fw.hub.x).toBe(W / 2);
    expect(fw.hub.y).toBeGreaterThan(H);
  });

  test('the stage faces UP: focused sector points at the viewer, not the floor', () => {
    expect(fw.stage).toBeCloseTo(-Math.PI / 2, 6);
  });

  test('the wheel is genuinely enlarged', () => {
    expect(fw.scale).toBeGreaterThan(2);
  });

  test('the pillar ring passes through the focused tree base — one apparatus', () => {
    // team band of the focused tree (depth 1) must sit ON the enlarged wheel's
    // pillar ring, so the tree reads as the lit sector OF the wheel
    const tree = treeLayout({
      selfId: 'self',
      teamId: 'team:x',
      taskIds: [],
      workerByTask: {},
      toolsByWorker: {},
      width: W,
      height: H,
    });
    const teamY = tree.positions.get('team:x')!.y;
    expect(fw.hub.y - fw.scale * ringR[1]).toBeCloseTo(teamY, 1);
  });

  test('wheelPoint projects a rest spot onto the focus wheel, preserving its home angle', () => {
    const home = { x: W / 2, y: H / 2 };
    // a pillar straight up from the home center, ring-1 radius away
    const rest = { x: home.x, y: home.y - ringR[1] };
    // with no extra wheel turn it lands straight up from the hub, scaled out
    const p = wheelPoint(rest, home, fw, 0);
    expect(p.x).toBeCloseTo(fw.hub.x, 6);
    expect(p.y).toBeCloseTo(fw.hub.y - fw.scale * ringR[1], 6);
  });

  test('the angular fan is squeezed toward the stage: turns sweep in from the sides', () => {
    expect(fw.squeeze).toBeGreaterThan(0);
    expect(fw.squeeze).toBeLessThan(1);
    const home = { x: W / 2, y: H / 2 };
    const rest = { x: home.x, y: home.y - ringR[1] };
    // a sector that would sit 60° off the stage on a rigid wheel is pulled to
    // 60°·squeeze — measured from the hub, the offset from straight-up shrinks
    const off = Math.PI / 3;
    const q = wheelPoint(rest, home, fw, off);
    const measured = Math.atan2(q.x - fw.hub.x, fw.hub.y - q.y); // signed angle from straight-up
    expect(measured).toBeCloseTo(off * fw.squeeze, 6);
    // radius is untouched by the squeeze
    expect(Math.hypot(q.x - fw.hub.x, q.y - fw.hub.y)).toBeCloseTo(fw.scale * ringR[1], 4);
  });

  test('a neighboring pillar stays visible above the bottom edge — side entry, not bottom', () => {
    const home = { x: W / 2, y: H / 2 };
    const rest = { x: home.x, y: home.y - ringR[1] };
    const neighbor = wheelPoint(rest, home, fw, Math.PI / 3); // one ~60° sector over
    expect(neighbor.y).toBeLessThan(H - 40);
    // and it genuinely sits off to the side
    expect(Math.abs(neighbor.x - W / 2)).toBeGreaterThan(100);
  });
});

describe('wheel stage — pillars ride the top arc of a wheel', () => {
  const W = 880;
  const H = 600;

  test('cyclicDist takes the short way around the pillar ring', () => {
    expect(cyclicDist(0, 1, 6)).toBe(1);
    expect(cyclicDist(0, 5, 6)).toBe(-1); // wrap: last pillar is one step LEFT
    expect(cyclicDist(5, 0, 6)).toBe(1);
    expect(cyclicDist(2, 5, 6)).toBe(3);
    expect(cyclicDist(0, 0, 6)).toBe(0);
  });

  test('cyclicDeltaF handles float phases with wrap — the eased wheel angle', () => {
    expect(cyclicDeltaF(0, 1, 6)).toBeCloseTo(1, 6);
    expect(cyclicDeltaF(5.7, 0, 6)).toBeCloseTo(0.3, 6); // rolling over the wrap
    expect(cyclicDeltaF(0.5, 5.5, 6)).toBeCloseTo(-1, 6);
    expect(cyclicDeltaF(2.25, 2.25, 6)).toBeCloseTo(0, 6);
  });

  test('offset 0 is the apex — the stage where the focused tree grows', () => {
    const apex = wheelStageSpot(0, W, H);
    expect(apex.x).toBeCloseTo(W / 2, 4);
    expect(apex.y).toBeCloseTo(H * 0.76, 1); // the tree's team band
  });

  test('±1 sits at the canvas edges, a touch below the apex — the visible rim', () => {
    const left = wheelStageSpot(-1, W, H);
    const right = wheelStageSpot(1, W, H);
    expect(left.x).toBeGreaterThan(40);
    expect(left.x).toBeLessThan(120);
    expect(right.x).toBeGreaterThan(W - 120);
    expect(right.x).toBeLessThan(W - 40);
    expect(left.y).toBeCloseTo(right.y, 4);
    const apex = wheelStageSpot(0, W, H);
    expect(left.y).toBeGreaterThan(apex.y); // rim curves DOWN from the apex
    expect(left.y).toBeLessThan(H - 30); // but stays visible
  });

  test('the rim is a true arc: intermediate offsets trace it continuously', () => {
    // walking o from 0 → 1 must move monotonically right and down — the
    // rotation into view, not a straight slide or a bottom entry
    let px = wheelStageSpot(0, W, H).x;
    let py = wheelStageSpot(0, W, H).y;
    for (let o = 0.2; o <= 1.001; o += 0.2) {
      const p = wheelStageSpot(o, W, H);
      expect(p.x).toBeGreaterThan(px);
      expect(p.y).toBeGreaterThanOrEqual(py);
      px = p.x;
      py = p.y;
    }
  });

  test('beyond the flanks the rim leaves the canvas — nothing behind the tree', () => {
    expect(wheelStageSpot(2, W, H).x).toBeGreaterThan(W);
    expect(wheelStageSpot(-2, W, H).x).toBeLessThan(0);
    expect(wheelStageSpot(3, W, H).y).toBeGreaterThan(H * 0.9);
  });

  test('a whole tree rotated one sector about the hub lands its base on the flank spot', () => {
    // the expanded-tree wheel (Alex): departments ride the rim in full
    // form; a step is a RIGID rotation about the hub, so rotating the apex
    // point by ±delta must reproduce the flank spots exactly
    const { hub, delta } = wheelStageGeom(W, H);
    const apex = wheelStageSpot(0, W, H);
    const right = rotateAbout(apex, hub, delta);
    const left = rotateAbout(apex, hub, -delta);
    expect(right.x).toBeCloseTo(wheelStageSpot(1, W, H).x, 1);
    expect(right.y).toBeCloseTo(wheelStageSpot(1, W, H).y, 1);
    expect(left.x).toBeCloseTo(wheelStageSpot(-1, W, H).x, 1);
    expect(left.y).toBeCloseTo(wheelStageSpot(-1, W, H).y, 1);
    // and a canopy point (high above the apex, far from the hub) sweeps much
    // further than the base — the tree visibly TILTS as it rides the rim
    const canopy = { x: W / 2, y: H * 0.09 };
    const tilted = rotateAbout(canopy, hub, delta);
    expect(tilted.x - canopy.x).toBeGreaterThan(400);
  });
});
import { buildKnowledgeGraph, workerNodeId } from '@/lib/knowledge-graph';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

const W = 880;
const H = 600;

function baseInput(over: Partial<TreeLayoutInput> = {}): TreeLayoutInput {
  return {
    selfId: 'self',
    teamId: 'team:dept-sales',
    taskIds: ['task:s1', 'task:s2', 'task:s3'],
    workerByTask: {
      'task:s1': 'emp:a1',
      'task:s2': 'emp:a2',
      'task:s3': 'person:p1',
    },
    toolsByWorker: {
      'emp:a1': ['tool:attio', 'tool:slack', 'tool:zernio'],
      'emp:a2': ['tool:slack'],
      'person:p1': ['tool:notion', 'tool:miro'],
    },
    width: W,
    height: H,
    ...over,
  };
}

describe('treeLayout — dept → task → worker → tools', () => {
  test('assigns depths and orders bands strictly bottom-to-top', () => {
    const { positions } = treeLayout(baseInput());
    const self = positions.get('self')!;
    const team = positions.get('team:dept-sales')!;
    const t1 = positions.get('task:s1')!;
    const a1 = positions.get('emp:a1')!;
    const attio = positions.get('tool:attio')!;
    expect(self.depth).toBe(0);
    expect(team.depth).toBe(1);
    expect(t1.depth).toBe(2);
    expect(a1.depth).toBe(3);
    expect(attio.depth).toBe(4);
    // larger y = lower on screen; self is the lowest (the trunk's base)
    expect(self.y).toBeGreaterThan(team.y);
    expect(team.y).toBeGreaterThan(t1.y);
    expect(t1.y).toBeGreaterThan(a1.y);
    expect(a1.y).toBeGreaterThan(attio.y);
  });

  test('trunk (self + team) is horizontally centered', () => {
    const { positions } = treeLayout(baseInput());
    expect(positions.get('self')!.x).toBeCloseTo(W / 2, 5);
    expect(positions.get('team:dept-sales')!.x).toBeCloseTo(W / 2, 5);
  });

  test('monogamy in the layout: each worker sits directly above its task', () => {
    const inp = baseInput();
    const { positions } = treeLayout(inp);
    for (const [taskId, workerId] of Object.entries(inp.workerByTask)) {
      expect(positions.get(workerId)!.x).toBeCloseTo(positions.get(taskId)!.x, 5);
    }
  });

  test('task→worker branches exist, one per task', () => {
    const { branches } = treeLayout(baseInput());
    const does = branches.filter((b) => b.depth === 3);
    expect(does).toHaveLength(3);
    expect(does).toContainEqual({ source: 'task:s3', target: 'person:p1', depth: 3 });
  });

  test('deterministic for identical input', () => {
    const a = treeLayout(baseInput());
    const b = treeLayout(baseInput());
    expect([...a.positions.entries()]).toEqual([...b.positions.entries()]);
    expect(a.branches).toEqual(b.branches);
    expect(a.extraLinks).toEqual(b.extraLinks);
  });

  test('every node sits inside the canvas margins', () => {
    const m = 70;
    const { positions } = treeLayout(baseInput({ margin: m }));
    for (const p of positions.values()) {
      expect(p.x).toBeGreaterThanOrEqual(m - 1e-6);
      expect(p.x).toBeLessThanOrEqual(W - m + 1e-6);
    }
  });

  test('skeleton branches lean <= 45deg from vertical (trunk/limb/worker hops)', () => {
    const { positions, branches } = treeLayout(baseInput());
    expect(branches.length).toBeGreaterThan(0);
    // the tool canopy (depth 4) is a centralized row, so its branches may lean
    // freely — the cap keeps the trunk→task→worker skeleton tree-like
    for (const b of branches.filter((br) => br.depth <= 3)) {
      const s = positions.get(b.source)!;
      const t = positions.get(b.target)!;
      const dx = Math.abs(t.x - s.x);
      const dy = Math.abs(t.y - s.y);
      expect(dx).toBeLessThanOrEqual(dy + 1e-6);
    }
  });

  test('tool canopy is one centralized row: centered on the trunk, evenly spaced', () => {
    const { positions } = treeLayout(baseInput());
    const tools = ['tool:attio', 'tool:slack', 'tool:zernio', 'tool:notion', 'tool:miro']
      .map((id) => positions.get(id)!)
      .sort((a, b) => a.x - b.x);
    // same band height
    expect(new Set(tools.map((t) => t.y)).size).toBe(1);
    // centered as a group on the trunk axis
    const mean = tools.reduce((s, t) => s + t.x, 0) / tools.length;
    expect(mean).toBeCloseTo(W / 2, 5);
    // even spacing between neighbours
    const gaps = tools.slice(1).map((t, i) => t.x - tools[i].x);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 5);
    expect(gaps[0]).toBeGreaterThanOrEqual(48);
  });

  test('a multi-child parent genuinely fans its children out (diagonal, not stacked)', () => {
    const { positions, branches } = treeLayout(baseInput());
    const teamKids = branches.filter((b) => b.source === 'team:dept-sales');
    expect(teamKids).toHaveLength(3);
    const leans = teamKids.map((b) => {
      const s = positions.get(b.source)!;
      const t = positions.get(b.target)!;
      return Math.abs(t.x - s.x) / Math.abs(t.y - s.y);
    });
    expect(Math.max(...leans)).toBeGreaterThanOrEqual(0.2);
  });

  test('a single-child parent stays vertical (self -> team trunk)', () => {
    const { positions, branches } = treeLayout(baseInput());
    const trunk = branches.find((b) => b.source === 'self')!;
    const s = positions.get(trunk.source)!;
    const t = positions.get(trunk.target)!;
    expect(Math.abs(t.x - s.x)).toBeLessThan(1e-6);
  });

  test('tasks are balanced left/right about the trunk and share one height band', () => {
    const { positions } = treeLayout(baseInput());
    const cx = W / 2;
    const offsets = ['task:s1', 'task:s2', 'task:s3'].map((id) => positions.get(id)!.x - cx);
    expect(Math.abs(offsets.reduce((s, o) => s + o, 0))).toBeLessThan(1e-6);
    const ys = ['task:s1', 'task:s2', 'task:s3'].map((id) => positions.get(id)!.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1e-6);
  });

  test('shared tool gets one node, one primary branch, and a secondary vine to the other user', () => {
    const { positions, branches, extraLinks } = treeLayout(baseInput());
    expect(positions.has('tool:slack')).toBe(true);
    const primary = branches.filter((b) => b.target === 'tool:slack');
    expect(primary).toHaveLength(1);
    const vines = extraLinks.filter((l) => l.target === 'tool:slack');
    expect(vines).toHaveLength(1);
    expect(vines[0].source).not.toBe(primary[0].source);
  });

  test('handles an empty department without throwing', () => {
    const { positions, branches } = treeLayout(
      baseInput({ taskIds: [], workerByTask: {}, toolsByWorker: {} }),
    );
    expect(positions.has('self')).toBe(true);
    expect(positions.has('team:dept-sales')).toBe(true);
    expect(branches).toEqual([{ source: 'self', target: 'team:dept-sales', depth: 1 }]);
  });
});

// ── Not-claustrophobic guarantee: real seeded departments keep their space ───
describe('treeLayout spacing on the real seeded org (largest departments)', () => {
  const db: FounderDb = openDb(':memory:');
  seedDatabase(db);
  afterAll(() => db.close());

  const agents = db.agents.all();
  const departments = db.departments.all();
  const people = db.people.all();
  const tasks = db.sopTasks.all();
  const graph = buildKnowledgeGraph(agents, departments, people, tasks);

  const MIN_GAP = 48;
  const MARGIN = 78;

  for (const d of departments) {
    test(`${d.name}: same-band siblings stay ≥ ${MIN_GAP}px apart, inside margins`, () => {
      const deptTasks = tasks.filter((t) => t.departmentId === d.id);
      const taskIds = deptTasks.map((t) => `task:${t.id}`).sort();
      const workerByTask: Record<string, string> = {};
      const toolsByWorker: Record<string, string[]> = {};
      for (const t of deptTasks) {
        const w = workerNodeId(t.assigneeKind, t.assigneeId);
        workerByTask[`task:${t.id}`] = w;
        const uses = graph.edges.filter((e) => e.kind === 'uses' && e.source === w).map((e) => e.target);
        toolsByWorker[w] = uses.sort();
      }
      const { positions } = treeLayout({
        selfId: 'self', teamId: `team:${d.id}`, taskIds, workerByTask, toolsByWorker,
        width: W, height: H, margin: MARGIN,
      });

      // group by depth band and check pairwise gaps within each band
      const byDepth = new Map<number, { x: number; y: number }[]>();
      for (const [id, p] of positions) {
        if (id === 'self' || id.startsWith('team:')) continue;
        (byDepth.get(p.depth) ?? byDepth.set(p.depth, []).get(p.depth)!).push(p);
      }
      for (const [depth, pts] of byDepth) {
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            const gap = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
            expect(gap, `depth ${depth} in ${d.name} too tight (${gap.toFixed(1)}px)`).toBeGreaterThanOrEqual(MIN_GAP);
          }
        }
      }
      for (const p of positions.values()) {
        expect(p.x).toBeGreaterThanOrEqual(MARGIN - 1e-6);
        expect(p.x).toBeLessThanOrEqual(W - MARGIN + 1e-6);
      }
    });
  }
});

function restInput(over: Partial<RestLayoutInput> = {}): RestLayoutInput {
  return {
    selfId: 'self',
    pillars: [
      { teamId: 'team:a', taskIds: ['task:a1', 'task:a2'], workerIds: ['emp:a1', 'emp:a2'], toolIds: ['tool:t1', 'tool:t2'] },
      { teamId: 'team:b', taskIds: ['task:b1', 'task:b2'], workerIds: ['emp:b1', 'emp:b2'], toolIds: ['tool:t3', 'tool:t4'] },
      { teamId: 'team:c', taskIds: ['task:c1', 'task:c2'], workerIds: ['emp:c1', 'emp:c2'], toolIds: ['tool:t5', 'tool:t6'] },
      { teamId: 'team:d', taskIds: ['task:d1', 'task:d2'], workerIds: ['emp:d1', 'emp:d2'], toolIds: ['tool:t7', 'tool:t8'] },
    ],
    ringR: [0, 100, 165, 230, 292],
    cx: 440,
    cy: 300,
    ...over,
  };
}

const ang = (x: number, y: number, cx: number, cy: number) => Math.atan2(y - cy, x - cx);
const dist = (x: number, y: number, cx: number, cy: number) => Math.hypot(x - cx, y - cy);

describe('radialRestLayout', () => {
  test('self sits exactly at the center', () => {
    const { positions } = radialRestLayout(restInput());
    expect(positions.get('self')).toEqual({ x: 440, y: 300 });
  });

  test('pillars are evenly spaced around ring 1', () => {
    const { positions } = radialRestLayout(restInput());
    const teamAngles = ['team:a', 'team:b', 'team:c', 'team:d']
      .map((id) => positions.get(id)!)
      .map((p) => ang(p.x, p.y, 440, 300))
      .sort((a, b) => a - b);
    for (let i = 1; i < teamAngles.length; i++) {
      expect(teamAngles[i] - teamAngles[i - 1]).toBeCloseTo(Math.PI / 2, 4);
    }
  });

  test('each node kind sits on its own ring radius: team, task, worker, tool', () => {
    const { positions } = radialRestLayout(restInput());
    expect(dist(positions.get('team:a')!.x, positions.get('team:a')!.y, 440, 300)).toBeCloseTo(100, 4);
    expect(dist(positions.get('task:a1')!.x, positions.get('task:a1')!.y, 440, 300)).toBeCloseTo(165, 4);
    expect(dist(positions.get('emp:a1')!.x, positions.get('emp:a1')!.y, 440, 300)).toBeCloseTo(230, 4);
    expect(dist(positions.get('tool:t1')!.x, positions.get('tool:t1')!.y, 440, 300)).toBeCloseTo(292, 4);
  });

  test("a pillar's tasks/workers/tools stay inside that pillar's angular sector", () => {
    const inp = restInput();
    const { positions } = radialRestLayout(inp);
    const base = ang(positions.get('team:a')!.x, positions.get('team:a')!.y, 440, 300);
    const sliceHalf = Math.PI / inp.pillars.length; // generous bound: half the full slice
    for (const id of ['task:a1', 'task:a2', 'emp:a1', 'emp:a2', 'tool:t1', 'tool:t2']) {
      const p = positions.get(id)!;
      let d = ang(p.x, p.y, 440, 300) - base;
      d = Math.atan2(Math.sin(d), Math.cos(d)); // wrap to [-π, π]
      expect(Math.abs(d)).toBeLessThanOrEqual(sliceHalf + 1e-6);
    }
  });

  test('a balanced graph is centered (centroid ≈ center)', () => {
    const { positions } = radialRestLayout(restInput());
    const pts = [...positions.values()];
    const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    expect(mx).toBeCloseTo(440, 3);
    expect(my).toBeCloseTo(300, 3);
  });

  test('deterministic for identical input', () => {
    const a = radialRestLayout(restInput());
    const b = radialRestLayout(restInput());
    expect([...a.positions.entries()]).toEqual([...b.positions.entries()]);
  });

  test('handles a single pillar and empty pillar without throwing', () => {
    const { positions } = radialRestLayout(
      restInput({ pillars: [{ teamId: 'team:solo', taskIds: [], workerIds: [], toolIds: [] }] }),
    );
    expect(positions.get('self')).toEqual({ x: 440, y: 300 });
    expect(dist(positions.get('team:solo')!.x, positions.get('team:solo')!.y, 440, 300)).toBeCloseTo(100, 4);
  });
});

describe('responsiveRingR — five rings', () => {
  test('returns five radii that fit an 880×600 canvas', () => {
    const r = responsiveRingR(880, 600);
    expect(r).toHaveLength(5);
    expect(r[0]).toBe(0);
    for (let i = 1; i < 5; i++) expect(r[i]).toBeGreaterThan(r[i - 1]);
    expect(r[4]).toBeLessThanOrEqual(300 - 40); // outer ring keeps label headroom
  });

  test('scales ~2× when the canvas doubles', () => {
    const base = responsiveRingR(880, 600);
    const big = responsiveRingR(1760, 1200);
    for (let i = 1; i < 5; i++) expect(big[i]).toBeCloseTo(base[i] * 2, 0);
  });

  test('scales by the smaller dimension so the rings stay on-canvas', () => {
    expect(responsiveRingR(2000, 600)).toEqual(responsiveRingR(900, 600));
  });
});

describe('radialRestLayout responsive + density', () => {
  test('derives ring radii from width/height when no ringR is given', () => {
    const { positions } = radialRestLayout({
      selfId: 'self',
      cx: 440,
      cy: 300,
      width: 880,
      height: 600,
      pillars: [{ teamId: 'team:a', taskIds: ['task:a1'], workerIds: ['emp:a1'], toolIds: ['tool:t1'] }],
    });
    const rr = responsiveRingR(880, 600);
    expect(dist(positions.get('tool:t1')!.x, positions.get('tool:t1')!.y, 440, 300)).toBeCloseTo(rr[4], 0);
  });

  test('a pillar with more total nodes spreads its workers over a wider arc', () => {
    const { positions } = radialRestLayout({
      selfId: 'self',
      cx: 440,
      cy: 300,
      ringR: [0, 100, 165, 230, 292],
      pillars: [
        { teamId: 'team:y', taskIds: [], workerIds: ['y1', 'y2'], toolIds: Array.from({ length: 10 }, (_, i) => `yt${i}`) },
        { teamId: 'team:x', taskIds: [], workerIds: ['x1', 'x2'], toolIds: [] },
        { teamId: 'team:z', taskIds: [], workerIds: ['z1', 'z2'], toolIds: ['zt1', 'zt2'] },
      ],
    });
    const arc = (a: string, b: string) => {
      const pa = positions.get(a)!;
      const pb = positions.get(b)!;
      const d = ang(pa.x, pa.y, 440, 300) - ang(pb.x, pb.y, 440, 300);
      return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
    };
    // same worker count (2) in each pillar → the wider arc is purely the denser pillar's bigger sector
    expect(arc('y1', 'y2')).toBeGreaterThan(arc('x1', 'x2'));
  });

  test('a crowded pillar keeps its tools spaced apart (no min-gap violation)', () => {
    const tools = Array.from({ length: 14 }, (_, i) => `tool:t${i}`);
    const { positions } = radialRestLayout({
      selfId: 'self',
      cx: 440,
      cy: 300,
      width: 880,
      height: 600,
      pillars: [
        { teamId: 'team:crowd', taskIds: [], workerIds: ['e1'], toolIds: tools },
        { teamId: 'team:b', taskIds: [], workerIds: ['b1'], toolIds: ['bt1'] },
      ],
    });
    const pts = tools.map((id) => positions.get(id)!);
    let min = Infinity;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    expect(min).toBeGreaterThanOrEqual(17);
  });
});

describe('edgeArc', () => {
  test('curves from a to b via a quadratic control point off the chord', () => {
    const d = edgeArc({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d).toContain('Q');
    expect(d.trimEnd().endsWith('100 0')).toBe(true);
  });

  test('bows perpendicular to the chord, and the bow scales with edge length', () => {
    // horizontal chord → perpendicular is vertical; control y = bow*len
    expect(edgeArc({ x: 0, y: 0 }, { x: 100, y: 0 })).toContain('Q 50 12');
    expect(edgeArc({ x: 0, y: 0 }, { x: 200, y: 0 })).toContain('Q 100 24'); // 2× length → 2× bow
  });

  test('deterministic', () => {
    expect(edgeArc({ x: 1, y: 2 }, { x: 9, y: 4 })).toBe(edgeArc({ x: 1, y: 2 }, { x: 9, y: 4 }));
  });
});

describe('branchWidth', () => {
  test('tapers monotonically trunk→leaf and stays ≥ 1', () => {
    expect(branchWidth(1)).toBeGreaterThan(branchWidth(2));
    expect(branchWidth(2)).toBeGreaterThan(branchWidth(3));
    expect(branchWidth(3)).toBeGreaterThan(branchWidth(4));
    expect(branchWidth(4)).toBeGreaterThanOrEqual(1);
  });
});

describe('branchPath', () => {
  test('curvature scales with branch length (control points are length-proportional)', () => {
    const c1 = (d: string) => d.split('C')[1].trim().split(/[ ,]+/).slice(0, 2).map(Number);
    const [sx, sy] = c1(branchPath({ x: 100, y: 400 }, { x: 140, y: 300 })); // dx40 dy-100
    const [lx, ly] = c1(branchPath({ x: 100, y: 400 }, { x: 180, y: 200 })); // dx80 dy-200 (2×)
    expect(lx - 100).toBeCloseTo((sx - 100) * 2, 1);
    expect(ly - 400).toBeCloseTo((sy - 400) * 2, 1);
  });

  test('organic curve that starts at a and ends at b', () => {
    const d = branchPath({ x: 100, y: 500 }, { x: 200, y: 100 });
    expect(d.startsWith('M 100 500')).toBe(true);
    expect(d).toContain('C');
    expect(d.trimEnd().endsWith('200 100')).toBe(true);
  });

  test('deterministic', () => {
    const a = { x: 100, y: 500 };
    const b = { x: 200, y: 100 };
    expect(branchPath(a, b)).toBe(branchPath(a, b));
  });

  test('bows off the chord (not a straight line)', () => {
    const d = branchPath({ x: 100, y: 500 }, { x: 300, y: 100 });
    expect(d).not.toContain('L');
    expect(d).toContain('C');
  });
});
