import type { Hierarchy, HierarchyIndex, HItem, HContainer, HAny, HShape, HRelationHit } from './hierarchy';

/**
 * Layout + routing for the Blueprint hierarchy. Pure geometry: no DOM: so
 * the canvas is a thin renderer and the guarantees (no overlapping cards, no
 * trace through a card) are unit-tested. World space is a 24px grid; every
 * container sits centred on one spine x.
 */

export const GRID = 24;
export const SPINE_X = 2400;
export const snap = (v: number) => Math.round(v / GRID) * GRID;

export const SIZES: Record<HShape | 'group', [number, number]> = {
  card: [264, 80],
  compact: [216, 60],
  hero: [400, 108],
  start: [112, 112],
  diamond: [92, 92],
  external: [264, 80],
  group: [312, 84],
};
const CONT_PAD = 32;
const CONT_HEAD = 84;
const CONT_GAP = 96;
const FRAME_PAD = 24;
const FRAME_HEAD = 52;
const EMPTY_FRAME_W = 216; // inner width of a frame that holds nothing yet
const ROW_GAP = 48;
const CELL_X = 16;
const CELL_Y = 14;
const MAX_ROW_W = 2600;

export interface Box {
  id: string;
  it: HAny;
  kind: 'node' | 'frame' | 'container';
  x: number;
  y: number;
  w: number;
  h: number;
  /** a group drawn as its count card */
  collapsed?: boolean;
  rows?: Box[][];
  rowW?: number[];
  rowH?: number[];
  gapx?: number;
  gapy?: number;
}

export interface Layout {
  boxes: Map<string, Box>;
  containers: Box[];
  bounds: { x: number; y: number; w: number; h: number };
}

function measure(it: HItem, expanded: Set<string>): Box {
  if (it.type === 'node') {
    const [w, h] = SIZES[it.shape];
    return { id: it.id, it, w, h, kind: 'node', x: 0, y: 0 };
  }
  if (!expanded.has(it.id)) {
    const [w, h] = SIZES.group;
    return { id: it.id, it, w, h, kind: 'node', collapsed: true, x: 0, y: 0 };
  }
  const byId = new Map(it.children.map((c) => [c.id, c]));
  const explicit = !!it.rows;
  const rows = it.rows
    ? it.rows.map((r) => r.map((id) => byId.get(id)).filter((c): c is HItem => !!c).map((c) => measure(c, expanded)))
    : gridRows(
        it.children.map((c) => measure(c, expanded)),
        it.cols ?? 4,
      );
  const gapx = explicit ? 48 : CELL_X;
  const gapy = explicit ? ROW_GAP : CELL_Y;
  const rowW = rows.map((r) => r.reduce((a, b) => a + b.w, 0) + (r.length - 1) * gapx);
  const rowH = rows.map((r) => Math.max(...r.map((b) => b.h)));
  // A group with no children (a department with no agents yet) still needs a
  // finite box: Math.max() of nothing is -Infinity, and one NaN width poisons
  // every sibling in its row (they all collapse to the origin).
  const w = snap((rowW.length ? Math.max(...rowW) : EMPTY_FRAME_W) + FRAME_PAD * 2);
  const h = snap(FRAME_HEAD + 16 + rowH.reduce((a, b) => a + b, 0) + Math.max(0, rows.length - 1) * gapy + FRAME_PAD);
  return { id: it.id, it, w, h, kind: 'frame', rows, rowW, rowH, gapx, gapy, x: 0, y: 0 };
}

function gridRows<T>(cells: T[], cols: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols));
  return rows;
}

function place(b: Box, x: number, y: number, boxes: Map<string, Box>) {
  b.x = x;
  b.y = y;
  boxes.set(b.id, b);
  if (b.kind !== 'frame' || !b.rows) return;
  let cy = y + FRAME_HEAD + 16;
  const explicit = !!(b.it as { rows?: unknown }).rows;
  b.rows.forEach((row, ri) => {
    let cx = explicit ? x + (b.w - b.rowW![ri]) / 2 : x + FRAME_PAD;
    row.forEach((c) => {
      place(c, explicit ? snap(cx) : Math.round(cx), cy + (explicit ? Math.round((b.rowH![ri] - c.h) / 2) : 0), boxes);
      cx += c.w + b.gapx!;
    });
    cy += b.rowH![ri] + b.gapy!;
  });
}

export function layoutHierarchy(h: Hierarchy, expanded: Set<string>): Layout {
  const boxes = new Map<string, Box>();
  const containers: Box[] = [];
  let y = 120;
  for (const c of h.containers) {
    const rows = c.rows.map((r) => r.map((it) => measure(it, expanded)));
    // wrap wide rows
    const wrapped: Box[][] = [];
    rows.forEach((r) => {
      let cur: Box[] = [];
      let w = 0;
      r.forEach((b) => {
        if (cur.length && w + 48 + b.w > MAX_ROW_W) {
          wrapped.push(cur);
          cur = [];
          w = 0;
        }
        cur.push(b);
        w += (cur.length > 1 ? 48 : 0) + b.w;
      });
      if (cur.length) wrapped.push(cur);
    });
    const isSat = (b: Box) => b.it.type === 'node' && !!b.it.satellite;
    const isDiamond = (b: Box) => b.it.type === 'node' && b.it.shape === 'diamond';
    // diamonds carry their labels below them: a row of several needs air between the labels
    const gapOf = (r: Box[]) => (r.length > 1 && r.every(isDiamond) ? 200 : 48);
    // satellites dock to the right of the row and never shift it off the spine
    const rowW = wrapped.map((r) => {
      const main = r.filter((b) => !isSat(b));
      return main.reduce((a, b) => a + b.w, 0) + (main.length - 1) * gapOf(r);
    });
    const rowExtent = wrapped.map((r, ri) => rowW[ri] / 2 + r.filter(isSat).reduce((a, b) => a + 48 + b.w, 0));
    const rowH = wrapped.map((r) => Math.max(...r.map((b) => b.h)) + (r.some((b) => b.it.type === 'node' && (b.it.shape === 'start' || b.it.shape === 'diamond')) ? 40 : 0));
    const isOp = c.kind === 'operator';
    const w = snap(Math.max(...rowExtent.map((e) => e * 2), ...rowW, 900) + CONT_PAD * 2);
    const head = isOp ? 0 : CONT_HEAD;
    const hh = snap(head + rowH.reduce((a, b) => a + b, 0) + (wrapped.length - 1) * ROW_GAP + CONT_PAD * (isOp ? 1 : 2));
    const box: Box = { id: c.id, it: c, kind: 'container', x: snap(SPINE_X - w / 2), y, w, h: hh, rows: wrapped };
    let cy = y + head + (isOp ? 0 : CONT_PAD);
    wrapped.forEach((r, ri) => {
      const gap = gapOf(r);
      let cx = SPINE_X - rowW[ri] / 2;
      r.forEach((b) => {
        place(b, snap(cx), cy, boxes);
        cx += b.w + (isSat(b) ? 48 : gap);
      });
      cy += rowH[ri] + ROW_GAP;
    });
    boxes.set(c.id, box);
    containers.push(box);
    y += hh + CONT_GAP;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  containers.forEach((b) => {
    minX = Math.min(minX, b.x);
    maxX = Math.max(maxX, b.x + b.w);
  });
  if (!containers.length) {
    minX = SPINE_X - 450;
    maxX = SPINE_X + 450;
  }
  return { boxes, containers, bounds: { x: minX - 120, y: 0, w: maxX - minX + 240, h: y } };
}

// ── geometry ──────────────────────────────────────────────────────────

export interface Pt {
  x: number;
  y: number;
}
export const bc = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h });
export const tc = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y });
export const rc = (b: Box): Pt => ({ x: b.x + b.w, y: b.y + b.h / 2 });
export const lc = (b: Box): Pt => ({ x: b.x, y: b.y + b.h / 2 });

export function roundedPath(pts: Pt[], r = 14): string {
  if (!pts.length) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1];
    const c = pts[i];
    const n = pts[i + 1];
    const d1 = Math.hypot(c.x - p.x, c.y - p.y);
    const d2 = Math.hypot(n.x - c.x, n.y - c.y);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    if (rr < 1) {
      d += ` L ${c.x} ${c.y}`;
      continue;
    }
    const u1 = { x: (c.x - p.x) / d1, y: (c.y - p.y) / d1 };
    const u2 = { x: (n.x - c.x) / d2, y: (n.y - c.y) / d2 };
    d += ` L ${c.x - u1.x * rr} ${c.y - u1.y * rr} Q ${c.x} ${c.y} ${c.x + u2.x * rr} ${c.y + u2.y * rr}`;
  }
  return d + ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
}

/** Midpoint along the longest horizontal segment: where a pill reads best. */
export function midOf(pts: Pt[]): Pt {
  let best: Pt | null = null;
  let bl = -1;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.abs(pts[i].x - pts[i - 1].x);
    if (pts[i].y === pts[i - 1].y && l > bl) {
      bl = l;
      best = { x: (pts[i].x + pts[i - 1].x) / 2, y: pts[i].y };
    }
  }
  if (best) return best;
  const a = pts[0];
  const b = pts[pts.length - 1];
  return { x: (a.x + b.x) / 2 + 70, y: (a.y + b.y) / 2 };
}

/** The drawn stand-in for an id: itself when drawn, else the nearest collapsed ancestor. */
export function rep(layout: Layout, idx: HierarchyIndex, id: string): Box | null {
  if (layout.boxes.has(id)) return layout.boxes.get(id)!;
  for (const p of idx.chain(id).reverse()) if (layout.boxes.has(p)) return layout.boxes.get(p)!;
  return null;
}

export class Router {
  private readonly left: number;
  private readonly right: number;
  constructor(
    private readonly layout: Layout,
    private readonly idx: HierarchyIndex,
  ) {
    this.left = layout.bounds.x + 40;
    this.right = layout.bounds.x + layout.bounds.w - 40;
  }

  /** nearest drawn ancestor that is a frame (expanded group) or container */
  frameOf(id: string): Box | null {
    for (const p of this.idx.chain(id).slice(0, -1).reverse()) {
      const b = this.layout.boxes.get(p);
      if (b && (b.kind === 'frame' || b.kind === 'container')) return b;
    }
    return null;
  }

  /** does a vertical segment at x between y1..y2 cross a drawn card or frame that is not an ancestor of a or b? */
  blockedV(x: number, y1: number, y2: number, a: Box, b: Box): boolean {
    const lo = Math.min(y1, y2) + 1;
    const hi = Math.max(y1, y2) - 1;
    const skip = new Set([...this.idx.chain(a.id), ...this.idx.chain(b.id)]);
    for (const box of this.layout.boxes.values()) {
      if (box.kind === 'container' || skip.has(box.id)) continue;
      if (x > box.x && x < box.x + box.w && hi > box.y && lo < box.y + box.h) return true;
    }
    return false;
  }

  blockedH(y: number, x1: number, x2: number, a: Box, b: Box): boolean {
    const lo = Math.min(x1, x2) + 1;
    const hi = Math.max(x1, x2) - 1;
    const skip = new Set([...this.idx.chain(a.id), ...this.idx.chain(b.id)]);
    for (const box of this.layout.boxes.values()) {
      if (box.kind === 'container' || skip.has(box.id)) continue;
      if (y > box.y && y < box.y + box.h && hi > box.x && lo < box.x + box.w) return true;
    }
    return false;
  }

  /** orthogonal route that never crosses a card: straight, side-to-side, over the row,
   *  through a frame gap, or down a gutter: the first clear candidate wins */
  route(a: Box, b: Box, gutter?: 'left' | 'right'): Pt[] {
    const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
    if (!gutter && overlapY) {
      const right = b.x > a.x;
      const p0 = right ? rc(a) : lc(a);
      const p3 = right ? lc(b) : rc(b);
      if (!this.blockedH(p0.y, p0.x, p3.x, a, b) && Math.abs(p0.y - p3.y) < 2) return [p0, p3];
      const over = Math.min(a.y, b.y) - 12; // hop over the neighbours in the row gap
      const t0 = tc(a);
      const t3 = tc(b);
      return [t0, { x: t0.x, y: over }, { x: t3.x, y: over }, t3];
    }
    const down = b.y >= a.y + a.h;
    const p0 = down ? bc(a) : tc(a);
    const p3 = down ? tc(b) : bc(b);
    const tryJog = (gapY: number): Pt[] | null => {
      if (Math.abs(p0.x - p3.x) < 2) return this.blockedV(p0.x, p0.y, p3.y, a, b) ? null : [p0, p3];
      if (this.blockedV(p0.x, p0.y, gapY, a, b) || this.blockedV(p3.x, gapY, p3.y, a, b) || this.blockedH(gapY, p0.x, p3.x, a, b)) return null;
      return [p0, { x: p0.x, y: gapY }, { x: p3.x, y: gapY }, p3];
    };
    if (!gutter) {
      const fa = this.frameOf(a.id);
      const fb = this.frameOf(b.id);
      const cands = [snap((p0.y + p3.y) / 2)];
      if (fa && fa.kind === 'frame') cands.push(snap(down ? fa.y + fa.h + 24 : fa.y - 24));
      if (fb && fb.kind === 'frame') cands.push(snap(down ? fb.y - 24 : fb.y + fb.h + 24));
      const ca = this.layout.boxes.get(this.idx.containerOf(a.id));
      const cb = this.layout.boxes.get(this.idx.containerOf(b.id));
      if (ca && cb && ca.id !== cb.id) cands.push(snap(down ? (ca.y + ca.h + cb.y) / 2 : (cb.y + cb.h + ca.y) / 2));
      for (const g of cands) {
        const pts = tryJog(g);
        if (pts) return pts;
      }
    }
    // last resort: out to a gutter. Prefer the asked side (or the target's side), but
    // take the other gutter when the first horizontal run would cut through a neighbour.
    const preferred: 'left' | 'right' = gutter ?? (b.x + b.w / 2 < SPINE_X ? 'left' : 'right');
    const sides: Array<'left' | 'right'> = [preferred, preferred === 'left' ? 'right' : 'left'];
    let gx = this.gutterX(preferred);
    for (const side of sides) {
      const g = this.gutterX(side);
      const start = g < a.x ? lc(a) : rc(a);
      if (!this.blockedH(start.y, start.x, g, a, b)) {
        gx = g;
        break;
      }
    }
    const q0 = gx < a.x ? lc(a) : rc(a);
    const q = down ? tc(b) : bc(b);
    // approach through the gap above (below) the target; inside a dense frame that gap is
    // the 14px row seam, so fall back to its midpoint when the 24px offset lands on a card
    let my = down ? q.y - 24 : q.y + 24;
    if (this.blockedH(my, gx, q.x, a, b)) {
      const seam = down ? q.y - 7 : q.y + 7;
      if (!this.blockedH(seam, gx, q.x, a, b)) my = seam;
    }
    return [q0, { x: gx, y: q0.y }, { x: gx, y: my }, { x: q.x, y: my }, q];
  }

  gutterX(side: 'left' | 'right'): number {
    return side === 'left' ? this.left : this.right;
  }
}

// ── drawn edges ───────────────────────────────────────────────────────

export interface DrawnEdge {
  id: string;
  pts: Pt[];
  cls: string;
  label?: string;
  labelAt?: Pt;
  plus: boolean;
  /** a bare horizontal bus line: no ports, no plus */
  bare?: boolean;
  color?: string;
}

/** Structural edges for the current layout: one drawn set per spine entry (id `sp-<i>`). */
export function spineEdges(h: Hierarchy, idx: HierarchyIndex, layout: Layout): DrawnEdge[] {
  const out: DrawnEdge[] = [];
  const router = new Router(layout, idx);
  const pillFor = (pts: Pt[], gx?: number): Pt => (pts.length === 5 && gx !== undefined ? { x: pts[1].x + (pts[1].x < SPINE_X ? 130 : -130), y: (pts[1].y + pts[2].y) / 2 } : midOf(pts));
  h.spine.forEach((e, i) => {
    const a = rep(layout, idx, e.from);
    if (!a) return;
    const id = `sp-${i}`;
    if (e.bus && Array.isArray(e.to)) {
      const targets = e.to.map((t) => rep(layout, idx, t)).filter((t): t is Box => !!t && t.id !== a.id);
      if (!targets.length) return;
      const uniq = [...new Map(targets.map((t) => [t.id, t])).values()];
      const p0 = bc(a);
      const busY = snap(Math.min(...uniq.map((t) => t.y)) - 28);
      const xs = uniq.map((t) => t.x + t.w / 2).concat(p0.x);
      if (e.gutter) {
        const gx = router.gutterX(e.gutter);
        const pr = rc(a);
        out.push({ id, pts: [pr, { x: gx, y: pr.y }, { x: gx, y: busY }, { x: Math.max(...xs), y: busY }], cls: e.kind, plus: false, label: e.label, labelAt: { x: gx + (gx < SPINE_X ? 130 : -130), y: (pr.y + busY) / 2 } });
      } else out.push({ id, pts: [p0, { x: p0.x, y: busY }], cls: e.kind, plus: false, label: e.label, labelAt: { x: p0.x + 90, y: busY } });
      out.push({ id, pts: [{ x: Math.min(...xs), y: busY }, { x: Math.max(...xs), y: busY }], cls: e.kind, plus: false, bare: true });
      uniq.forEach((t) => out.push({ id, pts: [{ x: t.x + t.w / 2, y: busY }, tc(t)], cls: e.kind, plus: true }));
      return;
    }
    const b = rep(layout, idx, e.to as string);
    if (!b || b.id === a.id) return;
    const pts = router.route(a, b, e.gutter);
    out.push({ id, pts, cls: e.kind, plus: true, label: e.label, labelAt: pillFor(pts, e.gutter ? 1 : undefined) });
  });
  return out;
}

export interface FocusResult {
  /** ids that stay sharp: the selection, its chain, its members, every related item and their chains */
  hot: Set<string>;
  edges: DrawnEdge[];
}

/** Focus mode: relations of the selection drawn on the top layer; everything else dims. */
export function focusEdges(idx: HierarchyIndex, layout: Layout, selected: string, rels: HRelationHit[]): FocusResult {
  const hot = new Set<string>(idx.chain(selected));
  const selRep = rep(layout, idx, selected);
  const edges: DrawnEdge[] = [];
  if (!selRep) return { hot, edges };
  const router = new Router(layout, idx);
  const drawn = new Set<string>();
  for (const r of rels) {
    const b = rep(layout, idx, r.other);
    if (!b) continue;
    idx.chain(b.id).forEach((p) => hot.add(p));
    hot.add(r.other);
    if (b.id === selRep.id || idx.chain(selRep.id).includes(b.id) || idx.chain(b.id).includes(selRep.id)) continue;
    const key = `${selRep.id}>${b.id}`;
    if (drawn.has(key)) continue;
    drawn.add(key);
    const pts = r.dir === 'out' ? router.route(selRep, b) : router.route(b, selRep);
    edges.push({ id: `rel-${key}`, pts, cls: 'dyn is-hot', plus: true, label: r.via || r.kind, labelAt: pts.length === 5 ? { x: pts[1].x + (pts[1].x < SPINE_X ? 130 : -130), y: (pts[1].y + pts[2].y) / 2 } : midOf(pts) });
  }
  // members of a selected group / container stay sharp
  idx.descendants(selected).forEach((d) => hot.add(d.id));
  return { hot, edges };
}

// ── camera math ───────────────────────────────────────────────────────

export interface Cam {
  x: number;
  y: number;
  s: number;
}

export function fitAllCam(layout: Layout, w: number, hgt: number): Cam {
  const b = layout.bounds;
  const s = Math.min(w / b.w, hgt / b.h, 1.1);
  return { s, x: (w - b.w * s) / 2 - b.x * s, y: (hgt - b.h * s) / 2 - b.y * s };
}

/** first view: fit the width, anchor the top: the operator and the OS read at a glance */
export function fitTopCam(layout: Layout, w: number): Cam {
  const b = layout.bounds;
  const s = Math.min((w - 40) / b.w, 0.9);
  return { s, x: (w - b.w * s) / 2 - b.x * s, y: 24 - b.y * s };
}

export function flyToCam(box: Box, s: number, w: number, hgt: number): Cam {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const sc = Math.min(s, (w - 80) / box.w, (hgt - 80) / box.h);
  return { s: sc, x: w / 2 - cx * sc, y: hgt / 2 - cy * sc };
}

export function zoomCam(cam: Cam, f: number, px: number, py: number): Cam {
  const s = Math.max(0.12, Math.min(2.2, cam.s * f));
  const k = s / cam.s;
  return { s, x: px - (px - cam.x) * k, y: py - (py - cam.y) * k };
}

export function isContainer(it: HAny): it is HContainer {
  return it.type === 'container';
}
