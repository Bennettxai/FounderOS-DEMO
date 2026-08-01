'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from 'd3-force';
import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardList, Maximize2, Sparkles, User, UserRound, Users, Wrench, X, type LucideIcon } from 'lucide-react';
import { graphDirectory, orderGraphDepartments, SELF_ID, toolSlugOf, workerNodeId, type DirectoryGroup, type KGNode, type KGNodeKind, type KnowledgeGraph as KGData } from '@/lib/knowledge-graph';
import { ACTION_LENSES, ENTITY_LENSES, FUNCTION_LENSES, lensNodeSet, type Lens } from '@/lib/graph-lens';
import { GraphDirectory } from '@/components/GraphDirectory';
import { branchPath, branchWidth, cyclicDeltaF, edgeArc, focusWheel, radialRestLayout, responsiveRingR, rotateAbout, shortestAngleDelta, treeLayout, wheelPoint, wheelStageGeom, wheelStageSpot, type RestLayoutResult, type TreeLayoutResult, type TreeNodePos } from '@/lib/tree-layout';
import { rafThrottle } from '@/lib/raf-throttle';
import { buildToolWiki, prettifySlug } from '@/lib/agent-wiki';
import { cameraRect, lerpRect, memoryNodePos, pickRestTier, R_CORE, type MemoryGraph, type Rect } from '@/lib/memory-core';
import { searchMemoryNotes } from '@/lib/memory-search';
import { headForDepartment } from '@/lib/personnel';
import type { Agent, AgentRun, Department, Person, SopTask } from '@/lib/schemas';
import {
  AgentHarnessCard, GraphHumanDetailCard, MemoryNoteCard, SopTaskDetailCard, ToolDetailCard,
  type AgentLite, type ClientLite, type DeptLite, type ToolLite,
} from '@/components/KnowledgeDetail';
import { KnowledgeGraphFullscreen } from '@/components/KnowledgeGraphFullscreen';

const W = 880;
const H = 600;
const CX = W / 2;
const CY = H / 2;
const RING_R = responsiveRingR(W, H); // self · teams · employees · tools — responsive to canvas
const MARGIN = 78; // horizontal margin for focus rows
// focus mode: the wheel enlarges and its hub sinks below the canvas — the
// focused tree grows out of the wheel's top; you turn INTO it (lib/tree-layout)
const FOCUS_WHEEL = focusWheel(W, H, RING_R);
// the rim circle the expanded department trees are mounted on
const WHEEL_GEOM = wheelStageGeom(W, H);
// degrees the rails rotate per sector step — the machinery turns with the rim
const RIM_DELTA_DEG = (WHEEL_GEOM.delta * 180) / Math.PI;

// Tier hierarchy: pillar hubs read largest and brightest, workers medium,
// tools and SOP tasks smallest and dimmest — radius scales further with
// connection count (see nodeRadius / TIER_OPACITY).
const CAT: Record<KGNodeKind, { color: string; Icon: LucideIcon; label: string; r: number }> = {
  self: { color: 'var(--text)', Icon: Sparkles, label: 'Notes', r: 18 },
  team: { color: 'var(--brain-1)', Icon: Users, label: 'Pillars', r: 15 },
  task: { color: 'var(--muted)', Icon: ClipboardList, label: 'SOP tasks', r: 7 },
  person: { color: 'var(--warn)', Icon: UserRound, label: 'Humans', r: 10 },
  employee: { color: 'var(--accent)', Icon: User, label: 'AI agents', r: 10 },
  tool: { color: 'var(--kg-tool)', Icon: Wrench, label: 'Tools', r: 7.5 },
};

// Everything reads bright at rest (Alex, 2026-07-12: "keep it all lit up"
// — the old tier dimming made tools/tasks look dark from the top view).
const TIER_OPACITY: Record<KGNodeKind, number> = {
  self: 1,
  team: 1,
  person: 0.98,
  employee: 0.98,
  task: 0.94,
  tool: 0.94,
};

// legend + hit-test order: the chain as it reads outward from Alex
const LEGEND_KINDS: KGNodeKind[] = ['self', 'team', 'task', 'person', 'employee', 'tool'];

const nodeColor = (n: KGNode) => n.color ?? CAT[n.kind].color;

// Each segment of the chain gets its own visible colour: Alex → department
// (white) → SOP tasks (muted) → the worker who does the job (accent) → tools
// (cyan); agent↔agent reporting in accent.
const EDGE_COLOR: Record<string, string> = {
  pillar: 'var(--text)',
  sop: 'var(--muted)',
  does: 'var(--accent)',
  member: 'var(--muted)',
  uses: 'var(--brain-2)',
  reports: 'var(--accent)',
};

// Task titles are whole jobs ("Broadcast directives across the fleet") — trim
// for the on-canvas label; the full title lives in the hover tooltip + card.
const shortLabel = (n: KGNode) =>
  n.kind === 'task' && n.label.length > 20 ? `${n.label.slice(0, 18).trimEnd()}…` : n.label;

// 'about how long ago' for the harness card's last-run line
const agoLabel = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ── Alex memory core (Notes constellation) ────────────────────────────
// Constellation disc scales: R_CORE lives in lib/memory-core (the spacing
// contract against the pillar ring is unit-tested there); the disc shrinks at
// the trunk base of a focused tree and blooms when Alex is expanded via
// one smooth CSS transform.
const CORE_SCALE_TREE = 38 / R_CORE;
const CORE_SCALE_EXPANDED = 96 / R_CORE;

// While the memory is open the pillar gateways drift outward (radially, via
// the physics targets) so they never overlap the constellation: rim at 96,
// pillars at 84 × 1.6 ≈ 134 — clear water between them at the 0.5 zoom.
const TEAM_PUSH_EXPANDED = 1.6;

const hashStr = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};

// Notes-style folder tinting from the theme's existing palette — stable
// hash so a folder keeps its color across reloads.
// The whole vault burns one HARD reddish orange (Alex's call, 2026-07-06)
// — the per-node shimmer opacity plus the synapse sparks carry all the
// variation. Hubs are the same fire, just bigger, with their radiating spokes.
const HUB_COLOR = '#e35c35';
const NOTE_COLOR = '#e35c35';
const ORPHAN_COLOR = '#e35c35'; // rim dust dims via its lower fill opacity
// the bright traveling sparks that fire along the links like synapses
const SYNAPSE_COLOR = '#ffb08a';
const SYNAPSE_N = 14;

const memColor = (m: { id: string; cluster: number; links: number; type: string }) =>
  m.type === 'folder' ? HUB_COLOR : m.type === 'page' && m.links === 0 ? ORPHAN_COLOR : NOTE_COLOR;

// each vault note renders as a slight hexagon (pointy-top) instead of a
// circle — points strings cached per radius since radii repeat heavily
const HEX_PTS_CACHE = new Map<number, string>();
const hexPts = (r: number): string => {
  const key = Math.round(r * 100);
  let s = HEX_PTS_CACHE.get(key);
  if (!s) {
    s = Array.from({ length: 6 }, (_, k) => {
      const a = (k * Math.PI) / 3 - Math.PI / 2;
      return `${(r * Math.cos(a)).toFixed(3)},${(r * Math.sin(a)).toFixed(3)}`;
    }).join(' ');
    HEX_PTS_CACHE.set(key, s);
  }
  return s;
};

// Slow wander + luminescent breathing for the memory field. One drift + one
// breathe animation per LAYER (three layers, notes partitioned by hash), not
// per note — 400 individual SVG animations made the page lag; six barely
// register. Each layer also carries a paused "stir" wrapper that only runs
// while the mouse is over the core, so hovering makes the field come alive.
const MEM_LAYERS: React.CSSProperties[] = [
  { ['--kg-ddx' as string]: '1.1px', ['--kg-ddy' as string]: '-0.8px', animation: 'kg-note-drift 19s ease-in-out infinite alternate, kg-breathe 6.5s ease-in-out infinite alternate' },
  { ['--kg-ddx' as string]: '-0.9px', ['--kg-ddy' as string]: '1.2px', animation: 'kg-note-drift 24s ease-in-out -8s infinite alternate, kg-breathe 8.5s ease-in-out -3s infinite alternate' },
  { ['--kg-ddx' as string]: '0.7px', ['--kg-ddy' as string]: '1px', animation: 'kg-note-drift 29s ease-in-out -15s infinite alternate, kg-breathe 11s ease-in-out -6s infinite alternate' },
];
const MEM_STIRS: React.CSSProperties[] = [
  { ['--kg-sdx' as string]: '2.6px', ['--kg-sdy' as string]: '1.8px', animation: 'kg-stir 1.7s ease-in-out infinite alternate' },
  { ['--kg-sdx' as string]: '-2.2px', ['--kg-sdy' as string]: '2.4px', animation: 'kg-stir 2.1s ease-in-out -0.6s infinite alternate' },
  { ['--kg-sdx' as string]: '1.9px', ['--kg-sdy' as string]: '-2.5px', animation: 'kg-stir 2.5s ease-in-out -1.2s infinite alternate' },
];
const memLayerOf = (id: string) => hashStr(id) % MEM_LAYERS.length;

// tiny dots sized by connectivity — the folder hubs read as the big orange
// dandelion centers (like the reference); orphans stay specks.
const memNodeR = (n: { type: string; wordCount: number; links: number }) =>
  n.type === 'folder'
    ? 2.4
    : n.links === 0
      ? 0.45
      : 0.45 + Math.min(0.95, n.links * 0.1 + n.wordCount / 4000);

// per-frame camera catch-up: ~0.075 feels like a camera operator gliding
const CAM_EASE = 0.075;
// returning to the main view is a SNAP, not a cruise — nodes teleport home,
// so the camera matches with a much brisker pull-out (~4 frames to settle)
const CAM_EASE_HOME = 0.3;

// Labels keep ONE on-screen size at every camera depth: the camera loop
// publishes its zoom as --kg-cam-k (viewBox width / canvas width) and every
// font counter-scales through it. `px` is the desired size at rest;
// `groupScale` compensates for an extra ancestor scale (the constellation).
const fixedLabel = (px: number, groupScale = 1): React.CSSProperties => ({
  fontSize: `calc(${(px / groupScale).toFixed(3)}px * var(--kg-cam-k, 1))`,
});

type SimNode = KGNode & { x: number; y: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null };
type SimLink = { source: SimNode | string; target: SimNode | string; kind: string };

/**
 * Alex's operating-knowledge graph: Alex at the core, pillars (teams),
 * their written-out SOP tasks, the single worker (human or AI) who does each
 * job, and their tools — concentric, with live physics, a slowly-rotating
 * orbital backdrop and a faint drifting grid. Hover any node to trace its
 * whole pillar chain. Click a department to zoom it into a bottom-to-top tree
 * (dept → tasks → workers → tools); click a task for its SOP, a worker or tool
 * for its wiki. The top-right tab opens a fullscreen department explorer with
 * ← / → navigation and a rich detail panel.
 */
export function KnowledgeGraph({
  graph, agents = [], departments = [], people = [], tasks = [], memory, clients = [], runsByAgent = {},
  repelDefault = 150, linkDistDefault = 60, centerDefault = 0.32,
}: {
  graph: KGData; agents?: Agent[]; departments?: Department[]; people?: Person[]; tasks?: SopTask[];
  /** distilled brain-store constellation drawn at the core (Alex = his memory) */
  memory?: MemoryGraph;
  /** the client roster shown when the Clients pillar is focused */
  clients?: ClientLite[];
  /** latest run per agent id, for the harness card */
  runsByAgent?: Record<string, AgentRun>;
  /** physics tuning (the in-UI editor is retired; these still configure the sim) */
  repelDefault?: number; linkDistDefault?: number; centerDefault?: number;
}) {
  // fixed physics — the slider editor gave way to the always-on directory
  const centerForce = centerDefault;
  const repel = repelDefault;
  const linkDist = linkDistDefault;
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedHumanId, setSelectedHumanId] = useState<string | null>(null);
  const [coreExpanded, setCoreExpanded] = useState(false);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [memHoverId, setMemHoverId] = useState<string | null>(null);
  // type-to-find over the open vault; hits highlight in the overlay layer
  const [memQuery, setMemQuery] = useState('');
  const memSearchRef = useRef<HTMLInputElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // the everything-index can be tucked away (inline + fullscreen) so the wheel
  // is viewable unobstructed; one toggle drives both mounts
  const [directoryCollapsed, setDirectoryCollapsed] = useState(false);

  const memoryOn = !!memory && memory.nodes.length > 0;

  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: string; moved: boolean; startX: number; startY: number } | null>(null);
  const suppressClickRef = useRef(false);
  const [, setTick] = useState(0);

  const agentById = useMemo(() => new Map(agents.map((a) => [`emp:${a.id}`, a])), [agents]);
  const personById = useMemo(() => new Map(people.map((p) => [`person:${p.id}`, p])), [people]);
  const taskById = useMemo(() => new Map(tasks.map((t) => [`task:${t.id}`, t])), [tasks]);

  // adjacency + relationship maps for hover + pillar focus. The chain is
  // team —sop→ task —does→ worker —uses→ tool; teamOfWorker is derived through
  // the worker's one task (plus the member-edge fallback for unassigned rows).
  const {
    adjacency, byId, tasksOfTeam, teamOfTask, workerOfTask, taskOfWorker,
    teamOfWorker, workersOfTeam, toolsOfWorker, workersOfTool,
  } = useMemo(() => {
    const adjacency = new Map<string, Set<string>>();
    const tasksOfTeam = new Map<string, string[]>();
    const teamOfTask = new Map<string, string>();
    const workerOfTask = new Map<string, string>();
    const taskOfWorker = new Map<string, string>();
    const teamOfWorker = new Map<string, string>();
    const workersOfTeam = new Map<string, string[]>();
    const toolsOfWorker = new Map<string, string[]>();
    const workersOfTool = new Map<string, string[]>();
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const n of graph.nodes) adjacency.set(n.id, new Set([n.id]));
    for (const e of graph.edges) {
      adjacency.get(e.source)?.add(e.target);
      adjacency.get(e.target)?.add(e.source);
      if (e.kind === 'sop') {
        teamOfTask.set(e.target, e.source);
        (tasksOfTeam.get(e.source) ?? tasksOfTeam.set(e.source, []).get(e.source)!).push(e.target);
      }
      if (e.kind === 'does') {
        workerOfTask.set(e.source, e.target);
        taskOfWorker.set(e.target, e.source);
      }
      if (e.kind === 'member') teamOfWorker.set(e.source, e.target);
      if (e.kind === 'uses') {
        (toolsOfWorker.get(e.source) ?? toolsOfWorker.set(e.source, []).get(e.source)!).push(e.target);
        (workersOfTool.get(e.target) ?? workersOfTool.set(e.target, []).get(e.target)!).push(e.source);
      }
    }
    for (const [task, worker] of workerOfTask) {
      const team = teamOfTask.get(task);
      if (team) teamOfWorker.set(worker, team);
    }
    for (const [worker, team] of teamOfWorker) {
      (workersOfTeam.get(team) ?? workersOfTeam.set(team, []).get(team)!).push(worker);
    }
    return {
      adjacency, byId, tasksOfTeam, teamOfTask, workerOfTask, taskOfWorker,
      teamOfWorker, workersOfTeam, toolsOfWorker, workersOfTool,
    };
  }, [graph]);

  const isWorker = (kind: KGNodeKind) => kind === 'employee' || kind === 'person';

  const teamForFocus = (id: string | null): string | null => {
    if (!id) return null;
    const n = byId.get(id);
    if (!n) return null;
    if (n.kind === 'team') return n.id;
    if (n.kind === 'task') return teamOfTask.get(n.id) ?? null;
    if (isWorker(n.kind)) return teamOfWorker.get(n.id) ?? null;
    if (n.kind === 'tool') {
      const w = (workersOfTool.get(n.id) ?? [])[0];
      return w ? teamOfWorker.get(w) ?? null : null;
    }
    return null;
  };

  // The full chain below a worker (its tools) and above it (its task + team).
  const chainOfWorker = (w: string, set: Set<string>) => {
    set.add(w);
    const task = taskOfWorker.get(w);
    if (task) set.add(task);
    const team = teamOfWorker.get(w);
    if (team) set.add(team);
    for (const tool of toolsOfWorker.get(w) ?? []) set.add(tool);
  };

  // Light a node's whole pillar chain on hover — a department lights its tasks,
  // the workers who do them AND their tools, not just its direct neighbours.
  const litFor = (id: string): Set<string> => {
    const node = byId.get(id);
    const set = new Set<string>([id]);
    if (!node) return set;
    if (node.kind === 'team') {
      set.add(SELF_ID);
      for (const w of workersOfTeam.get(id) ?? []) chainOfWorker(w, set);
      for (const t of tasksOfTeam.get(id) ?? []) set.add(t);
    } else if (node.kind === 'task') {
      set.add(SELF_ID);
      const team = teamOfTask.get(id);
      if (team) set.add(team);
      const w = workerOfTask.get(id);
      if (w) chainOfWorker(w, set);
    } else if (isWorker(node.kind)) {
      set.add(SELF_ID);
      chainOfWorker(id, set);
    } else if (node.kind === 'tool') {
      for (const w of workersOfTool.get(id) ?? []) chainOfWorker(w, set);
    } else {
      for (const m of adjacency.get(id) ?? []) set.add(m);
    }
    return set;
  };

  const focusTeamId = teamForFocus(focusId);

  const focusSet = useMemo(() => {
    if (!focusTeamId) return null;
    const set = new Set<string>([SELF_ID, focusTeamId]);
    for (const t of tasksOfTeam.get(focusTeamId) ?? []) set.add(t);
    for (const w of workersOfTeam.get(focusTeamId) ?? []) {
      set.add(w);
      for (const tool of toolsOfWorker.get(w) ?? []) set.add(tool);
    }
    return set;
  }, [focusTeamId, tasksOfTeam, workersOfTeam, toolsOfWorker]);

  // Organic bottom-to-top tree for EVERY pillar: department at the base
  // (trunk) → SOP tasks (limbs) → each task's single worker directly above it
  // → tools (canopy). One layout per department, because the wheel mounts the
  // departments in EXPANDED form (Alex): the flanks carry their whole tree
  // tilted on the rim and a step rigidly rotates them into position.
  const allTrees: Map<string, TreeLayoutResult> = useMemo(() => {
    const byLabel = (a: string, b: string) => (byId.get(a)?.label ?? '').localeCompare(byId.get(b)?.label ?? '');
    const m = new Map<string, TreeLayoutResult>();
    for (const team of graph.nodes.filter((n) => n.kind === 'team')) {
      const taskIds = (tasksOfTeam.get(team.id) ?? []).slice().sort(byLabel);
      const workerByTask: Record<string, string> = {};
      const toolsByWorker: Record<string, string[]> = {};
      for (const t of taskIds) {
        const w = workerOfTask.get(t);
        if (!w) continue;
        workerByTask[t] = w;
        toolsByWorker[w] = (toolsOfWorker.get(w) ?? []).slice().sort(byLabel);
      }
      m.set(
        team.id,
        treeLayout({
          selfId: SELF_ID,
          teamId: team.id,
          taskIds,
          workerByTask,
          toolsByWorker,
          width: W,
          height: H,
          margin: MARGIN,
        }),
      );
    }
    return m;
  }, [graph, tasksOfTeam, workerOfTask, toolsOfWorker, byId]);
  const allTreesRef = useRef(allTrees);
  allTreesRef.current = allTrees;

  const focusTree: TreeLayoutResult | null = focusTeamId ? allTrees.get(focusTeamId) ?? null : null;

  // The symmetric resting shape (unfocused): a sunburst the floaty forces hold
  // the nodes to and drift them back to after a drag or a slider nudge.
  const restLayout: RestLayoutResult = useMemo(() => {
    // Finances rides next to Sales on the graph (display order only).
    const teams = orderGraphDepartments(
      graph.nodes.filter((n) => n.kind === 'team'),
      (t) => t.id.replace('team:', ''),
    );
    const toolsByPillar = new Map<string, string[]>();
    for (const n of graph.nodes) {
      if (n.kind !== 'tool') continue;
      const users = workersOfTool.get(n.id) ?? [];
      const team = users.length ? teamOfWorker.get(users[0]) ?? null : null;
      if (team) (toolsByPillar.get(team) ?? toolsByPillar.set(team, []).get(team)!).push(n.id);
    }
    const pillars = teams.map((t) => ({
      teamId: t.id,
      taskIds: tasksOfTeam.get(t.id) ?? [],
      workerIds: workersOfTeam.get(t.id) ?? [],
      toolIds: toolsByPillar.get(t.id) ?? [],
    }));
    return radialRestLayout({ selfId: SELF_ID, pillars, ringR: RING_R, cx: CX, cy: CY });
  }, [graph, tasksOfTeam, workersOfTeam, workersOfTool, teamOfWorker]);

  // Staggered label rows for the focused tree: within each band (tasks,
  // workers, tools) labels alternate between two heights so long titles stay
  // readable at tight sibling spacing instead of smearing into each other.
  const labelDy = useMemo(() => {
    const m = new Map<string, number>();
    if (!focusTree) return m;
    const byDepth = new Map<number, { id: string; x: number }[]>();
    for (const [id, p] of focusTree.positions) {
      if (p.depth < 2) continue;
      (byDepth.get(p.depth) ?? byDepth.set(p.depth, []).get(p.depth)!).push({ id, x: p.x });
    }
    for (const entries of byDepth.values()) {
      entries.sort((a, b) => a.x - b.x);
      entries.forEach((e, i) => m.set(e.id, i % 2 === 0 ? 0 : 11));
    }
    return m;
  }, [focusTree]);

  // refs the force accessors read (so slider/focus changes don't rebuild the sim)
  const repelRef = useRef(repel); repelRef.current = repel;
  const linkRef = useRef(linkDist); linkRef.current = linkDist;
  const centerRef = useRef(centerForce); centerRef.current = centerForce;
  const layoutRef = useRef<Map<string, TreeNodePos> | null>(focusTree?.positions ?? null);
  layoutRef.current = focusTree?.positions ?? null;
  const restRef = useRef(restLayout.positions);
  restRef.current = restLayout.positions;
  const coreExpandedRef = useRef(coreExpanded);
  coreExpandedRef.current = coreExpanded;

  // collapsing disables note pointer-events, so a hovered note would never get
  // its mouseleave — drop any stale hover the moment the vault closes; the
  // search query dies with the vault too
  useEffect(() => {
    if (!coreExpanded) {
      setMemHoverId(null);
      setMemQuery('');
    }
  }, [coreExpanded]);

  // while the vault opens/closes, pause every core CSS animation so the frame
  // budget goes entirely to the scale + camera glide — the drift/breathe
  // resumes once the transition lands
  const firstExpandRef = useRef(true);
  useEffect(() => {
    if (firstExpandRef.current) {
      firstExpandRef.current = false;
      return;
    }
    const el = coreGRef.current;
    const svg = svgRef.current;
    if (!el) return;
    el.classList.add('kg-transitioning');
    // cheaper rasterization while the viewBox is flying — full AA comes back
    // the moment the camera lands, so still frames stay crisp
    svg?.classList.add('kg-fast-raster');
    const t = setTimeout(() => {
      el.classList.remove('kg-transitioning');
      svg?.classList.remove('kg-fast-raster');
    }, 1250);
    return () => {
      clearTimeout(t);
      el.classList.remove('kg-transitioning');
      svg?.classList.remove('kg-fast-raster');
    };
  }, [coreExpanded]);
  // "true reset": for ~1.4s after going home, the rest pull turns near-rigid
  // so every node glides firmly onto the exact sunburst — no tornado aftermath
  const settleBoostRef = useRef(0);

  // ── the wheel turn ──────────────────────────────────────────────────────────
  // Focusing a department turns the WHOLE wheel so that pillar's sector faces
  // the viewer. In focus the wheel is no longer the small mid-canvas sunburst:
  // it becomes the enlarged apparatus with its hub sunk below the bottom edge
  // (FOCUS_WHEEL), the focused sector pointing straight up — you look INTO the
  // top of the wheel, and stepping ←/→ rolls the next sector over the rim
  // while the rest stays attached, transparent, one machine.
  const wheelRef = useRef(0); // current rotation applied to every rest target
  const wheelTargetRef = useRef(0);
  // pillar wheel state (focus mode): display order + who holds the stage —
  // assigned after deptList below, read by the force accessors every tick
  const deptOrderRef = useRef<string[]>([]);
  const focusTeamRef = useRef<string | null>(null);
  // the STAGE PHASE — a float "which sector is at the apex", eased in the rAF
  // so every sector's rim spot sweeps continuously along the arc: pressing an
  // arrow ROTATES the wheel and the neighbor arcs up into the top view.
  // stageVel gives it MASS: the turn winds up, coasts, and settles like a
  // large wheel instead of springing (Alex: "a large wheel animation").
  const stagePhaseRef = useRef(0);
  const stageTargetRef = useRef(0);
  const stageVelRef = useRef(0);
  const rimGuideRef = useRef<SVGGElement | null>(null);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  function configure(sim: Simulation<SimNode, undefined>) {
    const lay = () => layoutRef.current;
    const focused = () => !!lay();
    const tgt = (d: SimNode) => lay()?.get(d.id) ?? null; // focused-tree target
    const rest = (d: SimNode) => restRef.current.get(d.id) ?? null; // symmetric resting target
    // Firm pull toward the resting shape so it stays *symmetric* — firmness sets
    // WHERE nodes end up (the sunburst); the slow alpha + friction make the
    // motion floaty. The centre slider firms it further.
    // Center-force slider IS the symmetric-hold strength: low → loose & organic
    // (repel/link take over), high → snapped tight to the symmetric sunburst.
    const restStrength = () => centerRef.current;
    // Link-distance slider scales how far the linked rings sit from the centre
    // (edge length / overall spread) — a uniform scale, so symmetry is preserved.
    const spread = () => Math.max(0.7, Math.min(1.18, 0.7 + (linkRef.current - 10) / 180));
    // Open memory pushes the pillar gateways radially outward so they clear
    // the constellation; everything else keeps its resting spot (dimmed).
    const pushK = (d: SimNode) =>
      coreExpandedRef.current && d.kind === 'team' ? TEAM_PUSH_EXPANDED : 1;
    // rest targets ride the turning wheel: at home, rotate the home spot about
    // the center; in focus, project it onto the enlarged low-hub wheel so the
    // unfocused sectors curve away below the tree — one apparatus.
    const spun = (d: SimNode) => {
      const r = rest(d);
      if (!r) return null;
      if (focused()) return wheelPoint(r, { x: CX, y: CY }, FOCUS_WHEEL, wheelRef.current);
      return rotateAbout(r, { x: CX, y: CY }, wheelRef.current);
    };
    // the rim (Alex: a huge wheel with the departments ALREADY expanded):
    // every department's full tree is mounted on the rim at its sector angle
    // and rigidly rotated about the sunken hub by the LIVE eased phase — an
    // arrow press rotates the whole assembly clockwise/counterclockwise and
    // the neighbor tree swings into the apex, tilted the whole way.
    const rimOffset = (teamId: string) => {
      const order = deptOrderRef.current;
      const ti = order.indexOf(teamId);
      if (ti < 0 || order.length === 0) return null;
      const n = order.length;
      const phase = ((stagePhaseRef.current % n) + n) % n;
      return cyclicDeltaF(phase, ti, n);
    };
    const rim = (d: SimNode) => {
      if (!focused()) return null;
      const teamId = d.kind === 'team' ? d.id : teamForFocus(d.id);
      if (!teamId) return null;
      const o = rimOffset(teamId);
      if (o === null) return null;
      // the node's spot in its department's UPRIGHT tree, swung by the wheel;
      // a node missing from its tree rides its department's trunk instead
      const tree = allTreesRef.current.get(teamId);
      const home = tree?.positions.get(d.id) ?? tree?.positions.get(teamId) ?? wheelStageSpot(0, W, H);
      return rotateAbout(home, WHEEL_GEOM.hub, o * WHEEL_GEOM.delta);
    };
    // spread/push shape the HOME sunburst only — scaling them about the canvas
    // center would tear the focus wheel apart, so focus takes the projection raw
    const restX = (d: SimNode) => { const r = spun(d); return r ? (focused() ? r.x : (r.x - CX) * spread() * pushK(d) + CX) : CX; };
    const restY = (d: SimNode) => { const r = spun(d); return r ? (focused() ? r.y : (r.y - CY) * spread() * pushK(d) + CY) : CY; };
    // Repel slider adds breathing room; in focus the tree targets win out and
    // the condensed carousel sectors stop repelling (they stack on purpose).
    (sim.force('charge') as any).strength((d: SimNode) => (tgt(d) ? -34 : focused() ? 0 : -repelRef.current * 0.3));
    (sim.force('link') as any)
      .distance(() => linkRef.current)
      .strength(focused() ? () => 0 : () => 0.06);
    // rim targets ride the rotation for every department, including the one at
    // the apex (offset ≈ 0 = its upright tree); SELF keeps the focused tree's
    // trunk base so the memory core never swings with the rim
    const targetOf = (d: SimNode) => rim(d) ?? tgt(d);
    // d3's forceX/forceY CACHE their accessors at configure time — a live,
    // per-frame rim target would freeze at its first value. The stage force
    // below re-reads targetOf() every tick instead, so the rim genuinely
    // rotates under the nodes; forceX/Y stand down for every staged node.
    const staged = (d: SimNode) => focused() && !!(rim(d) ?? tgt(d));
    (sim.force('x') as any)
      .x((d: SimNode) => restX(d))
      .strength((d: SimNode) => (staged(d) ? 0 : Math.max(restStrength(), settleBoostRef.current)));
    (sim.force('y') as any)
      .y((d: SimNode) => restY(d))
      .strength((d: SimNode) => (staged(d) ? 0 : Math.max(restStrength(), settleBoostRef.current)));
    {
      let stageNodes: SimNode[] = [];
      const stageForce = ((alpha: number) => {
        if (!focused()) return;
        for (const d of stageNodes) {
          const t = targetOf(d);
          if (!t) continue;
          // the apex tree holds firm; the tilted riders track a touch looser
          const k = (tgt(d) ? 0.9 : 0.65) * alpha;
          d.vx = (d.vx ?? 0) + (t.x - (d.x ?? 0)) * k;
          d.vy = (d.vy ?? 0) + (t.y - (d.y ?? 0)) * k;
        }
      }) as any;
      stageForce.initialize = (ns: SimNode[]) => {
        stageNodes = ns;
      };
      sim.force('stage', stageForce);
    }
    // resting targets already encode the rings, so radial only guards stragglers
    (sim.force('radial') as any).strength((d: SimNode) => (tgt(d) || rest(d) ? 0 : 0.4));
    // gentler focus expansion (+4 not +6) so entering a tree pops less abruptly;
    // condensed carousel sectors collapse to points — no collision fighting
    (sim.force('collide') as any).radius((d: SimNode) => (tgt(d) ? CAT[d.kind].r + 4 : focused() ? 0.5 : CAT[d.kind].r + 3));
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  useEffect(() => {
    // Start nodes already on their symmetric resting positions so the very first
    // paint is the clean circle — no messy fly-in from a random ring placement.
    const rest = restRef.current;
    const nodes: SimNode[] = graph.nodes.map((n, i) => {
      const r = rest.get(n.id);
      if (r) return { ...n, x: r.x, y: r.y };
      const peers = graph.nodes.filter((m) => m.ring === n.ring).length || 1;
      const a = (i / peers) * Math.PI * 2;
      return { ...n, x: CX + Math.cos(a) * (RING_R[n.ring] || 1), y: CY + Math.sin(a) * (RING_R[n.ring] || 1) };
    });
    const links: SimLink[] = graph.edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind }));
    nodesRef.current = nodes;
    linksRef.current = links;

    // The sim may tick faster than the display; coalesce the React render to
    // one per animation frame (d3's physics keep ticking freely underneath).
    const renderTick = rafThrottle(() => setTick((t) => (t + 1) % 1_000_000));
    const sim = forceSimulation(nodes)
      // extra friction + a slow cool-down → nodes drift floatily into place
      // instead of snapping or overshooting
      .velocityDecay(0.62)
      .alphaDecay(0.015)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id))
      .force('charge', forceManyBody())
      .force('radial', forceRadial<SimNode>((d) => RING_R[d.ring], CX, CY))
      .force('x', forceX<SimNode>(CX))
      .force('y', forceY<SimNode>(CY))
      .force('collide', forceCollide<SimNode>(10))
      .on('tick', renderTick);
    configure(sim);
    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // turn the wheel so the focused pillar's home sector faces the stage —
  // stepping ←/→ therefore rotates the background exactly one sector in the
  // pressed direction (shortest way around, wrap included)
  const prevFocusTeamRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusTeamId) {
      prevFocusTeamRef.current = null;
      return;
    }
    // the STAGE PHASE target: entering from home snaps (the tree rises where
    // you clicked); stepping focus→focus rotates the shortest way around, so
    // the rim visibly turns in the direction of the pressed arrow
    const order = deptOrderRef.current;
    const idx = order.indexOf(focusTeamId);
    if (idx >= 0 && order.length > 0) {
      if (!prevFocusTeamRef.current) {
        stagePhaseRef.current = idx;
        stageTargetRef.current = idx;
      } else {
        const n = order.length;
        const phaseMod = ((stageTargetRef.current % n) + n) % n;
        stageTargetRef.current += cyclicDeltaF(phaseMod, idx, n);
      }
    }
    prevFocusTeamRef.current = focusTeamId;
    const home = restRef.current.get(focusTeamId);
    if (!home) return;
    const homeAngle = Math.atan2(home.y - CY, home.x - CX);
    const currentAngle = homeAngle + wheelTargetRef.current;
    wheelTargetRef.current += shortestAngleDelta(currentAngle, FOCUS_WHEEL.stage);
    simRef.current?.alpha(0.16).restart(); // keep physics warm through the turn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTeamId]);

  const prevExpandedRef = useRef(false);
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    configure(sim);
    // a soft reheat — enough to re-form the shape, gentle enough to drift, not
    // fly (0.16 eases focus enter/leave so it glides without jitter).
    // Opening the vault defers the reheat until the zoom lands: the pillar
    // push-out happens off-frame anyway, and per-tick React renders during the
    // scale + camera glide were most of the open-transition jank.
    const justOpened = coreExpanded && !prevExpandedRef.current;
    prevExpandedRef.current = coreExpanded;
    if (justOpened) {
      const t = setTimeout(() => simRef.current?.alpha(0.16).restart(), 950);
      return () => clearTimeout(t);
    }
    sim.alpha(0.16).restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repel, linkDist, centerForce, focusId, coreExpanded]);

  // ── cinematic camera ────────────────────────────────────────────────────────
  // The viewBox glides toward (and then tracks) whatever is selected — reading
  // LIVE sim positions every frame so it follows nodes as the physics drifts
  // them, like a camera operator. Written straight to the svg attribute so it
  // never fights React's render; prefers-reduced-motion snaps instantly.
  const camRef = useRef({
    focusTree: false,
    selectedOrgId: null as string | null,
    coreExpanded: false,
    selectedMemoryId: null as string | null,
    coreScale: 1,
  });
  camRef.current = {
    focusTree: !!focusTree,
    selectedOrgId: selectedAgentId ?? selectedHumanId ?? selectedTaskId ?? selectedToolId,
    coreExpanded,
    selectedMemoryId,
    coreScale: coreExpanded ? CORE_SCALE_EXPANDED : focusTree ? CORE_SCALE_TREE : 1,
  };
  const memProjById = useMemo(
    () => new Map((memory?.nodes ?? []).map((n) => [n.id, { vx: n.vx, vy: n.vy }])),
    [memory],
  );
  const memProjRef = useRef(memProjById);
  memProjRef.current = memProjById;

  // Whole-disc orbit for the mini Notes field: one slow rotation of the
  // entire constellation (edges + notes together, so geometry never detaches)
  // driven imperatively from the camera rAF — zero React re-renders. Frozen
  // while the core is open so notes hold still for reading and clicking.
  const memRotRef = useRef(0); // radians
  const memRotGRef = useRef<SVGGElement | null>(null);
  const memOverlayGRef = useRef<SVGGElement | null>(null);
  // last user interaction: ambient animation drops to 1/3 paint rate after
  // 15s untouched (an always-on dashboard must not pin a CPU core), and
  // returns to full frame rate the moment the pointer moves
  const lastActiveRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let cur: Rect = { x: 0, y: 0, w: W, h: H };
    let raf = 0;
    let lastT = performance.now();
    let lastRotDeg = NaN;
    let frame = 0;
    const ORBIT_S = 150; // seconds per full revolution — calm but visibly alive
    const IDLE_MS = 15_000;
    const step = () => {
      const c = camRef.current;
      const nowT = performance.now();
      // ease the wheel toward its target (shortest way around) — the physics
      // accessors read wheelRef live, so the whole background glides with it
      const wd = shortestAngleDelta(wheelRef.current, wheelTargetRef.current);
      if (Math.abs(wd) > 0.0005) wheelRef.current += wd * 0.075;
      // ease the STAGE PHASE with inertia — velocity chases the error, phase
      // integrates velocity, so the turn winds up, coasts, and settles like a
      // massive wheel; keep the sim warm for the whole sweep or the nodes
      // would stall mid-rim
      const sd = stageTargetRef.current - stagePhaseRef.current;
      stageVelRef.current += (sd * 0.075 - stageVelRef.current) * 0.09;
      if (Math.abs(sd) > 0.0008 || Math.abs(stageVelRef.current) > 0.0004) {
        stagePhaseRef.current += stageVelRef.current;
        const sim = simRef.current;
        if (sim && Math.abs(sd) > 0.02 && sim.alpha() < 0.05) sim.alpha(0.1).restart();
        // the wheel's dashed rails turn WITH the phase — the machinery itself
        // visibly rotates about the sunken hub, selling the large wheel
        // (only while focused: at home the SMIL orbit owns this transform)
        if (camRef.current.focusTree) {
          rimGuideRef.current?.setAttribute(
            'transform',
            `rotate(${(-stagePhaseRef.current * RIM_DELTA_DEG).toFixed(3)} ${FOCUS_WHEEL.hub.x} ${FOCUS_WHEEL.hub.y})`,
          );
        }
      }
      frame = (frame + 1) % 3;
      // idle = untouched for a while with nothing focused or selected; the
      // orbit and pulses then update every 3rd frame — dt spans the skipped
      // frames so the visual speed is identical, just a third of the paints
      const idle =
        nowT - lastActiveRef.current > IDLE_MS &&
        !c.focusTree && !c.coreExpanded && !c.selectedOrgId && !c.selectedMemoryId;
      if (idle && frame !== 0) {
        raf = requestAnimationFrame(step);
        return;
      }
      const dt = Math.min(0.1, (nowT - lastT) / 1000);
      lastT = nowT;
      if (!reduced && !c.coreExpanded) {
        memRotRef.current = (memRotRef.current + (2 * Math.PI * dt) / ORBIT_S) % (2 * Math.PI);
      }
      const rotDeg = (memRotRef.current * 180) / Math.PI;
      // only touch the DOM when the angle actually moved — rewriting the same
      // transform every frame invalidates the whole (large) subtree's paint
      // and halves the open-state frame rate
      if (rotDeg !== lastRotDeg) {
        lastRotDeg = rotDeg;
        const rotG = memRotGRef.current;
        if (rotG) {
          rotG.setAttribute('transform', `rotate(${rotDeg})`);
          // folder hub labels live inside the rotating frame — hold them upright
          for (const el of rotG.getElementsByClassName('kg-mem-upright')) el.setAttribute('transform', `rotate(${-rotDeg})`);
        }
        const overlayG = memOverlayGRef.current;
        if (overlayG) {
          overlayG.setAttribute('transform', `rotate(${rotDeg})`);
          // keep hover/selection labels upright inside the rotating frame
          for (const el of overlayG.getElementsByClassName('kg-mem-upright')) el.setAttribute('transform', `rotate(${-rotDeg})`);
        }
        synapseRotGRef.current?.setAttribute('transform', `rotate(${rotDeg})`);
      }
      // synapse sparks: bright pulses firing along the visible links — each
      // spark rides one segment per cycle, then hops to another (deterministic
      // hash walk, no RNG per frame)
      if (!reduced) {
        const segs = sparkSegsRef.current;
        if (segs.length) {
          for (let i = 0; i < SYNAPSE_N; i++) {
            const el = sparkRefs.current[i];
            if (!el) continue;
            const period = 2400 + ((i * 379) % 1700);
            const t = nowT + i * 911;
            const cycle = Math.floor(t / period);
            const seg = segs[(cycle * 131 + i * 37) % segs.length];
            const u = (t % period) / period;
            el.setAttribute('cx', String(seg[0] + (seg[2] - seg[0]) * u));
            el.setAttribute('cy', String(seg[1] + (seg[3] - seg[1]) * u));
            el.setAttribute('opacity', String(0.95 * Math.sin(Math.PI * u)));
          }
        }
      }
      const posOf = (id: string | null) => {
        if (!id) return null;
        const n = nodesRef.current.find((m) => m.id === id);
        return n ? { x: n.x, y: n.y } : null;
      };
      const coreCenter = posOf(SELF_ID) ?? { x: CX, y: CY };
      const proj = c.selectedMemoryId ? memProjRef.current.get(c.selectedMemoryId) : null;
      // the field is rotated by memRot, so the camera aims at the note's
      // effective (rotated) position — rotation is frozen while notes are
      // selectable, so the target stays put once framed
      const th = memRotRef.current;
      const rProj = proj
        ? { vx: proj.vx * Math.cos(th) - proj.vy * Math.sin(th), vy: proj.vx * Math.sin(th) + proj.vy * Math.cos(th) }
        : null;
      const target = cameraRect(
        { w: W, h: H },
        {
          focusedTeam: c.focusTree,
          coreExpanded: c.coreExpanded,
          coreCenter,
          selectedNodePos: posOf(c.selectedOrgId),
          memorySelectedPos: rProj ? memoryNodePos(rProj, coreCenter, R_CORE * c.coreScale) : null,
        },
      );
      const goingHome = !c.focusTree && !c.coreExpanded && !c.selectedOrgId && !c.selectedMemoryId;
      const next = lerpRect(cur, target, reduced ? 1 : goingHome ? CAM_EASE_HOME : CAM_EASE);
      if (next !== cur) {
        cur = next;
        const svg = svgRef.current;
        if (svg) {
          svg.setAttribute('viewBox', `${cur.x} ${cur.y} ${cur.w} ${cur.h}`);
          // zoom factor for the constant-size label counter-scale
          svg.style.setProperty('--kg-cam-k', String(cur.w / W));
        }
      }

      // communication pulses along the live spokes (skip under reduced motion)
      if (!reduced) {
        const now = performance.now();
        const selfPos = posOf(SELF_ID);
        for (const [key, el] of commRefs.current) {
          const sep = key.lastIndexOf(':');
          const teamId = key.slice(0, sep);
          const dir = key.slice(sep + 1);
          const teamPos = posOf(teamId);
          if (!selfPos || !teamPos) continue;
          // same bow as edgeArc so the dots ride the drawn spoke exactly
          const dx = teamPos.x - selfPos.x;
          const dy = teamPos.y - selfPos.y;
          const len = Math.hypot(dx, dy) || 1;
          const mx = (selfPos.x + teamPos.x) / 2 + (-dy / len) * 0.12 * len;
          const my = (selfPos.y + teamPos.y) / 2 + (dx / len) * 0.12 * len;
          const seed = (hashStr(teamId) % 100) / 100;
          const u =
            dir === 'out'
              ? (now / 2600 + seed) % 1
              : 1 - ((now / 3300 + seed * 1.7) % 1);
          const a = 1 - u;
          const x = a * a * selfPos.x + 2 * a * u * mx + u * u * teamPos.x;
          const y = a * a * selfPos.y + 2 * a * u * my + u * u * teamPos.y;
          el.setAttribute('transform', `translate(${x},${y})`);
          el.setAttribute('opacity', String(0.9 * Math.sin(Math.PI * u)));
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // any input wakes the ambient animation back to full frame rate
    const wake = () => {
      lastActiveRef.current = performance.now();
    };
    const WAKE_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const;
    for (const ev of WAKE_EVENTS) window.addEventListener(ev, wake, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      for (const ev of WAKE_EVENTS) window.removeEventListener(ev, wake);
    };
  }, []);

  const nodes = nodesRef.current;
  const links = linksRef.current;
  // lenses (Alex taxonomy): slice the graph by entity type, business
  // function, or action — the matching nodes stay lit, everything else dims.
  // Focus and hover both outrank an armed lens.
  const [lensId, setLensId] = useState<string | null>(null);
  const lensLit = useMemo(
    () => (lensId ? lensNodeSet(lensId, { nodes: graph.nodes, teamOf: (id) => teamForFocus(id) ?? null }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lensId, graph],
  );
  const lit = focusSet ?? (hoverId ? litFor(hoverId) : null) ?? lensLit;
  const posById = new Map(nodes.map((n) => [n.id, n]));
  const focusedTeam = focusTeamId ? byId.get(focusTeamId) : null;

  // Exit crossfade: when a focused tree closes, keep its skeleton for ~650ms
  // drawn from the LIVE node positions — the limbs stay attached to the nodes
  // as they glide home and fade out together, and the resting web fades back
  // in underneath. No detach, no pop; the graph returns to its origin shape.
  const [exitTree, setExitTree] = useState<TreeLayoutResult | null>(null);
  const prevTreeRef = useRef<TreeLayoutResult | null>(null);
  useEffect(() => {
    if (focusTree) {
      prevTreeRef.current = focusTree;
      setExitTree(null);
      return;
    }
    if (prevTreeRef.current) {
      setExitTree(prevTreeRef.current);
      prevTreeRef.current = null;
      const t = setTimeout(() => setExitTree(null), 280);
      return () => clearTimeout(t);
    }
  }, [focusTree]);

  // constellation layout in the core's local space (origin = self anchor)
  const coreScale = coreExpanded ? CORE_SCALE_EXPANDED : focusTree ? CORE_SCALE_TREE : 1;
  const memLayout = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const n of memory?.nodes ?? []) m.set(n.id, memoryNodePos(n, { x: 0, y: 0 }, R_CORE));
    return m;
  }, [memory]);
  const memById = useMemo(() => new Map((memory?.nodes ?? []).map((n) => [n.id, n])), [memory]);
  const memHits = useMemo(
    () => (coreExpanded && memory ? searchMemoryNotes(memory.nodes, memQuery) : []),
    [coreExpanded, memory, memQuery],
  );
  // link segments (local coords) among currently visible notes — the tracks
  // the synapse sparks travel; recomputed only when the LOD tier flips
  const sparkSegs = useMemo(() => {
    if (!memoryOn || !memory) return [] as [number, number, number, number][];
    const ids = new Set((coreExpanded ? memory.nodes : pickRestTier(memory.nodes)).map((n) => n.id));
    const segs: [number, number, number, number][] = [];
    for (const e of memory.edges) {
      if (!ids.has(e.source) || !ids.has(e.target)) continue;
      const s = memLayout.get(e.source);
      const t = memLayout.get(e.target);
      if (!s || !t) continue;
      segs.push([s.x, s.y, t.x, t.y]);
    }
    return segs;
  }, [memoryOn, memory, memLayout, coreExpanded]);
  const sparkSegsRef = useRef(sparkSegs);
  sparkSegsRef.current = sparkSegs;
  const sparkRefs = useRef<(SVGCircleElement | null)[]>([]);
  const synapseRotGRef = useRef<SVGGElement | null>(null);
  // note → direct neighbors, for the Notes-style hover: the pointed-at note
  // lights up its linked notes and the links between them
  const memAdj = useMemo(() => {
    const m = new Map<string, string[]>();
    const add = (a: string, b: string) => {
      const list = m.get(a);
      if (list) list.push(b);
      else m.set(a, [b]);
    };
    for (const e of memory?.edges ?? []) {
      add(e.source, e.target);
      add(e.target, e.source);
    }
    return m;
  }, [memory]);

  // ── communication pulses ────────────────────────────────────────────────────
  // Little dots ride the pillar spokes between the memory core and each
  // department head — outbound white (Alex briefing the pillar), inbound in
  // the pillar's color (the department reporting home). Positioned imperatively
  // in the camera rAF (they must follow LIVE drifting endpoints), so React
  // renders each circle exactly once.
  const commTeams = useMemo(
    () =>
      orderGraphDepartments(
        graph.nodes.filter((n) => n.kind === 'team'),
        (t) => t.id.replace('team:', ''),
      ).map((t) => ({ id: t.id, color: t.color ?? 'var(--brain-1)' })),
    [graph],
  );
  const commRefs = useRef(new Map<string, SVGCircleElement>());
  const setCommRef = (key: string) => (el: SVGCircleElement | null) => {
    if (el) commRefs.current.set(key, el);
    else commRefs.current.delete(key);
  };
  // hover-stir: toggled straight on the DOM (no re-render) — CSS resumes the
  // paused stir animations while the mouse is over the core
  const coreGRef = useRef<SVGGElement | null>(null);

  // Escape walks back out: card → focus → home (inline view; fullscreen has
  // its own handler). Registered only while there is something to escape.
  const hasDetailRef = useRef(false);
  hasDetailRef.current = !!(selectedAgentId || selectedToolId || selectedTaskId || selectedHumanId || selectedMemoryId);
  const canEscapeRef = useRef(false);
  canEscapeRef.current = hasDetailRef.current || !!focusId || coreExpanded;
  const focusTreeRef = useRef(false);
  focusTreeRef.current = !!focusTree;
  const stepDeptRef = useRef<(dir: number) => void>(() => {});
  useEffect(() => {
    if (fullscreen) return; // the fullscreen overlay owns Escape there
    const onKey = (e: KeyboardEvent) => {
      // ignore keys typed into inputs elsewhere on the page
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (e.key === 'Escape' && canEscapeRef.current) {
        if (hasDetailRef.current) clearDetail();
        else clearAll();
        return;
      }
      // ← / → step departments while a pillar is focused, same as fullscreen
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && focusTreeRef.current) {
        stepDeptRef.current(e.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  // "/" focuses the vault search whenever the Notes core is open — works
  // in both the inline view and fullscreen (registered independently of the
  // mode-specific handlers above)
  useEffect(() => {
    const onSlash = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (!coreExpandedRef.current) return;
      e.preventDefault();
      memSearchRef.current?.focus();
    };
    window.addEventListener('keydown', onSlash);
    return () => window.removeEventListener('keydown', onSlash);
  }, []);

  // The constellation subtree is ~2k SVG elements; memoize it so the physics
  // tick (which re-renders the component every animation frame) reuses the
  // exact same element and React skips reconciling any of it. Hover and
  // selection live in a tiny overlay OUTSIDE this memo, so pointing at notes
  // never rebuilds the field — that was the click/hover lag.
  const memoryCoreInner = useMemo(() => {
    if (!memoryOn) return null;
    // level of detail: a calm subset at rest, the full field once clicked open
    const visible = coreExpanded ? memory!.nodes : pickRestTier(memory!.nodes);
    const visibleIds = new Set(visible.map((n) => n.id));
    const restIds = coreExpanded ? new Set(pickRestTier(memory!.nodes).map((n) => n.id)) : visibleIds;
    const layers: MemoryGraph['nodes'][] = [[], [], []];
    for (const m of visible) layers[memLayerOf(m.id)].push(m);
    return (
      <g
        className={coreExpanded ? 'kg-core-open' : undefined}
        // diving in stays cinematic; closing matches the snap-home feel
        style={{ transform: `scale(${coreScale})`, transition: `transform ${coreExpanded ? 900 : 450}ms cubic-bezier(0.22, 1, 0.36, 1)` }}
      >
        {/* disc backdrop so the constellation reads against the grid */}
        <circle r={R_CORE + 10} fill="var(--surface)" fillOpacity={0.72} stroke="var(--border-strong)" strokeWidth={1} />
        {/* a soft wash of light behind the field, breathing slowly */}
        {/* ember wash to match the clay-orange field (was a cold white) */}
        <circle r={R_CORE - 4} fill={HUB_COLOR} className="kg-core-glow" style={{ pointerEvents: 'none' }} />

        {/* the vault graph — edges and notes ride one slowly revolving frame
            (transform written from the camera rAF) so the whole field travels
            around the entire disc, never detaching links from notes */}
        <g ref={memRotGRef} transform={`rotate(${(memRotRef.current * 180) / Math.PI})`}>
        {/* the web — hub member edges draw the orange dandelion spokes of the
            reference; wikilinks stay quiet hairlines between the dots */}
        {memory!.edges.map((e, i) => {
          if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) return null;
          const s = memLayout.get(e.source);
          const t = memLayout.get(e.target);
          if (!s || !t) return null;
          const src = memById.get(e.source);
          const tint = e.type === 'member' ? HUB_COLOR : !src ? 'var(--dim)' : memColor(src);
          // the wikilink web recedes to a whisper so the hub spokes carry the
          // structure — the reference shows barely any lines between the dots
          const w = e.type === 'wikilink' ? 0.28 : e.type === 'similar' ? 0.24 : 0.26;
          const o = e.type === 'wikilink' ? 0.15 : e.type === 'similar' ? 0.1 : 0.2;
          return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={tint} strokeWidth={w} opacity={o} />;
        })}

        {/* notes + folder hubs — three drifting, breathing layers, each with a
            paused stir wrapper that wakes while the mouse hovers the core */}
        {layers.map((layer, li) => (
          <g key={li} className="kg-mem-layer" style={MEM_LAYERS[li]}>
          <g className="kg-mem-stir" style={MEM_STIRS[li]}>
            {layer.map((m) => {
              const p = memLayout.get(m.id);
              if (!p) return null;
              const orphan = m.type === 'page' && m.links === 0;
              const mc = memColor(m);
              const mr = memNodeR(m);
              // static per-node brightness variance: layered with the layer
              // breathe, the field shimmers individually at zero extra cost
              const shimmer = 0.86 + ((hashStr(m.id) >> 3) % 15) / 100;
              return (
                <g
                  key={m.id}
                  className={coreExpanded && !restIds.has(m.id) ? 'kg-mem-in' : undefined}
                  transform={`translate(${p.x},${p.y})`}
                  style={{ pointerEvents: coreExpanded ? 'auto' : 'none', cursor: 'pointer' }}
                  onMouseEnter={() => setMemHoverId(m.id)}
                  onMouseLeave={() => setMemHoverId((h) => (h === m.id ? null : h))}
                  // keep the core's drag machinery (and its pointer capture,
                  // which would retarget the click) out of note interactions
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    clearDetail();
                    setSelectedMemoryId((s) => (s === m.id ? null : m.id));
                  }}
                >
                  <title>{`${m.label} · memory`}</title>
                  {coreExpanded && <circle r={Math.max(6, mr + 4)} fill="transparent" />}
                  {/* the node itself is a slight hexagon (the field's outer
                      boundary stays a circle) */}
                  <polygon
                    points={hexPts(mr)}
                    fill={mc}
                    fillOpacity={m.type === 'folder' ? 1 : orphan ? 0.75 : shimmer}
                    stroke={mc}
                    strokeWidth={m.type === 'folder' ? 0.8 : 0}
                    strokeLinejoin="round"
                  />
                  {m.type === 'folder' && (
                    <g className="kg-mem-upright" transform={`rotate(${(-memRotRef.current * 180) / Math.PI})`}>
                      <text
                        y={mr + 4}
                        textAnchor="middle"
                        fontFamily="var(--font-mono)"
                        fontWeight={600}
                        fill={mc}
                        opacity={coreExpanded ? 1 : 0}
                        style={{
                          transition: 'opacity 300ms ease',
                          pointerEvents: 'none',
                          ...fixedLabel(10, coreScale),
                        }}
                      >
                        {m.label.length > 18 ? `${m.label.slice(0, 16).trimEnd()}…` : m.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
          </g>
        ))}
        </g>

        {/* the middle of the brain is Notes: all of Alex's markdown */}
        <text
          y={R_CORE + 22}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontWeight={600}
          fill="var(--text-2)"
          opacity={coreExpanded ? 0 : 1}
          style={{ transition: 'opacity 400ms ease', ...fixedLabel(10, coreScale) }}
        >
          Notes
        </text>
      </g>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryOn, memory, memLayout, memById, coreExpanded, coreScale]);

  // Static backdrop chrome — depends only on constants, so memoize it once and
  // let React skip reconciling it on every (now frame-throttled) sim tick.
  // A subtle radial vignette pools attention on the center, two solid faint
  // guide rings mark the worker and tool orbits, and the dashed rings rotate.
  const orbitalRings = useMemo(
    () => (
      <>
        {/* (No edge vignette: on light themes its var(--bg) overlay painted a
            darker rectangular frame around a lighter center — the "faint box"
            Alex flagged. The canvas now fills the frame cleanly.) */}
        {/* ring guides ride the same wheel as the nodes: small sunburst at
            home, huge low-hub arcs in focus — cx/cy/r are CSS-transitionable,
            so the rails visibly morph into the apparatus instead of floating
            mid-canvas like a second, broken machine */}
        {(() => {
          const gc = focusTree ? FOCUS_WHEEL.hub : { x: CX, y: CY };
          const gk = focusTree ? FOCUS_WHEEL.scale : 1;
          const glide = { transition: 'cx 900ms var(--ease), cy 900ms var(--ease), r 900ms var(--ease)' } as const;
          return (
            <>
              <circle cx={gc.x} cy={gc.y} r={((RING_R[2] + RING_R[3]) / 2) * gk} fill="none" stroke="var(--border)" strokeWidth="1" opacity={0.28} style={glide} />
              <circle cx={gc.x} cy={gc.y} r={((RING_R[3] + RING_R[4]) / 2) * gk} fill="none" stroke="var(--border)" strokeWidth="1" opacity={0.2} style={glide} />
              <g ref={rimGuideRef} opacity={0.55}>
                {!focusTree && (
                  <animateTransform attributeName="transform" attributeType="XML" type="rotate" from={`0 ${CX} ${CY}`} to={`360 ${CX} ${CY}`} dur="150s" repeatCount="indefinite" />
                )}
                {RING_R.slice(1).map((r) => (
                  <circle key={r} cx={gc.x} cy={gc.y} r={r * gk} fill="none" stroke="var(--border)" strokeWidth="1" strokeDasharray="2 6" style={glide} />
                ))}
              </g>
            </>
          );
        })()}
      </>
    ),
    [],
  );

  // ── selection / panel data ────────────────────────────────────────────────
  const selectedAgent = selectedAgentId ? agentById.get(selectedAgentId) : null;
  const selectedAgentTaskId = selectedAgentId ? taskOfWorker.get(selectedAgentId) ?? null : null;
  const selectedAgentTask = selectedAgentTaskId ? taskById.get(selectedAgentTaskId) ?? null : null;
  const selectedAgentParent = selectedAgent?.parentId
    ? agents.find((a) => a.id === selectedAgent.parentId) ?? null
    : null;
  const selectedAgentSubs = selectedAgent
    ? agents.filter((a) => a.parentId === selectedAgent.id).map((a) => ({ id: a.id, name: a.name }))
    : [];
  const selectedAgentRun = selectedAgent ? runsByAgent[selectedAgent.id] ?? null : null;
  const agentHeadName = (() => {
    if (!selectedAgentId) return null;
    const team = teamOfWorker.get(selectedAgentId);
    return team ? headForDepartment(team.replace('team:', ''))?.name ?? null : null;
  })();
  const toolWiki = selectedToolId
    ? buildToolWiki(
        toolSlugOf(selectedToolId),
        (workersOfTool.get(selectedToolId) ?? []).map(
          (w) => agentById.get(w)?.name ?? personById.get(w)?.name ?? byId.get(w)?.label ?? w,
        ),
      )
    : null;

  // tool chips (slug/name/mcp) for the SOP + human cards
  const toolChips = (workerId: string | null) =>
    (workerId ? toolsOfWorker.get(workerId) ?? [] : []).map((t) => {
      const slug = toolSlugOf(t);
      return { slug, name: prettifySlug(slug), mcp: buildToolWiki(slug).mcp };
    });

  const selectedTask = selectedTaskId ? taskById.get(selectedTaskId) : null;
  const selectedTaskWorker = selectedTaskId ? workerOfTask.get(selectedTaskId) ?? null : null;
  const selectedTaskWorkerNode = selectedTaskWorker ? byId.get(selectedTaskWorker) : null;
  const selectedHuman = selectedHumanId ? personById.get(selectedHumanId) : null;
  const selectedHumanTaskId = selectedHumanId ? taskOfWorker.get(selectedHumanId) ?? null : null;
  const selectedHumanTask = selectedHumanTaskId ? taskById.get(selectedHumanTaskId) ?? null : null;

  const deptList = useMemo<DeptLite[]>(
    () =>
      orderGraphDepartments(
        graph.nodes.filter((n) => n.kind === 'team'),
        (t) => t.id.replace('team:', ''),
      ).map((t) => {
        const deptId = t.id.replace('team:', '');
        return {
          teamId: t.id,
          deptId,
          name: t.label,
          color: t.color ?? 'var(--brain-1)',
          tagline: departments.find((d) => d.id === deptId)?.tagline ?? '',
        };
      }),
    [graph, departments],
  );

  const currentDept = deptList.find((d) => d.teamId === focusTeamId) ?? null;
  deptOrderRef.current = deptList.map((d) => d.teamId);
  focusTeamRef.current = focusTeamId;

  // the two pillars riding the flanks while a tree is focused — the only
  // unfocused nodes that stay visible (everything else condenses off-stage)
  const flankTeams = useMemo(() => {
    if (!focusTeamId) return null;
    const order = deptList.map((d) => d.teamId);
    const fi = order.indexOf(focusTeamId);
    if (fi < 0 || order.length < 2) return null;
    return new Set([order[(fi + 1) % order.length], order[(fi - 1 + order.length) % order.length]]);
  }, [deptList, focusTeamId]);

  // ── interaction helpers ─────────────────────────────────────────────────--
  const clearDetail = () => {
    setSelectedAgentId(null);
    setSelectedToolId(null);
    setSelectedTaskId(null);
    setSelectedHumanId(null);
    setSelectedMemoryId(null);
  };
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAll = () => {
    setFocusId(null);
    setCoreExpanded(false);
    clearDetail();
    // GLIDE back to the main view (Alex, 2026-07-12: "see the animation of
    // it going back into the circle form") — the tree unwinds and every node
    // flows firmly onto its sunburst spot: a near-rigid rest pull for ~1.1s so
    // the circle re-forms visibly but decisively, no tornado aftermath.
    wheelTargetRef.current = wheelRef.current; // stop mid-turn where it stands
    for (const n of nodesRef.current) {
      n.fx = null;
      n.fy = null;
    }
    settleBoostRef.current = 0.32;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleBoostRef.current = 0;
      settleTimerRef.current = null;
    }, 1100);
    simRef.current?.alpha(0.35).restart();
  };
  const navDept = (teamId: string) => {
    setFocusId(teamId);
    clearDetail();
  };
  // rotate to the prev/next department in place (inline focus, no fullscreen)
  const stepDept = (dir: number) => {
    const ids = deptList.map((d) => d.teamId);
    if (ids.length === 0) return;
    const i = ids.indexOf(focusTeamId ?? '');
    const next = i < 0 ? (dir > 0 ? 0 : ids.length - 1) : (i + dir + ids.length) % ids.length;
    navDept(ids[next]);
  };
  stepDeptRef.current = stepDept;
  const selectAgent = (id: string) => {
    setFocusId(teamForFocus(id) ?? id);
    clearDetail();
    setSelectedAgentId(id);
  };
  const selectHuman = (id: string) => {
    setFocusId(teamForFocus(id) ?? id);
    clearDetail();
    setSelectedHumanId(id);
  };
  const selectWorker = (id: string) =>
    (personById.has(id) ? selectHuman : selectAgent)(id);
  const selectTask = (id: string) => {
    setFocusId((f) => teamForFocus(id) ?? f);
    clearDetail();
    setSelectedTaskId(id);
  };
  const selectTool = (id: string) => {
    setFocusId((f) => teamForFocus(id) ?? f);
    clearDetail();
    setSelectedToolId(id);
  };
  // shared tools exist as one copy per department — resolve a slug to the
  // copy inside the focused pillar when there is one, else any copy
  const selectToolSlug = (slug: string) => {
    const dept = focusTeamId?.replace('team:', '');
    const local = dept ? `tool:${slug}@${dept}` : null;
    const target =
      (local && byId.has(local) && local) ||
      (byId.has(`tool:${slug}`) && `tool:${slug}`) ||
      graph.nodes.find((n) => n.kind === 'tool' && toolSlugOf(n.id) === slug)?.id;
    if (target) selectTool(target);
  };

  // the everything-index: every agent, human, SOP and tool, grouped and
  // alphabetized. Click = jump the graph to that node; hover = pre-light it.
  const directory = useMemo(
    () => graphDirectory(agents, departments, people, tasks, graph),
    [agents, departments, people, tasks, graph],
  );
  const pickFromDirectory = (kind: DirectoryGroup['kind'], id: string) => {
    if (kind === 'tool') selectToolSlug(id);
    else if (kind === 'task') selectTask(id);
    else selectWorker(id);
  };
  const hoverFromDirectory = (kind: DirectoryGroup['kind'], id: string | null) => {
    if (!id) {
      setHoverId(null);
      return;
    }
    const nodeId = kind === 'tool' ? graph.nodes.find((n) => n.kind === 'tool' && toolSlugOf(n.id) === id)?.id ?? null : id;
    setHoverId(nodeId);
  };
  const directoryPanel = (
    <GraphDirectory groups={directory} onPick={pickFromDirectory} onHover={hoverFromDirectory} collapsed={directoryCollapsed} onToggleCollapse={() => setDirectoryCollapsed((v) => !v)} className="h-full" />
  );

  // compact legend for the fullscreen wheel: color + icon per kind, with the
  // Notes core in its vault orange
  const compactLegend = (
    <div className="flex items-center gap-3 rounded-sm-t border border-os-border-strong bg-os-bg/85 px-2.5 py-1.5 backdrop-blur">
      {(
        [
          { label: 'Notes', color: HUB_COLOR, Icon: CAT.self.Icon },
          { label: 'Human', color: CAT.person.color, Icon: CAT.person.Icon },
          { label: 'AI agent', color: CAT.employee.color, Icon: CAT.employee.Icon },
          { label: 'Tool', color: CAT.tool.color, Icon: CAT.tool.Icon },
          { label: 'SOP task', color: CAT.task.color, Icon: CAT.task.Icon },
        ] as const
      ).map(({ label, color, Icon }) => (
        <span key={label} className="flex items-center gap-1.5 font-mono text-[9.5px] text-os-muted">
          <Icon className="h-3 w-3" style={{ color }} strokeWidth={2} />
          {label}
        </span>
      ))}
    </div>
  );

  // the vault search chip — one instance, rendered by whichever chrome is live
  // (inline top-left row or the fullscreen wrapper slot)
  const vaultSearchInput = coreExpanded ? (
    <input
      ref={memSearchRef}
      value={memQuery}
      onChange={(e) => setMemQuery(e.target.value)}
      onKeyDown={(e) => {
        // Escape inside the input clears the search, not the vault
        if (e.key === 'Escape' && memQuery) {
          e.stopPropagation();
          setMemQuery('');
        }
      }}
      placeholder="find a note…  /"
      aria-label="Search the vault"
      title="Press / to search the vault"
      spellCheck={false}
      className="w-40 rounded-sm-t border border-os-border-strong bg-os-bg/85 px-2 py-1.5 font-mono text-[10.5px] text-os-text placeholder:text-os-dim backdrop-blur outline-none transition-colors focus:border-os-accent"
    />
  ) : null;

  const onNodeClick = (n: KGNode) => {
    if (n.kind === 'self') {
      // Alex IS the memory: clicking him dives into (or out of) the
      // constellation. Without memory data he stays the old clear-all anchor.
      if (memoryOn) {
        const entering = !coreExpanded;
        setFocusId(null);
        clearDetail();
        setCoreExpanded(entering);
      } else {
        clearAll();
      }
      return;
    }
    // any org-layer click steps back out of the memory core
    setCoreExpanded(false);
    setSelectedMemoryId(null);
    if (n.kind === 'employee') {
      const was = selectedAgentId === n.id;
      setFocusId(n.id);
      clearDetail();
      if (!was) setSelectedAgentId(n.id);
    } else if (n.kind === 'person') {
      const was = selectedHumanId === n.id;
      setFocusId(n.id);
      clearDetail();
      if (!was) setSelectedHumanId(n.id);
    } else if (n.kind === 'task') {
      const was = selectedTaskId === n.id;
      setFocusId((f) => teamForFocus(n.id) ?? f);
      clearDetail();
      if (!was) setSelectedTaskId(n.id);
    } else if (n.kind === 'tool') {
      const was = selectedToolId === n.id;
      setFocusId((f) => teamForFocus(n.id) ?? f);
      clearDetail();
      if (!was) setSelectedToolId(n.id);
    } else {
      clearDetail();
      setFocusId((f) => (f === n.id ? null : n.id));
    }
  };

  // ── detail cards (shared by the inline overlay + fullscreen) ────────────────
  const agentCard = selectedAgent ? (
    <AgentHarnessCard
      agent={selectedAgent}
      task={selectedAgentTask}
      parentName={selectedAgentParent?.name ?? null}
      parentAgentId={selectedAgentParent?.id ?? null}
      subAgents={selectedAgentSubs}
      lastRun={selectedAgentRun}
      runLabel={selectedAgentRun ? agoLabel(selectedAgentRun.finishedAt) : null}
      headName={agentHeadName}
      onClose={() => setSelectedAgentId(null)}
      onTool={selectToolSlug}
      onAgent={(id) => selectAgent(`emp:${id}`)}
      onTask={selectedAgentTaskId ? () => selectTask(selectedAgentTaskId) : undefined}
    />
  ) : null;

  const taskRuntime = (() => {
    if (!selectedTask) return null;
    if (selectedTask.assigneeKind === 'person') return 'human · judgment call';
    const a = agents.find((x) => x.id === selectedTask.assigneeId);
    return a ? `${a.instance} · ${a.model}` : null;
  })();

  const taskCard = selectedTask ? (
    <SopTaskDetailCard
      task={selectedTask}
      assigneeName={selectedTaskWorkerNode?.label ?? selectedTask.assigneeId}
      assigneeKindLabel={selectedTask.assigneeKind === 'person' ? 'human employee' : 'AI agent'}
      assigneeColor={selectedTask.assigneeKind === 'person' ? 'var(--warn)' : 'var(--accent)'}
      runtime={taskRuntime}
      tools={toolChips(selectedTaskWorker)}
      onClose={clearDetail}
      onAssignee={selectedTaskWorker ? () => selectWorker(selectedTaskWorker) : undefined}
      onTool={selectToolSlug}
    />
  ) : null;

  const humanCard = selectedHuman ? (
    <GraphHumanDetailCard
      person={selectedHuman}
      deptName={byId.get(`team:${selectedHuman.departmentId}`)?.label ?? selectedHuman.departmentId}
      color="var(--warn)"
      task={selectedHumanTask}
      tools={toolChips(selectedHumanId)}
      onClose={clearDetail}
      onTask={selectedHumanTaskId ? () => selectTask(selectedHumanTaskId) : undefined}
      onTool={selectToolSlug}
    />
  ) : null;

  const selectedMemory = selectedMemoryId ? memory?.nodes.find((n) => n.id === selectedMemoryId) ?? null : null;
  const memoryCard = selectedMemory ? (
    <MemoryNoteCard
      note={selectedMemory}
      color={memColor(selectedMemory)}
      onClose={() => setSelectedMemoryId(null)}
    />
  ) : null;

  // (The Clients pillar used to auto-open its roster in the detail slot —
  // Alex read the unprompted pop-up as a bug, 2026-07-12. Cards now open
  // only when a node is explicitly clicked, on every pillar equally.)

  // ── node dragging ───────────────────────────────────────────────────────────
  // Pointer-drag any node: pin it to the cursor while held (the rest reacts via
  // physics), release back into the sim. A real drag suppresses the click so it
  // doesn't accidentally focus/select; a plain click still does.
  const simNode = (id: string) => nodesRef.current.find((n) => n.id === id) ?? null;
  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  };
  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    dragRef.current = { id, moved: false, startX: e.clientX, startY: e.clientY };
    const node = simNode(id);
    if (node) {
      node.fx = node.x;
      node.fy = node.y;
    }
    simRef.current?.alphaTarget(0.2).restart();
  };
  const onNodePointerMove = (e: React.PointerEvent, id: string) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 3) drag.moved = true;
    const p = toSvgPoint(e.clientX, e.clientY);
    const node = simNode(id);
    if (p && node) {
      node.fx = p.x;
      node.fy = p.y;
    }
  };
  const onNodePointerUp = (e: React.PointerEvent, id: string) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== id) return;
    try {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      /* release is best-effort */
    }
    const node = simNode(id);
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    // release it back to physics and give a soft reheat so it floats home
    // gentle release reheat — settles the dropped node back without an oscillating bounce
    simRef.current?.alphaTarget(0).alpha(0.14).restart();
    if (drag.moved) suppressClickRef.current = true;
    dragRef.current = null;
  };

  // ── the graph itself (reused inline + fullscreen) ───────────────────────────
  const graphInner = (
    <>
      <div className="kg-grid pointer-events-none absolute inset-0" aria-hidden />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-full w-full"
        role="img"
        aria-label="Operating knowledge graph"
        onClick={clearAll}
      >
        {/* orbital rings — faint, slowly-rotating backdrop (memoized; static) */}
        {orbitalRings}

        {/* Unfocused: a faint concentric web. Tool-use edges (the bulk) sit very
            low so the org skeleton reads cleanly; hovering lights a pillar up.
            Inside the expanded memory core the org web recedes almost entirely —
            except the pillar spokes, which become colored pathways out of the
            memory into each department segment. */}
        {(
          <g className={exitTree ? 'kg-web-in' : undefined}>
          {links.map((l, i) => {
            const s = typeof l.source === 'object' ? l.source : posById.get(l.source);
            const t = typeof l.target === 'object' ? l.target : posById.get(l.target);
            if (!s || !t) return null;
            // while a pillar is focused the background web disappears with its
            // nodes — the tree draws its own limbs, the flanks are gateways
            // only. Drawing a whisper web behind the stage read as clutter.
            if (focusTree) return null;
            const pathway = coreExpanded && l.kind === 'pillar';
            if (coreExpanded && !pathway) {
              return (
                <path key={i} d={edgeArc(s, t)} fill="none" stroke={EDGE_COLOR[l.kind] ?? 'var(--dim)'} strokeWidth={0.9} strokeLinecap="round" opacity={0.02} style={{ transition: 'opacity 0.4s' }} />
              );
            }
            if (pathway) {
              const teamColor = byId.get(t.id)?.color ?? 'var(--text)';
              return (
                <path key={i} d={edgeArc(s, t)} fill="none" stroke={teamColor} strokeWidth={2.2} strokeLinecap="round" opacity={0.75} className="kg-ray" style={{ transition: 'opacity 0.4s' }} />
              );
            }
            // de-noised web: every edge wears its pillar's color at a whisper
            // (0.08); hovering a node raises ITS incident edges to 0.6, keeps
            // the rest of the lit chain readable, and drops everything else
            const team = byId.get(teamForFocus(s.id) ?? teamForFocus(t.id) ?? '');
            const tint = team?.color ?? EDGE_COLOR[l.kind] ?? 'var(--dim)';
            const incident = hoverId !== null && (s.id === hoverId || t.id === hoverId);
            const onChain = !lit || (lit.has(s.id) && lit.has(t.id));
            return (
              <path
                key={i}
                d={edgeArc(s, t)}
                fill="none"
                stroke={tint}
                strokeWidth={incident ? 1.6 : onChain && lit ? 1.2 : 0.9}
                strokeLinecap="round"
                opacity={lit ? (incident ? 0.6 : onChain ? 0.35 : 0.04) : 0.08}
              />
            );
          })}
          </g>
        )}

        {/* communication pulses — dots shuttling between the memory core and
            each department head (positions written by the camera rAF) */}
        {!focusTree && memoryOn && (
          <g style={{ pointerEvents: 'none' }}>
            {commTeams.map((t) => (
              <g key={t.id}>
                <circle ref={setCommRef(`${t.id}:out`)} r={2} fill={HUB_COLOR} opacity={0} transform="translate(-999,-999)" />
                <circle ref={setCommRef(`${t.id}:in`)} r={2.3} fill={t.color} opacity={0} transform="translate(-999,-999)" />
              </g>
            ))}
          </g>
        )}

        {/* Exiting tree — the skeleton rides the nodes home while fading out,
            so closing a department never detaches or pops. */}
        {!focusTree && exitTree && (
          <g className="kg-tree-exit" style={{ pointerEvents: 'none' }}>
            {exitTree.branches.map((b, i) => {
              const s = posById.get(b.source);
              const t = posById.get(b.target);
              if (!s || !t) return null;
              const stroke =
                b.depth === 4 ? 'var(--brain-2)'
                : b.depth === 3 ? (byId.get(b.target)?.kind === 'person' ? 'var(--warn)' : 'var(--accent)')
                : b.depth === 2 ? 'var(--accent)'
                : 'var(--text)';
              return (
                <path key={i} d={branchPath(s, t)} fill="none" stroke={stroke} strokeWidth={branchWidth(b.depth)} strokeLinecap="round" />
              );
            })}
          </g>
        )}

        {/* Focused: the department grown as an organic tree — curved, tapered
            branches with a dept-tinted glow, an energy pulse, and popping
            leaves. Keyed by department so the growth replays on each switch. */}
        {focusTree && (
          <g key={focusTeamId ?? 'focus'} style={{ pointerEvents: 'none' }}>
            <defs>
              {/* Soft circular dept glow. A CIRCLE (not a viewport rect): the
                  camera pans while the glow lives in graph space, so a rect's
                  own edges would drift into view as hard right angles. A radial
                  fill that reaches 0 opacity exactly at the circle's rim has no
                  corners to show, from any camera position, for every dept. */}
              <radialGradient id="kg-glow">
                <stop offset="0%" stopColor={focusedTeam?.color ?? 'var(--accent)'} stopOpacity={0.18} />
                <stop offset="55%" stopColor={focusedTeam?.color ?? 'var(--accent)'} stopOpacity={0.06} />
                <stop offset="100%" stopColor={focusedTeam?.color ?? 'var(--accent)'} stopOpacity={0} />
              </radialGradient>
            </defs>
            <circle cx={W / 2} cy={H * 0.52} r={W * 0.56} fill="url(#kg-glow)" className="kg-glow" />

            {/* shared-tool "also uses" vines — faint straight lines */}
            {focusTree.extraLinks.map((l, i) => {
              const s = posById.get(l.source);
              const t = posById.get(l.target);
              if (!s || !t) return null;
              return <line key={`vine-${i}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="var(--brain-2)" strokeWidth={0.8} opacity={0.26} />;
            })}

            {/* branches by depth:
                · self → department = solid trunk (grows in)
                · department → task = animated dotted line (work flows dept→task)
                · task → worker     = short solid hop, tinted human/AI
                · worker → tool     = straight solid line */}
            {focusTree.branches.map((b, i) => {
              const s = posById.get(b.source);
              const t = posById.get(b.target);
              if (!s || !t) return null;
              const d = branchPath(s, t);
              if (b.depth === 4) {
                return (
                  <path key={`br-${i}`} d={d} fill="none" stroke="var(--brain-2)" strokeWidth={branchWidth(4)} strokeLinecap="round" className="kg-fade" />
                );
              }
              if (b.depth === 3) {
                const workerColor = byId.get(b.target)?.kind === 'person' ? 'var(--warn)' : 'var(--accent)';
                return (
                  <path key={`br-${i}`} d={d} fill="none" stroke={workerColor} strokeWidth={branchWidth(3)} strokeLinecap="round" className="kg-fade" />
                );
              }
              if (b.depth === 2) {
                return (
                  <path key={`br-${i}`} d={d} fill="none" stroke="var(--accent)" strokeWidth={branchWidth(2)} strokeLinecap="round" className="kg-dash" />
                );
              }
              return (
                <path key={`br-${i}`} d={d} fill="none" stroke="var(--text)" strokeWidth={branchWidth(1)} strokeLinecap="round" pathLength={1} className="kg-grow" />
              );
            })}

            {/* leaf halos — a soft ring pops in above each tool */}
            {focusTree.branches
              .filter((b) => b.depth === 4)
              .map((b, i) => {
                const t = posById.get(b.target);
                if (!t) return null;
                return (
                  <circle key={`leaf-${i}`} cx={t.x} cy={t.y} r={CAT.tool.r + 5} fill="none" stroke="var(--brain-2)" strokeWidth={1} className="kg-leaf" style={{ animationDelay: `${0.3 + i * 0.06}s` }} />
                );
              })}
          </g>
        )}

        {/* the flank departments ride the rim ALREADY EXPANDED (Alex): their
            limbs draw faint from the live gliding nodes, so each tilted tree
            reads as a whole department mounted on the huge wheel */}
        {focusTree && flankTeams && (
          <g opacity={0.22} style={{ pointerEvents: 'none' }}>
            {[...flankTeams].map((teamId) =>
              (allTrees.get(teamId)?.branches ?? []).map((b, i) => {
                // the shared trunk base (self) belongs to the apex tree only
                if (b.source === SELF_ID || b.target === SELF_ID) return null;
                const s = posById.get(b.source);
                const t = posById.get(b.target);
                if (!s || !t) return null;
                return (
                  <path
                    key={`fl-${teamId}-${i}`}
                    d={branchPath(s, t)}
                    fill="none"
                    stroke={byId.get(teamId)?.color ?? 'var(--text-3)'}
                    strokeWidth={branchWidth(b.depth) * 0.8}
                    strokeLinecap="round"
                  />
                );
              }),
            )}
          </g>
        )}

        {nodes.map((n) => {
          const cat = CAT[n.kind];
          const color = nodeColor(n);
          // inside the memory only Alex + the pillar gateways stay visible
          const dim = coreExpanded
            ? n.kind !== 'self' && n.kind !== 'team'
            : lit
              ? !lit.has(n.id)
              : false;
          const inFocus = focusSet?.has(n.id) ?? false;
          const selected = selectedAgentId === n.id || selectedToolId === n.id || selectedTaskId === n.id || selectedHumanId === n.id;
          const showLabel = n.kind === 'self' || n.kind === 'team' || inFocus || (hoverId ? (lit?.has(n.id) ?? false) : false);
          const Icon = cat.Icon;
          // tier radius + a connection-count bump for workers and tools, so
          // heavily-wired nodes read heavier at a glance
          const degree = (adjacency.get(n.id)?.size ?? 1) - 1;
          const r = cat.r + (isWorker(n.kind) || n.kind === 'tool' ? Math.min(2.5, degree * 0.3) : 0);
          // hierarchy brightness at rest; dimmed nodes drop to 0.15 on hover,
          // in focus, ONLY the flanking pillar gateways stay visible beside
          // the tree (Alex: nothing behind the pillar I'm looking at) —
          // every other unfocused node rides the carousel fully hidden
          // flanks show a PORTION of their department (Alex): the gateway
          // reads at 0.6, its condensed cluster at a whisper — transparent so
          // it never overbears the stage; everything further is fully hidden
          const sectorTeam = n.kind === 'team' ? n.id : teamForFocus(n.id);
          const inFlankSector = !!(sectorTeam && flankTeams?.has(sectorTeam));
          const isFlank = !!flankTeams?.has(n.id);
          const hidden = !!(dim && !coreExpanded && focusSet && !inFlankSector);
          const nodeOpacity = dim
            ? coreExpanded
              ? 0.06
              : focusSet
                ? isFlank
                  ? 0.6
                  : inFlankSector
                    ? 0.2
                    : 0
                : 0.15
            : TIER_OPACITY[n.kind];

          // Alex rendered as his memory: the Notes constellation of real
          // brain-store notes, folder-tinted, wikilinks as hairlines. Collapsed
          // it's one Alex-sized click target; expanded (camera dived in) the
          // individual notes become readable and clickable.
          if (n.kind === 'self' && memoryOn) {
            return (
              <g
                key={n.id}
                ref={coreGRef}
                transform={`translate(${n.x},${n.y})`}
                opacity={dim ? 0.15 : 1}
                style={{ cursor: dragRef.current?.id === n.id ? 'grabbing' : 'grab', transition: 'opacity 0.25s' }}
                onMouseEnter={() => {
                  setHoverId(n.id);
                  coreGRef.current?.classList.add('kg-stirring');
                }}
                onMouseLeave={() => {
                  setHoverId((h) => (h === n.id ? null : h));
                  coreGRef.current?.classList.remove('kg-stirring');
                }}
                onPointerDown={(e) => onNodePointerDown(e, n.id)}
                onPointerMove={(e) => onNodePointerMove(e, n.id)}
                onPointerUp={(e) => onNodePointerUp(e, n.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  onNodeClick(n);
                }}
              >
                <title>Notes: all of Alex&apos;s markdown, click to open the graph</title>
                {memoryCoreInner}
                {/* synapse sparks — positions written from the camera rAF */}
                <g
                  style={{
                    transform: `scale(${coreScale})`,
                    transition: `transform ${coreExpanded ? 900 : 450}ms cubic-bezier(0.22, 1, 0.36, 1)`,
                    pointerEvents: 'none',
                  }}
                >
                  <g ref={synapseRotGRef} transform={`rotate(${(memRotRef.current * 180) / Math.PI})`}>
                    {Array.from({ length: SYNAPSE_N }, (_, i) => (
                      <circle
                        key={i}
                        ref={(el) => {
                          sparkRefs.current[i] = el;
                        }}
                        r={0.8}
                        fill={SYNAPSE_COLOR}
                        opacity={0}
                      />
                    ))}
                  </g>
                </g>
                {/* hover/selection overlay — a handful of elements OUTSIDE the
                    memo, so pointing at notes never rebuilds the field */}
                {(memHoverId || selectedMemoryId || memHits.length > 0) && (
                  <g
                    style={{
                      transform: `scale(${coreScale})`,
                      transition: `transform ${coreExpanded ? 900 : 450}ms cubic-bezier(0.22, 1, 0.36, 1)`,
                      pointerEvents: 'none',
                    }}
                  >
                    {/* search scrim: the field dims, the hits punch through */}
                    {memHits.length > 0 && (
                      <circle r={R_CORE + 10} fill="var(--bg)" opacity={0.55} />
                    )}
                    {/* rides the same rotation as the field (set from the rAF)
                        so rings and labels stay pinned to their notes */}
                    <g ref={memOverlayGRef} transform={`rotate(${(memRotRef.current * 180) / Math.PI})`}>
                    {/* search hits: bright clickable markers over the scrim */}
                    {memHits.map((m) => {
                      const p = memLayout.get(m.id);
                      if (!p) return null;
                      const mr = memNodeR(m);
                      return (
                        <g
                          key={`hit-${m.id}`}
                          transform={`translate(${p.x},${p.y})`}
                          style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                          onPointerDown={(e) => e.stopPropagation()}
                          onPointerUp={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            clearDetail();
                            setSelectedMemoryId(m.id);
                          }}
                        >
                          <title>{`${m.label} · memory`}</title>
                          <circle r={Math.max(4, mr + 3)} fill="transparent" />
                          <polygon points={hexPts(mr + 0.4)} fill={memColor(m)} />
                          <circle r={mr + 1.6} fill="none" stroke="#ffffff" strokeWidth={0.5} opacity={0.9} />
                          <g className="kg-mem-upright" transform={`rotate(${(-memRotRef.current * 180) / Math.PI})`}>
                            <text
                              y={mr + 4}
                              textAnchor="middle"
                              fontFamily="var(--font-mono)"
                              fontWeight={500}
                              fill="var(--text-2)"
                              style={fixedLabel(9, coreScale)}
                            >
                              {m.label.length > 22 ? `${m.label.slice(0, 20).trimEnd()}…` : m.label}
                            </text>
                          </g>
                        </g>
                      );
                    })}
                    {/* Notes hover: the pointed-at note lights its direct
                        neighbors and the links to them */}
                    {memHoverId && (() => {
                      const hp = memLayout.get(memHoverId);
                      if (!hp) return null;
                      // a pair can share a wikilink AND a similar edge — dedupe
                      return [...new Set(memAdj.get(memHoverId) ?? [])].slice(0, 14).map((nid) => {
                        const np = memLayout.get(nid);
                        const nm = memById.get(nid);
                        if (!np || !nm) return null;
                        return (
                          <g key={nid}>
                            <line x1={hp.x} y1={hp.y} x2={np.x} y2={np.y} stroke="#ffffff" strokeWidth={0.4} opacity={0.5} />
                            <circle cx={np.x} cy={np.y} r={memNodeR(nm) + 1} fill="none" stroke="#ffffff" strokeWidth={0.4} opacity={0.7} />
                          </g>
                        );
                      });
                    })()}
                    {[...new Set([selectedMemoryId, memHoverId].filter((x): x is string => !!x))].map((id) => {
                      const m = memById.get(id);
                      const p = memLayout.get(id);
                      if (!m || !p) return null;
                      const mr = memNodeR(m);
                      const isSel = selectedMemoryId === id;
                      return (
                        <g key={id} transform={`translate(${p.x},${p.y})`}>
                          <circle r={mr + 1.4} fill="none" stroke="#ffffff" strokeWidth={isSel ? 0.9 : 0.55} opacity={0.95} />
                          <g className="kg-mem-upright" transform={`rotate(${(-memRotRef.current * 180) / Math.PI})`}>
                            <text
                              y={mr + 4}
                              textAnchor="middle"
                              fontFamily="var(--font-mono)"
                              fontWeight={500}
                              fill="var(--text-2)"
                              style={fixedLabel(9.5, coreScale)}
                            >
                              {m.label.length > 24 ? `${m.label.slice(0, 22).trimEnd()}…` : m.label}
                            </text>
                          </g>
                        </g>
                      );
                    })}
                    </g>
                  </g>
                )}
              </g>
            );
          }

          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              opacity={nodeOpacity}
              style={{
                cursor: dragRef.current?.id === n.id ? 'grabbing' : 'grab',
                transition: 'opacity 0.25s',
                // fully hidden carousel nodes must not swallow clicks meant
                // for the flank pillars they're stacked beneath
                pointerEvents: hidden ? 'none' : undefined,
              }}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId((h) => (h === n.id ? null : h))}
              onPointerDown={(e) => onNodePointerDown(e, n.id)}
              onPointerMove={(e) => onNodePointerMove(e, n.id)}
              onPointerUp={(e) => onNodePointerUp(e, n.id)}
              onClick={(e) => {
                e.stopPropagation();
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                onNodeClick(n);
              }}
            >
              <title>{n.label}</title>
              {/* selection echoes the vault's orange — one visual language
                  between the core and the outlined outer nodes */}
              {selected && <circle r={r + 3.5} fill="none" stroke={HUB_COLOR} strokeWidth={1} opacity={0.4} />}
              <circle r={r} fill={n.kind === 'self' ? color : 'var(--surface)'} stroke={color} strokeWidth={selected || hoverId === n.id ? 2.5 : 1.5} />
              <g style={{ color: n.kind === 'self' ? 'var(--bg)' : color }}>
                <Icon x={-r * 0.62} y={-r * 0.62} width={r * 1.24} height={r * 1.24} strokeWidth={2} />
              </g>
              {showLabel && (
                <text
                  x={0}
                  y={r + 11 + (labelDy.get(n.id) ?? 0)}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontWeight={n.kind === 'self' || n.kind === 'team' ? 600 : 400}
                  fill={n.kind === 'team' ? color : 'var(--text-2)'}
                  style={fixedLabel(n.kind === 'self' || n.kind === 'team' ? 10 : n.kind === 'task' ? 8.5 : 9)}
                >
                  {shortLabel(n)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </>
  );

  const gridStyle = (
    <style
      dangerouslySetInnerHTML={{
        __html: `
@keyframes kg-drift { from { background-position: 0 0; } to { background-position: 44px 44px; } }
.kg-grid {
  background-image:
    linear-gradient(to right, var(--border-strong) 1px, transparent 1px),
    linear-gradient(to bottom, var(--border-strong) 1px, transparent 1px);
  background-size: 44px 44px;
  opacity: 0.4;
  animation: kg-drift 26s linear infinite;
}

/* Focused-tree growth + life */
@keyframes kg-grow { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes kg-dash-move { to { stroke-dashoffset: -8.5; } }
@keyframes kg-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes kg-leaf-in { from { opacity: 0; transform: scale(0.2); } to { opacity: 0.55; transform: scale(1); } }
@keyframes kg-glow-in { from { opacity: 0; } to { opacity: 1; } }
.kg-grow { stroke-dasharray: 1; stroke-dashoffset: 1; animation: kg-grow 1.1s ease forwards; }
.kg-dash { stroke-dasharray: 1.5 7; stroke-dashoffset: 0; animation: kg-dash-move 1s linear infinite; }
/* pathway rays out of the memory core — denser dashes, slow outward flow */
@keyframes kg-ray-move { to { stroke-dashoffset: -10; } }
.kg-ray { stroke-dasharray: 5 5; stroke-dashoffset: 0; animation: kg-ray-move 1.6s linear infinite; }
/* memory notes wander slowly amongst each other (per-layer amplitude/phase) */
@keyframes kg-note-drift { from { transform: translate(0, 0); } to { transform: translate(var(--kg-ddx, 0px), var(--kg-ddy, 0px)); } }
/* luminescent breathing — the field's light swells and settles */
@keyframes kg-breathe { from { opacity: 0.62; } to { opacity: 1; } }
/* the wash of light behind the field breathes on its own slow cycle */
@keyframes kg-glow-breathe { from { opacity: 0.036; } to { opacity: 0.108; } }
.kg-core-glow { opacity: 0.06; animation: kg-glow-breathe 7s ease-in-out infinite alternate; }
/* hover-stir: paused by default, wakes while the mouse is over the core */
@keyframes kg-stir { from { transform: translate(0, 0); } to { transform: translate(var(--kg-sdx, 0px), var(--kg-sdy, 0px)); } }
.kg-mem-stir { animation-play-state: paused !important; }
.kg-stirring .kg-mem-stir { animation-play-state: running !important; }
/* while the memory is open the field holds still (breathing only) so the
   hover/selection overlay stays pixel-aligned with the notes */
.kg-core-open .kg-mem-layer { animation: kg-breathe 9s ease-in-out infinite alternate !important; }
.kg-core-open .kg-mem-stir { animation: none !important; }
/* opening/closing the vault: every core animation pauses so the whole frame
   budget goes to the zoom itself (class applied for ~1.2s from the component) */
.kg-transitioning .kg-mem-layer, .kg-transitioning .kg-mem-stir, .kg-transitioning .kg-core-glow { animation-play-state: paused !important; }
/* while the camera flies, trade anti-aliasing for raster speed — invisible in
   motion, and crispness returns the moment the viewBox stops moving */
.kg-fast-raster, .kg-fast-raster * { shape-rendering: optimizeSpeed; }
/* the deeper tier of notes fades in when the memory opens */
@keyframes kg-mem-in { from { opacity: 0; } to { opacity: 1; } }
.kg-mem-in { animation: kg-mem-in 600ms ease 150ms both; }
/* closing a tree: the skeleton fades while riding the nodes home, and the
   resting web fades back in — one continuous shot, no detach */
@keyframes kg-exit-fade { from { opacity: 0.9; } to { opacity: 0; } }
.kg-tree-exit { animation: kg-exit-fade 240ms ease forwards; }
@keyframes kg-web-fade-in { from { opacity: 0; } to { opacity: 1; } }
.kg-web-in { animation: kg-web-fade-in 320ms ease both; }
.kg-fade { opacity: 0; animation: kg-fade-in 0.7s ease 0.25s forwards; }
.kg-leaf { transform-box: fill-box; transform-origin: center; opacity: 0; animation: kg-leaf-in 0.6s ease 0.2s forwards; }
.kg-glow { opacity: 0; animation: kg-glow-in 0.9s ease forwards; }

/* detail cards glide in with the camera instead of popping */
@keyframes kg-panel-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.kg-panel { animation: kg-panel-in 340ms cubic-bezier(0.22, 1, 0.36, 1); }

@media (prefers-reduced-motion: reduce) {
  .kg-grid { animation: none; }
  .kg-grow, .kg-dash, .kg-ray, .kg-fade, .kg-leaf, .kg-glow, .kg-panel, .kg-web-in { animation: none; }
  .kg-mem-layer, .kg-mem-stir, .kg-core-glow, .kg-mem-in { animation: none !important; }
  .kg-mem-in { opacity: 1; }
  .kg-tree-exit { display: none; }
  .kg-grow { stroke-dashoffset: 0; }
  .kg-fade { opacity: 1; }
  .kg-leaf { opacity: 0.55; transform: none; }
  .kg-glow { opacity: 1; }
}`,
      }}
    />
  );

  if (fullscreen) {
    return (
      <>
        {gridStyle}
        <KnowledgeGraphFullscreen
          deptList={deptList}
          currentTeamId={focusTeamId}
          currentDept={currentDept}
          toolWiki={toolWiki}
          extraDetail={agentCard ?? taskCard ?? humanCard ?? memoryCard}
          coreOpen={coreExpanded}
          onCollapseCore={clearAll}
          searchSlot={vaultSearchInput}
          legendSlot={compactLegend}
          directorySlot={directoryPanel}
          directoryCollapsed={directoryCollapsed}
          onNavDept={navDept}
          onSelectToolSlug={selectToolSlug}
          onBack={clearDetail}
          onClose={() => setFullscreen(false)}
        >
          {graphInner}
        </KnowledgeGraphFullscreen>
      </>
    );
  }

  return (
    <>
      {gridStyle}
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative h-[680px] min-w-0 flex-1 overflow-hidden rounded-lg-t border border-os-border bg-os-surface">
          {graphInner}

          {/* fullscreen tab — top right (opens straight into the dept wheel) */}
          <button
            onClick={() => {
              if (!focusTeamId && deptList[0]) navDept(deptList[0].teamId);
              setFullscreen(true);
            }}
            title="Open the department wheel"
            className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-sm-t border border-os-border-strong bg-os-bg/80 px-2 py-1 font-mono text-[10.5px] text-os-muted backdrop-blur transition-colors hover:text-os-accent"
          >
            <Maximize2 className="h-3.5 w-3.5" /> Fullscreen
          </button>

          {/* top-left navigation: ← Back to the home view whenever we've gone
              anywhere (a dept tree or inside the memory), plus the department
              switcher while a tree is focused. */}
          {(focusSet || coreExpanded) && (
            <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
              <button
                onClick={clearAll}
                aria-label="Back to the home view"
                title="Back to the home view"
                className="flex items-center gap-1.5 rounded-sm-t border border-os-border-strong bg-os-bg/85 px-2 py-1.5 font-mono text-[10.5px] text-os-muted backdrop-blur transition-colors hover:text-os-accent"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              {vaultSearchInput}
              {focusSet && (
                <div className="flex items-center gap-0.5 rounded-sm-t border border-os-border-strong bg-os-bg/85 px-1 py-1 backdrop-blur">
                  <button
                    onClick={() => stepDept(-1)}
                    aria-label="Previous department"
                    title="Previous department"
                    className="flex h-6 w-6 items-center justify-center rounded-sm-t text-os-dim transition-colors hover:text-os-text"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => stepDept(1)}
                    aria-label="Next department"
                    title="Next department"
                    className="flex h-6 w-6 items-center justify-center rounded-sm-t text-os-dim transition-colors hover:text-os-text"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <span className="max-w-[120px] truncate px-1.5 font-mono text-[11px] font-semibold" style={{ color: focusedTeam?.color ?? 'var(--text)' }}>
                    {focusedTeam?.label}
                  </span>
                  <button
                    onClick={clearAll}
                    aria-label="Close focus"
                    title="Back to all"
                    className="flex h-6 w-6 items-center justify-center rounded-sm-t border-l border-os-border text-os-dim transition-colors hover:text-os-err"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* side paddles: turn the wheel without reaching for the top bar —
              vertically centered on the canvas edges while a pillar is focused;
              the right paddle steps aside when the detail card is open */}
          {focusSet && !coreExpanded && (
            <>
              <button
                onClick={() => stepDept(-1)}
                aria-label="Turn to the previous pillar"
                title="Previous pillar (←)"
                className="absolute left-2 top-1/2 z-10 flex h-28 w-11 -translate-y-1/2 items-center justify-center rounded-sm-t border border-transparent bg-transparent text-os-muted transition-colors hover:border-os-border hover:bg-os-bg/70 hover:text-os-text hover:backdrop-blur"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={() => stepDept(1)}
                aria-label="Turn to the next pillar"
                title="Next pillar (→)"
                className="absolute right-2 top-1/2 z-10 flex h-28 w-11 -translate-y-1/2 items-center justify-center rounded-sm-t border border-transparent bg-transparent text-os-muted transition-colors hover:border-os-border hover:bg-os-bg/70 hover:text-os-text hover:backdrop-blur"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          {/* inline detail overlay — agent, tool, SOP task, human, memory note,
              or the Clients roster. The trail bar walks you back UP: node →
              pillar (this button) → home (the pillar bar's Back). */}
          {(agentCard || toolWiki || taskCard || humanCard || memoryCard) && (
            <div className="kg-panel absolute right-3 top-[46px] z-10 flex max-h-[calc(100%-58px)] w-[300px] flex-col overflow-hidden rounded-lg-t border border-os-border-strong bg-os-bg/95 backdrop-blur">
              <button
                onClick={clearDetail}
                aria-label={`Back to the ${focusedTeam?.label ?? 'graph'} pillar`}
                className="flex shrink-0 items-center gap-1.5 border-b border-os-border px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-os-dim transition-colors hover:text-os-text"
              >
                <ArrowLeft className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  Back · <span style={{ color: focusedTeam?.color ?? 'var(--text)' }}>{focusedTeam?.label ?? 'graph'}</span>
                </span>
              </button>
              {toolWiki ? (
                <ToolDetailCard wiki={toolWiki} onClose={() => setSelectedToolId(null)} />
              ) : (
                agentCard ?? taskCard ?? humanCard ?? memoryCard
              )}
            </div>
          )}
        </div>

        {/* sidebar: legend + the always-visible directory (the physics editor
            retired in its favor) — compact so the graph dominates */}
        <aside className={`flex max-h-[560px] shrink-0 flex-col gap-3.5 rounded-lg-t border border-os-border bg-os-surface p-3 lg:h-[680px] lg:max-h-none ${directoryCollapsed ? 'w-auto lg:w-16' : 'w-full lg:w-72'}`}>
          <div className={directoryCollapsed ? 'hidden' : undefined}>
            <div className="mb-1.5 flex items-baseline justify-between font-mono text-[9px] uppercase tracking-[0.16em] text-os-dim">
              <span>Lens</span>
              {lensId && (
                <button onClick={() => setLensId(null)} className="text-os-dim transition-colors hover:text-os-err">
                  clear · {lensLit?.size ?? 0} lit
                </button>
              )}
            </div>
            <div className="mb-3 flex flex-col gap-1">
              {(
                [
                  ['Entity', ENTITY_LENSES],
                  ['Function', FUNCTION_LENSES],
                  ['Action', ACTION_LENSES],
                ] as [string, Lens[]][]
              ).map(([groupLabel, lenses]) => (
                <select
                  key={groupLabel}
                  value={lenses.some((l) => l.id === lensId) ? lensId! : ''}
                  onChange={(e) => setLensId(e.target.value || null)}
                  aria-label={`${groupLabel} lens`}
                  className="w-full rounded-sm-t border border-os-border bg-os-bg px-1.5 py-1 font-mono text-[10px] text-os-muted focus:border-os-border-strong focus:outline-none"
                >
                  <option value="">{groupLabel} · all</option>
                  {lenses.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              ))}
            </div>

            <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-os-dim">Legend</div>
            <div className="flex flex-col gap-1">
              {LEGEND_KINDS.map((k) => {
                const cat = CAT[k];
                const count = graph.nodes.filter((n) => n.kind === k).length;
                const Icon = cat.Icon;
                return (
                  <div key={k} className="flex items-center gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border" style={{ borderColor: cat.color, color: cat.color }}>
                      <Icon className="h-3 w-3" strokeWidth={2} />
                    </span>
                    <span className="flex-1 text-[11px] font-semibold">{cat.label}</span>
                    <span className="font-mono text-[10px] text-os-dim">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`flex min-h-0 flex-1 flex-col ${directoryCollapsed ? '' : 'border-t border-os-border pt-3'}`}>
            <div className="min-h-0 flex-1">{directoryPanel}</div>
          </div>
        </aside>
      </div>
    </>
  );
}
