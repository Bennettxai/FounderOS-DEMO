import type { BrainGraphEdge, BrainGraphNode } from '@/lib/schemas';

/**
 * The Notes-style memory core at the center of the /brain knowledge graph:
 * Alex rendered as the constellation of his actual brain-store notes.
 *
 * `distillMemoryGraph` shrinks the full BrainGraph (hundreds of pages, 64-dim
 * vectors) into a readable mini constellation — the most-linked notes, their
 * folder hubs, and only the edges that survive — small enough to ship to the
 * client and draw inside the graph's core disc.
 *
 * `cameraRect`/`lerpRect` are the cinematic camera: a pure mapping from what's
 * selected to the SVG viewBox that should frame it, plus the easing step the
 * component runs per animation frame. Pure + deterministic; no React, no DOM.
 */

export type MemoryNode = {
  id: string;
  type: 'folder' | 'page';
  label: string;
  folder: string;
  excerpt: string;
  wordCount: number;
  chunks: number;
  vx: number; // layout coords in the unit disc
  vy: number;
  /** link community (0 = largest); drives the Notes-style cluster color */
  cluster: number;
  /** degree among kept nodes (wikilink + similar); 0 = orphan on the rim halo */
  links: number;
};

export type MemoryEdge = { source: string; target: string; type: BrainGraphEdge['type'] };

export type MemoryGraph = { nodes: MemoryNode[]; edges: MemoryEdge[] };

type BrainGraphSlice = { nodes: BrainGraphNode[]; edges: BrainGraphEdge[] };

// Open-graph density. Deliberately LOW: smoothness beats richness (Alex:
// "remove a lot of the nodes to the point where it's no longer buggy"). Every
// element here repaints on every camera frame while zoomed in fullscreen.
const DEFAULT_MAX_PAGES = 120;

/**
 * Cap the brain graph to its most-linked pages (wikilink degree, then word
 * count, then id — fully deterministic), keep folder hubs that still have a
 * kept member, drop every edge that lost an endpoint, detect the link
 * communities that become the Notes cluster colors, lay the clusters out
 * as organic blobs (orphans ringing the rim), and strip the heavy embedding
 * fields the constellation doesn't draw.
 */
export function distillMemoryGraph(
  graph: BrainGraphSlice,
  opts: { maxPages?: number; centerFolder?: string; centerQuota?: number } = {},
): MemoryGraph {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const centerFolder = opts.centerFolder;
  const centerQuota = Math.min(opts.centerQuota ?? 32, maxPages);

  const degree = new Map<string, number>();
  for (const e of graph.edges) {
    if (e.type !== 'wikilink') continue;
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  const ranked = graph.nodes
    .filter((n) => n.type === 'page')
    .sort(
      (a, b) =>
        (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) ||
        b.wordCount - a.wordCount ||
        a.id.localeCompare(b.id),
    );
  let pages = ranked.slice(0, maxPages);
  // centerFolder quota: the spotlighted folder (Alex: "populate Claude
  // Archive") is guaranteed a slice of the cap even though its notes are
  // weakly wikilinked — the lowest-ranked outsiders make room.
  if (centerFolder) {
    const kept = pages.filter((p) => p.folder === centerFolder).length;
    if (kept < centerQuota) {
      const extras = ranked.filter((p) => p.folder === centerFolder && !pages.includes(p)).slice(0, centerQuota - kept);
      if (extras.length) {
        const keepOthers = pages.filter((p) => p.folder !== centerFolder);
        const roomForOthers = maxPages - kept - extras.length;
        pages = [...keepOthers.slice(0, Math.max(0, roomForOthers)), ...pages.filter((p) => p.folder === centerFolder), ...extras];
      }
    }
  }

  const keptFolders = new Set(pages.map((p) => p.folder));
  const hubs = graph.nodes.filter((n) => n.type === 'folder' && keptFolders.has(n.folder));

  const keptIds = new Set([...hubs, ...pages].map((n) => n.id));
  const edges: MemoryEdge[] = graph.edges
    .filter((e) => keptIds.has(e.source) && keptIds.has(e.target))
    .map((e) => ({ source: e.source, target: e.target, type: e.type }));

  // kept-degree over the content edges (wikilink + similar) — member edges
  // are folder plumbing, not knowledge structure, so they don't rescue a note
  // from the orphan halo.
  const links = new Map<string, number>();
  for (const e of edges) {
    if (e.type === 'member') continue;
    links.set(e.source, (links.get(e.source) ?? 0) + 1);
    links.set(e.target, (links.get(e.target) ?? 0) + 1);
  }
  // hubs anchor their members: count them so a hub sizes like a hub
  for (const e of edges) {
    if (e.type !== 'member') continue;
    links.set(e.source, (links.get(e.source) ?? 0) + 1);
    // the spotlighted folder's membership counts as connection — its notes
    // belong to the centered community, not the orphan rim
    if (centerFolder && e.source === `folder:${centerFolder}`) {
      links.set(e.target, (links.get(e.target) ?? 0) + 1);
    }
  }

  const slim = (n: BrainGraphNode): MemoryNode => ({
    id: n.id,
    type: n.type,
    label: n.label,
    folder: n.folder,
    excerpt: n.excerpt,
    wordCount: n.wordCount,
    chunks: n.chunks,
    vx: n.vx,
    vy: n.vy,
    cluster: 0, // assigned spatially after layout
    links: links.get(n.id) ?? 0,
  });

  let nodes = forceLayout([...hubs, ...pages].map(slim), edges, centerFolder ? `folder:${centerFolder}` : undefined);

  // Cluster labels the LINK COMMUNITIES (size-ranked, biggest = 0). Since the
  // uniform-fill layout took over (the field renders one hard orange), the
  // label is structural metadata, not a color region.
  nodes = assignLinkClusters(nodes, edges);

  // Long-range similarity edges (kNN pairs whose blobs landed far apart) draw
  // an ugly starburst across the disc — drop them; wikilinks always stay.
  const finalPos = new Map(nodes.map((n) => [n.id, n]));
  const keptEdges = edges.filter((e) => {
    if (e.type !== 'similar') return true;
    const a = finalPos.get(e.source);
    const b = finalPos.get(e.target);
    if (!a || !b) return false;
    return Math.hypot(a.vx - b.vx, a.vy - b.vy) <= MAX_SIMILAR_SPAN;
  });

  return { nodes, edges: keptEdges };
}

// Cluster = link community: union-find over every edge type, components
// ranked by size (biggest = 0). Deterministic; orphans stay 0.
function assignLinkClusters(nodes: MemoryNode[], edges: MemoryEdge[]): MemoryNode[] {
  const inner = nodes.filter((n) => !(n.type === 'page' && n.links === 0));
  if (inner.length === 0) return nodes;
  const idx = new Map(inner.map((n, i) => [n.id, i]));
  const parent = inner.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const e of edges) {
    const a = idx.get(e.source);
    const b = idx.get(e.target);
    if (a === undefined || b === undefined) continue;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }
  const sizes = new Map<number, number>();
  for (let i = 0; i < inner.length; i++) {
    const r = find(i);
    sizes.set(r, (sizes.get(r) ?? 0) + 1);
  }
  const ranked = [...sizes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([root]) => root);
  const rankOf = new Map(ranked.map((root, rank) => [root, rank]));
  return nodes.map((n) => {
    const i = idx.get(n.id);
    return { ...n, cluster: i === undefined ? 0 : rankOf.get(find(i)) ?? 0 };
  });
}

// The PCA projection routinely piles many notes onto one spot; the
// constellation must read as an Notes graph, not a smear. A deterministic
// pairwise relaxation seeded by the projection: coincident/near pairs push
// apart (coincident ones split along a golden-angle direction so the result
// is stable), everything stays clamped to the unit disc.
// Force-layout tuning: the graph's SHAPE comes from its links (springs pull
// connected notes together, pairwise separation keeps everything readable) —
// hub-fans, chains and tendrils emerge exactly like a real vault graph.
// Disconnected components get golden-angle anchors so they don't drift off.
const FORCE_ITERS = 260;
const D_MIN = 0.056;
// linked mass reaches past unit 1.0 to hug the drawn disc border (which sits
// at (R_CORE + 10) / R_CORE ≈ 1.19 units) — Alex: notes very close to the
// end of the circle. The orphan halo rings just outside the mass.
const BLOB_FILL = 1.05;
const COMPONENT_RING = 0.6;
const GOLDEN_ANGLE = 2.399963229728653;
// spring rest length + stiffness per edge type: wikilinks bind tight, kNN
// similarity a little looser, folder membership is long and soft (it fans,
// it doesn't collapse)
const SPRING: Record<string, { rest: number; k: number }> = {
  wikilink: { rest: 0.11, k: 0.08 },
  similar: { rest: 0.13, k: 0.05 },
  member: { rest: 0.3, k: 0.015 },
};
// similarity edges longer than this (in unit-disc space) are visual noise
const MAX_SIMILAR_SPAN = 0.5;

const hashId = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};

/**
 * A deterministic mini force-directed layout — the real Notes-vault look:
 * springs over the actual edges give hub-fans, chains and tendrils; pairwise
 * separation keeps it readable; disconnected components anchor at golden-angle
 * spots so nothing drifts away. Orphans (no content links) halo the rim.
 * Pure + deterministic (fixed iteration order, no randomness).
 */
function forceLayout(nodes: MemoryNode[], edges: MemoryEdge[], centerId?: string): MemoryNode[] {
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
  const isOrphan = (n: MemoryNode) => n.type === 'page' && n.links === 0;
  const inner = nodes.filter((n) => !isOrphan(n));
  const orphans = nodes.filter(isOrphan);

  const pos = new Map<string, { x: number; y: number }>();

  if (inner.length > 0) {
    const idx = new Map(inner.map((n, i) => [n.id, i]));
    const pts = inner.map((n) => ({ x: n.vx, y: n.vy }));
    // center + shrink the PCA seed; a golden-angle micro-jitter breaks exact ties
    const cx0 = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy0 = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    pts.forEach((p, i) => {
      p.x = (p.x - cx0) * 0.5 + Math.cos(i * GOLDEN_ANGLE) * 0.01;
      p.y = (p.y - cy0) * 0.5 + Math.sin(i * GOLDEN_ANGLE) * 0.01;
    });

    const springs = edges
      .map((e) => ({ a: idx.get(e.source), b: idx.get(e.target), s: SPRING[e.type] }))
      .filter((e): e is { a: number; b: number; s: { rest: number; k: number } } =>
        e.a !== undefined && e.b !== undefined && !!e.s);

    // connected components (over every edge type) → anchor points
    const parent = inner.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (const e of springs) {
      const ra = find(e.a);
      const rb = find(e.b);
      if (ra !== rb) parent[rb] = ra;
    }
    const compSize = new Map<number, number>();
    for (let i = 0; i < inner.length; i++) {
      const r = find(i);
      compSize.set(r, (compSize.get(r) ?? 0) + 1);
    }
    // rank components by size; the centerId's component (if any) is forced to
    // rank 0 so the spotlighted folder sits in the middle of the disc
    const centerIdx = centerId !== undefined ? idx.get(centerId) : undefined;
    const centerRoot = centerIdx !== undefined ? find(centerIdx) : undefined;
    const ordered = [...compSize.entries()]
      .sort((a, b) => Number(b[0] === centerRoot) - Number(a[0] === centerRoot) || b[1] - a[1] || a[0] - b[0])
      .map(([root]) => root);
    const compRank = new Map(ordered.map((root, rank) => [root, rank]));
    // largest component holds the center; the others space EVENLY around the
    // ring (golden-angle spacing reads lopsided with 2-3 islands — for a
    // symmetric fill two satellites must sit opposite, three at thirds)
    const satCount = Math.max(1, compRank.size - 1);
    const anchor = (i: number) => {
      const rank = compRank.get(find(i))!;
      if (rank === 0) return { x: 0, y: 0 };
      const a = ((rank - 1) / satCount) * 2 * Math.PI + 0.7;
      return { x: COMPONENT_RING * Math.cos(a), y: COMPONENT_RING * Math.sin(a) };
    };
    const compR = (i: number) => D_MIN * Math.sqrt(compSize.get(find(i)) ?? 1) * 0.9;

    for (let it = 0; it < FORCE_ITERS; it++) {
      // springs — the links sculpt the shape
      for (const { a, b, s } of springs) {
        const dx = pts[b].x - pts[a].x;
        const dy = pts[b].y - pts[a].y;
        const d = Math.hypot(dx, dy) || 1e-9;
        const f = (d - s.rest) * s.k * 0.5;
        const ux = dx / d;
        const uy = dy / d;
        pts[a].x += ux * f;
        pts[a].y += uy * f;
        pts[b].x -= ux * f;
        pts[b].y -= uy * f;
      }
      // dead-zone component gravity — keeps each island near its anchor
      for (let i = 0; i < pts.length; i++) {
        const t = anchor(i);
        const dx = t.x - pts[i].x;
        const dy = t.y - pts[i].y;
        const len = Math.hypot(dx, dy);
        const excess = len - compR(i);
        if (excess > 1e-6 && len > 1e-9) {
          pts[i].x += (dx / len) * excess * 0.06;
          pts[i].y += (dy / len) * excess * 0.06;
        }
      }
      // pairwise separation — nothing overlaps, everything stays readable
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          let dx = pts[j].x - pts[i].x;
          let dy = pts[j].y - pts[i].y;
          let d = Math.hypot(dx, dy);
          if (d >= D_MIN) continue;
          const push = (D_MIN - d) / 2;
          if (d < 1e-9) {
            const a = (i * pts.length + j) * GOLDEN_ANGLE;
            dx = Math.cos(a);
            dy = Math.sin(a);
            d = 1;
          }
          pts[i].x -= (dx / d) * push;
          pts[i].y -= (dy / d) * push;
          pts[j].x += (dx / d) * push;
          pts[j].y += (dy / d) * push;
        }
      }
      for (const p of pts) {
        const len = Math.hypot(p.x, p.y);
        if (len > BLOB_FILL) {
          p.x *= BLOB_FILL / len;
          p.y *= BLOB_FILL / len;
        }
      }
    }
    // settle centered on the CENTER OF MASS, scaled to the fill radius —
    // bounding-box centering leaves a dense blob lopsided against a sparse
    // arm ("some on the left and some in the middle"); mass-centering fills
    // the disc symmetrically
    const bx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const by = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    for (const p of pts) {
      p.x -= bx;
      p.y -= by;
    }
    // the spotlighted component shrinks toward the middle BEFORE the
    // redistribution below, so its notes take the innermost ranks and fill
    // the center region evenly (never as a clump)
    if (centerRoot !== undefined) {
      for (let i = 0; i < pts.length; i++) {
        if (find(i) !== centerRoot) continue;
        pts[i].x *= 0.5;
        pts[i].y *= 0.5;
      }
    }
    // AREA-UNIFORM radial redistribution — the hard spread guarantee. Springs
    // decide each note's ANGLE and radial ORDER; the radius itself is then
    // reassigned by rank so density is constant across the whole disc:
    // r(rank) = FILL * sqrt(rank / n). A center clump or an empty middle is
    // impossible by construction, and the outermost notes touch the fill rim.
    const order = pts
      .map((p, i) => ({ i, r: Math.hypot(p.x, p.y) }))
      .sort((a, b) => a.r - b.r || a.i - b.i);
    order.forEach(({ i, r }, rank) => {
      const target = BLOB_FILL * Math.sqrt((rank + 0.5) / order.length);
      if (r < 1e-9) {
        const a = i * GOLDEN_ANGLE;
        pts[i].x = target * Math.cos(a);
        pts[i].y = target * Math.sin(a);
      } else {
        pts[i].x = (pts[i].x / r) * target;
        pts[i].y = (pts[i].y / r) * target;
      }
    });
    for (let sweep = 0; sweep < 3; sweep++) {
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          let dx = pts[j].x - pts[i].x;
          let dy = pts[j].y - pts[i].y;
          let d = Math.hypot(dx, dy);
          if (d >= D_MIN) continue;
          const push = (D_MIN - d) / 2;
          if (d < 1e-9) {
            const a = (i * pts.length + j) * GOLDEN_ANGLE;
            dx = Math.cos(a);
            dy = Math.sin(a);
            d = 1;
          }
          pts[i].x -= (dx / d) * push;
          pts[i].y -= (dy / d) * push;
          pts[j].x += (dx / d) * push;
          pts[j].y += (dy / d) * push;
        }
      }
      for (const p of pts) {
        const len = Math.hypot(p.x, p.y);
        if (len > BLOB_FILL) {
          p.x *= BLOB_FILL / len;
          p.y *= BLOB_FILL / len;
        }
      }
    }
    inner.forEach((n, i) => pos.set(n.id, pts[i]));
  }

  // orphan halo — sparse dots around the rim, golden-angle spaced with a
  // hash-jittered radius so the ring reads scattered, not mechanical
  orphans.forEach((n, i) => {
    const a = i * GOLDEN_ANGLE + (hashId(n.id) % 100) / 100;
    const r = 1.08 + ((hashId(n.id) >> 4) % 70) / 1000;
    pos.set(n.id, { x: r * Math.cos(a), y: r * Math.sin(a) });
  });

  return nodes.map((n) => {
    const p = pos.get(n.id) ?? { x: 0, y: 0 };
    return { ...n, vx: r4(p.x), vy: r4(p.y) };
  });
}

/**
 * The mini-Notes subset shown while the core is collapsed: folder hubs
 * always, then linked pages sampled ROUND-ROBIN across 12 angular sectors
 * (best-linked first within each sector) so the mini graph covers the whole
 * disc instead of clumping where the big communities sit, plus every 3rd
 * orphan for the rim halo. The full graph renders once the core is clicked
 * open. Pure + deterministic.
 */
export function pickRestTier(nodes: MemoryNode[], maxPages = 96): MemoryNode[] {
  const hubs = nodes.filter((n) => n.type === 'folder');
  const linked = nodes.filter((n) => n.type === 'page' && n.links > 0);
  const SECTORS = 12;
  const bySector: MemoryNode[][] = Array.from({ length: SECTORS }, () => []);
  for (const n of linked) {
    const a = Math.atan2(n.vy, n.vx);
    bySector[Math.min(SECTORS - 1, Math.floor(((a + Math.PI) / (2 * Math.PI)) * SECTORS))].push(n);
  }
  for (const bucket of bySector) {
    bucket.sort((a, b) => b.links - a.links || b.wordCount - a.wordCount || a.id.localeCompare(b.id));
  }
  const budget = Math.min(maxPages, linked.length);
  const picked: MemoryNode[] = [];
  for (let round = 0; picked.length < budget; round++) {
    let took = false;
    for (const bucket of bySector) {
      if (picked.length >= budget) break;
      const n = bucket[round];
      if (n) {
        picked.push(n);
        took = true;
      }
    }
    if (!took) break;
  }
  const orphans = nodes.filter((n) => n.type === 'page' && n.links === 0).filter((_, i) => i % 3 === 0);
  const keep = new Set([...hubs, ...picked, ...orphans].map((n) => n.id));
  return nodes.filter((n) => keep.has(n.id)); // original order → stable layers
}

/** Where a memory node sits on screen: the core center plus its projection
 * coords scaled onto the constellation disc. */
export function memoryNodePos(
  n: { vx: number; vy: number },
  center: { x: number; y: number },
  radius: number,
): { x: number; y: number } {
  return { x: center.x + n.vx * radius, y: center.y + n.vy * radius };
}

// The constellation disc radius in graph units. The component renders the
// disc at R_CORE + 10 and the rest layout parks the pillar ring outside it —
// tests assert the clearance so they can never overlap.
export const R_CORE = 52;

// ── cinematic camera ─────────────────────────────────────────────────────────

export type Rect = { x: number; y: number; w: number; h: number };
export type ViewSize = { w: number; h: number };

export type CameraState = {
  /** a department tree is focused (frames the whole canvas — the tree fills it) */
  focusedTeam: boolean;
  /** the Alex memory core is expanded */
  coreExpanded: boolean;
  /** live position of the core (the self anchor moves in tree mode) */
  coreCenter: { x: number; y: number };
  /** live position of the selected org node (task / worker / tool), if any */
  selectedNodePos?: { x: number; y: number } | null;
  /** live position of the selected memory note inside the core, if any */
  memorySelectedPos?: { x: number; y: number } | null;
};

// zoom widths as a fraction of the canvas: org-node close-up, core dive,
// memory-note close-up (each keeps the canvas aspect ratio). The core dive
// stays at half-canvas so the constellation breathes and the pillar gateways
// sit clear of the dots.
const ZOOM_NODE = 0.55;
const ZOOM_CORE = 0.5;
const ZOOM_NOTE = 0.22;

const round2 = (n: number): number => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};

/** A `frac`-of-the-canvas rect centered on `c`, clamped fully inside the canvas. */
function frameOn(view: ViewSize, c: { x: number; y: number }, frac: number): Rect {
  const w = view.w * frac;
  const h = w * (view.h / view.w); // keep canvas aspect
  const x = Math.max(0, Math.min(view.w - w, c.x - w / 2));
  const y = Math.max(0, Math.min(view.h - h, c.y - h / 2));
  return { x: round2(x), y: round2(y), w: round2(w), h: round2(h) };
}

/**
 * Where the camera should be for the current selection. Priority runs inside
 * out: a selected memory note beats the core dive, the core dive beats an org
 * selection, an org selection beats the resting/tree full frame.
 */
// the resting/tree frame breathes out a touch beyond the canvas (Alex,
// 2026-07-12: "a bit more zoomed out") — it also reveals the flank trees'
// off-canvas sweep, so the wheel reads bigger than the frame
const ZOOM_OUT_PAD = 0.06;

export function cameraRect(view: ViewSize, s: CameraState): Rect {
  if (s.coreExpanded) {
    if (s.memorySelectedPos) return frameOn(view, s.memorySelectedPos, ZOOM_NOTE);
    return frameOn(view, s.coreCenter, ZOOM_CORE);
  }
  if (s.selectedNodePos) return frameOn(view, s.selectedNodePos, ZOOM_NODE);
  return {
    x: round2(-view.w * ZOOM_OUT_PAD),
    y: round2(-view.h * ZOOM_OUT_PAD),
    w: round2(view.w * (1 + 2 * ZOOM_OUT_PAD)),
    h: round2(view.h * (1 + 2 * ZOOM_OUT_PAD)),
  };
}

/**
 * One easing step toward the target rect. `t` is the per-frame catch-up factor
 * (≈0.1 feels like a camera operator; 1 snaps — the reduced-motion branch).
 * Returns the exact target when close enough so the camera settles instead of
 * asymptoting forever.
 */
export function lerpRect(cur: Rect, target: Rect, t: number): Rect {
  if (t >= 1) return target;
  const done =
    Math.abs(cur.x - target.x) < 0.05 &&
    Math.abs(cur.y - target.y) < 0.05 &&
    Math.abs(cur.w - target.w) < 0.05 &&
    Math.abs(cur.h - target.h) < 0.05;
  if (done) return target;
  return {
    x: cur.x + (target.x - cur.x) * t,
    y: cur.y + (target.y - cur.y) * t,
    w: cur.w + (target.w - cur.w) * t,
    h: cur.h + (target.h - cur.h) * t,
  };
}
