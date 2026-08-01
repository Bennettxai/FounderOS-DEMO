import { describe, expect, test } from 'vitest';
import {
  cameraRect,
  distillMemoryGraph,
  lerpRect,
  memoryNodePos,
  pickRestTier,
  R_CORE,
  type CameraState,
  type MemoryNode,
  type Rect,
} from '@/lib/memory-core';
import { responsiveRingR } from '@/lib/tree-layout';
import type { BrainGraphEdge, BrainGraphNode } from '@/lib/schemas';

const page = (
  id: string,
  over: Partial<BrainGraphNode> = {},
): BrainGraphNode => ({
  id,
  type: 'page',
  label: id,
  folder: 'ideas',
  kind: 'ideas',
  excerpt: `${id} excerpt`,
  wordCount: 100,
  tags: [],
  agents: [],
  vx: 0.1,
  vy: -0.2,
  vector: [0.5, 0.5],
  chunks: 1,
  ...over,
});

const hub = (folder: string): BrainGraphNode =>
  page(`folder:${folder}`, { type: 'folder', label: folder, folder, excerpt: '', wordCount: 0 });

const wiki = (source: string, target: string): BrainGraphEdge => ({ source, target, type: 'wikilink' });
const member = (source: string, target: string): BrainGraphEdge => ({ source, target, type: 'member' });

describe('distillMemoryGraph', () => {
  test('caps pages at maxPages, keeping the most-linked notes', () => {
    // hubby is linked 3×, loner 0×
    const nodes = [page('hubby'), page('a'), page('b'), page('c'), page('loner'), hub('ideas')];
    const edges = [wiki('a', 'hubby'), wiki('b', 'hubby'), wiki('c', 'hubby'), wiki('a', 'b')];
    const g = distillMemoryGraph({ nodes, edges }, { maxPages: 3 });
    const pageIds = g.nodes.filter((n) => n.type === 'page').map((n) => n.id);
    expect(pageIds).toHaveLength(3);
    expect(pageIds).toContain('hubby');
    expect(pageIds).not.toContain('loner');
  });

  test('breaks degree ties by word count, then id (deterministic ranking)', () => {
    const nodes = [page('long', { wordCount: 900 }), page('short', { wordCount: 10 }), hub('ideas')];
    const g = distillMemoryGraph({ nodes, edges: [] }, { maxPages: 1 });
    expect(g.nodes.filter((n) => n.type === 'page').map((n) => n.id)).toEqual(['long']);
  });

  test('keeps a folder hub only while it still has a kept member page', () => {
    const nodes = [
      page('keep', { folder: 'ideas', kind: 'ideas' }),
      page('drop', { folder: 'inbox', kind: 'inbox', wordCount: 1 }),
      hub('ideas'),
      hub('inbox'),
    ];
    const edges = [member('folder:ideas', 'keep'), member('folder:inbox', 'drop'), wiki('x-nonexistent', 'keep')];
    const g = distillMemoryGraph({ nodes, edges }, { maxPages: 1 });
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toContain('folder:ideas');
    expect(ids).not.toContain('folder:inbox');
  });

  test('keeps only edges whose BOTH endpoints survive', () => {
    const nodes = [page('a'), page('b', { wordCount: 5 }), hub('ideas')];
    const edges = [member('folder:ideas', 'a'), member('folder:ideas', 'b'), wiki('a', 'b')];
    const g = distillMemoryGraph({ nodes, edges }, { maxPages: 1 });
    for (const e of g.edges) {
      const ids = new Set(g.nodes.map((n) => n.id));
      expect(ids.has(e.source), `dangling ${e.source}`).toBe(true);
      expect(ids.has(e.target), `dangling ${e.target}`).toBe(true);
    }
    expect(g.edges).toEqual([member('folder:ideas', 'a')]);
  });

  test('strips the heavy embedding fields and keeps coords inside the drawn disc', () => {
    const g = distillMemoryGraph({ nodes: [page('a', { vx: 0.7, vy: -0.4 })], edges: [] }, { maxPages: 5 });
    const a = g.nodes.find((n) => n.id === 'a')!;
    expect(Number.isFinite(a.vx)).toBe(true);
    // the disc border renders at (R_CORE + 10) / R_CORE ≈ 1.19 units — notes
    // may pass 1.0 (they should hug the border) but never cross it
    expect(Math.hypot(a.vx, a.vy)).toBeLessThanOrEqual(1.16);
    expect(a).not.toHaveProperty('vector');
    expect(a).not.toHaveProperty('agents');
  });

  test('detects link communities: two cliques land in two different clusters', () => {
    const clique = (prefix: string) => Array.from({ length: 6 }, (_, i) => page(`${prefix}${i}`, { vx: 0, vy: 0 }));
    const cliqueEdges = (prefix: string) => {
      const es: BrainGraphEdge[] = [];
      for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) es.push(wiki(`${prefix}${i}`, `${prefix}${j}`));
      return es;
    };
    const g = distillMemoryGraph(
      { nodes: [...clique('a'), ...clique('b')], edges: [...cliqueEdges('a'), ...cliqueEdges('b')] },
      { maxPages: 12 },
    );
    const clusterOf = (id: string) => g.nodes.find((n) => n.id === id)!.cluster;
    const aClusters = new Set(Array.from({ length: 6 }, (_, i) => clusterOf(`a${i}`)));
    const bClusters = new Set(Array.from({ length: 6 }, (_, i) => clusterOf(`b${i}`)));
    expect(aClusters.size).toBe(1);
    expect(bClusters.size).toBe(1);
    expect([...aClusters][0]).not.toBe([...bClusters][0]);
  });

  test('communities stay angularly coherent under the uniform fill', () => {
    // uniform fill reassigns RADII by rank, but each community keeps its
    // angular neighborhood (springs decide the angles) — a clique must not
    // smear all the way around the disc
    const clique = (prefix: string, vx: number) => Array.from({ length: 6 }, (_, i) => page(`${prefix}${i}`, { vx, vy: 0 }));
    const cliqueEdges = (prefix: string) => {
      const es: BrainGraphEdge[] = [];
      for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) es.push(wiki(`${prefix}${i}`, `${prefix}${j}`));
      return es;
    };
    const g = distillMemoryGraph(
      { nodes: [...clique('a', -0.2), ...clique('b', 0.2)], edges: [...cliqueEdges('a'), ...cliqueEdges('b')] },
      { maxPages: 12 },
    );
    // the satellite clique (anchored off-center) must span < half the circle
    const bAngles = Array.from({ length: 6 }, (_, i) => {
      const n = g.nodes.find((x) => x.id === `b${i}`)!;
      return Math.atan2(n.vy, n.vx);
    }).sort((x, y) => x - y);
    let maxGap = 2 * Math.PI + bAngles[0] - bAngles[bAngles.length - 1];
    for (let i = 1; i < bAngles.length; i++) maxGap = Math.max(maxGap, bAngles[i] - bAngles[i - 1]);
    expect(2 * Math.PI - maxGap, 'satellite clique smeared around the disc').toBeLessThan(Math.PI);
  });

  test('unlinked notes ring the rim as the orphan halo; linked notes stay inside', () => {
    const clique = Array.from({ length: 6 }, (_, i) => page(`c${i}`, { vx: 0, vy: 0 }));
    const es: BrainGraphEdge[] = [];
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) es.push(wiki(`c${i}`, `c${j}`));
    const orphans = Array.from({ length: 4 }, (_, i) => page(`o${i}`, { vx: 0.1, vy: 0.1 }));
    const g = distillMemoryGraph({ nodes: [...clique, ...orphans], edges: es }, { maxPages: 10 });
    for (const n of g.nodes.filter((x) => x.id.startsWith('o'))) {
      expect(n.links).toBe(0);
      expect(Math.hypot(n.vx, n.vy)).toBeGreaterThanOrEqual(1.07);
    }
    for (const n of g.nodes.filter((x) => x.id.startsWith('c'))) {
      expect(n.links).toBeGreaterThan(0);
      expect(Math.hypot(n.vx, n.vy)).toBeLessThanOrEqual(1.06);
    }
  });

  test('color regions follow the layout: one connected blob shares one cluster', () => {
    // colors must read as coherent spatial regions (like a real vault graph),
    // so a single tight blob may never come back as multi-colored confetti
    const clique = Array.from({ length: 12 }, (_, i) => page(`q${i}`, { vx: 0, vy: 0 }));
    const es: BrainGraphEdge[] = [];
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) es.push(wiki(`q${i}`, `q${j}`));
    const g = distillMemoryGraph({ nodes: clique, edges: es }, { maxPages: 12 });
    const clusters = new Set(g.nodes.filter((n) => n.type === 'page').map((n) => n.cluster));
    expect(clusters.size).toBe(1);
  });

  test('drops long-range similarity edges after layout, keeps wikilinks', () => {
    const clique = (prefix: string, vx: number) => Array.from({ length: 12 }, (_, i) => page(`${prefix}${i}`, { vx, vy: 0 }));
    const cliqueEdges = (prefix: string) => {
      const es: BrainGraphEdge[] = [];
      for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) es.push(wiki(`${prefix}${i}`, `${prefix}${j}`));
      return es;
    };
    const crossSimilar: BrainGraphEdge = { source: 'a0', target: 'b0', type: 'similar' };
    const crossWiki = wiki('a1', 'b1');
    const g = distillMemoryGraph(
      { nodes: [...clique('a', -0.3), ...clique('b', 0.3)], edges: [...cliqueEdges('a'), ...cliqueEdges('b'), crossSimilar, crossWiki] },
      { maxPages: 24 },
    );
    const pos = (id: string) => g.nodes.find((n) => n.id === id)!;
    const span = Math.hypot(pos('a0').vx - pos('b0').vx, pos('a0').vy - pos('b0').vy);
    expect(span).toBeGreaterThan(0.5); // sanity: the blobs really are far apart
    expect(g.edges.some((e) => e.type === 'similar' && e.source === 'a0' && e.target === 'b0')).toBe(false);
    expect(g.edges.some((e) => e.type === 'wikilink' && e.source === 'a1' && e.target === 'b1')).toBe(true);
  });

  test('force layout: links shape the graph — a hub sits at the center of its star', () => {
    // hub wikilinked to 14 spokes: springs must pull the hub to the middle of
    // its fan. With the radial spread pass the spokes ride out toward the rim,
    // so assert centrality directly: the hub's radius stays well inside its
    // spokes' mean radius. An imposed blob (position by community, ignore
    // links) fails this.
    const nodes = [page('hubx'), ...Array.from({ length: 14 }, (_, i) => page(`s-${i}`, { vx: (i % 7) / 10 - 0.3, vy: i / 40 }))];
    const edges = Array.from({ length: 14 }, (_, i) => wiki('hubx', `s-${i}`));
    const g = distillMemoryGraph({ nodes, edges }, { maxPages: 20 });
    const pos = (id: string) => g.nodes.find((n) => n.id === id)!;
    const hubR = Math.hypot(pos('hubx').vx, pos('hubx').vy);
    let spokeR = 0;
    for (let i = 0; i < 14; i++) spokeR += Math.hypot(pos(`s-${i}`).vx, pos(`s-${i}`).vy);
    spokeR /= 14;
    // 0.7: with mass-balanced centering + the radial spread the hub is
    // markedly interior to its fan, not pinned to the exact origin
    expect(hubR, `hub r=${hubR.toFixed(3)} vs mean spoke r=${spokeR.toFixed(3)}`).toBeLessThan(spokeR * 0.7);
  });

  test('pickRestTier: a calm subset for the collapsed view — hubs, best-linked pages, sparse orphans', () => {
    const nodes = [
      hub('ideas'),
      ...Array.from({ length: 30 }, (_, i) => ({ ...page(`p${String(i).padStart(2, '0')}`), cluster: 0, links: 30 - i }) as MemoryNode),
      ...Array.from({ length: 12 }, (_, i) => ({ ...page(`o${String(i).padStart(2, '0')}`), cluster: 0, links: 0 }) as MemoryNode),
    ].map((n) => ({ ...n, cluster: (n as MemoryNode).cluster ?? 0, links: (n as MemoryNode).links ?? 0 }) as MemoryNode);
    const tier = pickRestTier(nodes, 10);
    const ids = new Set(tier.map((n) => n.id));
    expect(ids.has('folder:ideas')).toBe(true); // hubs always stay
    expect(ids.has('p00')).toBe(true); // best-linked pages stay
    expect(ids.has('p29')).toBe(false); // weakly-linked pages rest
    expect(tier.filter((n) => n.links === 0 && n.type === 'page').length).toBeLessThan(12); // orphans thinned, not gone
    expect(tier.filter((n) => n.links === 0 && n.type === 'page').length).toBeGreaterThan(0);
    // deterministic
    expect(pickRestTier(nodes, 10)).toEqual(tier);
  });

  test('carries the kept-degree so hubs can render bigger', () => {
    const nodes = [page('hub'), page('x'), page('y')];
    const g = distillMemoryGraph({ nodes, edges: [wiki('x', 'hub'), wiki('y', 'hub')] }, { maxPages: 5 });
    expect(g.nodes.find((n) => n.id === 'hub')!.links).toBe(2);
    expect(g.nodes.find((n) => n.id === 'x')!.links).toBe(1);
  });

  test('de-clumps piled-up projections: linked notes separate, inside the unit disc', () => {
    // PCA regularly dumps most notes onto one spot — the constellation must
    // still read as an Notes graph, not a smear. A linked chain keeps them
    // one community (blob), but every pair still gets breathing room.
    const nodes = [
      ...Array.from({ length: 12 }, (_, i) => page(`clump-${i}`, { vx: 0.01, vy: 0.02 })),
      hub('ideas'),
    ];
    const edges = Array.from({ length: 11 }, (_, i) => wiki(`clump-${i}`, `clump-${i + 1}`));
    const g = distillMemoryGraph({ nodes, edges }, { maxPages: 12 });
    const pages = g.nodes.filter((n) => n.type === 'page');
    for (let i = 0; i < pages.length; i++) {
      for (let j = i + 1; j < pages.length; j++) {
        const d = Math.hypot(pages[i].vx - pages[j].vx, pages[i].vy - pages[j].vy);
        expect(d, `${pages[i].id} vs ${pages[j].id} too close (${d.toFixed(3)})`).toBeGreaterThanOrEqual(0.03);
      }
    }
    for (const n of g.nodes) {
      expect(Math.hypot(n.vx, n.vy)).toBeLessThanOrEqual(1.16);
    }
  });

  test('default cap keeps the open Notes graph light (120 pages)', () => {
    const nodes = [
      ...Array.from({ length: 620 }, (_, i) => page(`n-${i}`, { vx: (i % 25) / 25 - 0.5, vy: Math.floor(i / 25) / 26 - 0.5 })),
      hub('ideas'),
    ];
    const g = distillMemoryGraph({ nodes, edges: [] });
    const pages = g.nodes.filter((n) => n.type === 'page');
    expect(pages.length).toBe(120);
  });

  test('centerFolder: the boosted folder keeps its quota and sits in the middle of the disc', () => {
    // 80 weakly-linked archive notes vs a tight 40-note web: by degree rank
    // alone the archive barely survives the cap. With centerFolder it keeps
    // at least the quota AND its component anchors at the center.
    const archive = Array.from({ length: 80 }, (_, i) =>
      page(`arc${String(i).padStart(2, '0')}`, { folder: 'Chat Archive', vx: 0.5, vy: 0.2, wordCount: 50 + i }));
    const webby = Array.from({ length: 40 }, (_, i) => page(`w${String(i).padStart(2, '0')}`, { vx: -0.3, vy: -0.1 }));
    const edges: BrainGraphEdge[] = [hub('Chat Archive'), hub('ideas')].flatMap(() => []);
    const es: BrainGraphEdge[] = [];
    for (let i = 0; i < 40; i++) for (let j = i + 1; j < Math.min(i + 6, 40); j++) es.push(wiki(`w${String(i).padStart(2, '0')}`, `w${String(j).padStart(2, '0')}`));
    for (let i = 0; i < 80; i++) es.push(member('folder:Chat Archive', `arc${String(i).padStart(2, '0')}`));
    const nodes = [...archive, ...webby, hub('Chat Archive'), hub('ideas')];

    const plain = distillMemoryGraph({ nodes, edges: es }, { maxPages: 60 });
    const plainArc = plain.nodes.filter((n) => n.folder === 'Chat Archive' && n.type === 'page').length;

    const boosted = distillMemoryGraph({ nodes, edges: es }, { maxPages: 60, centerFolder: 'Chat Archive', centerQuota: 30 });
    const arcNotes = boosted.nodes.filter((n) => n.folder === 'Chat Archive' && n.type === 'page');
    expect(arcNotes.length, `archive kept ${arcNotes.length} (plain kept ${plainArc})`).toBeGreaterThanOrEqual(30);
    expect(arcNotes.length).toBeGreaterThan(plainArc);
    // and the archive community sits in the MIDDLE: its linked notes' mean
    // radius is well inside the other community's
    const linkedArc = arcNotes.filter((n) => n.links > 0);
    const meanR = (ns: typeof arcNotes) => ns.reduce((s, n) => s + Math.hypot(n.vx, n.vy), 0) / ns.length;
    const others = boosted.nodes.filter((n) => n.type === 'page' && n.folder !== 'Chat Archive' && n.links > 0);
    expect(meanR(linkedArc), `archive meanR ${meanR(linkedArc).toFixed(2)} vs others ${meanR(others).toFixed(2)}`).toBeLessThan(meanR(others) * 0.8);
  });

  test('UNIFORM FILL: equal-area rings each hold their share — no center clump, ever', () => {
    // the hard spread guarantee: split the occupied disc into three
    // equal-AREA annuli; each must hold a third of the linked notes (±14%).
    // A center clump fails ring 1; an empty middle fails ring 3.
    const nodes = [
      ...Array.from({ length: 90 }, (_, i) => page(`n${String(i).padStart(2, '0')}`, { vx: Math.cos(i) * 0.15, vy: Math.sin(i) * 0.15 })),
    ];
    const es: BrainGraphEdge[] = [];
    for (let i = 0; i < 89; i++) es.push(wiki(`n${String(i).padStart(2, '0')}`, `n${String(i + 1).padStart(2, '0')}`));
    for (let i = 0; i < 90; i += 7) for (let j = i + 2; j < Math.min(i + 6, 90); j++) es.push(wiki(`n${String(i).padStart(2, '0')}`, `n${String(j).padStart(2, '0')}`));
    const g = distillMemoryGraph({ nodes, edges: es }, { maxPages: 90 });
    const rs = g.nodes.filter((n) => n.type === 'page' && n.links > 0).map((n) => Math.hypot(n.vx, n.vy));
    const rMax = Math.max(...rs);
    const bins = [0, 0, 0];
    for (const r of rs) bins[Math.min(2, Math.floor((r / rMax) ** 2 * 3))]++;
    for (let b = 0; b < 3; b++) {
      const share = bins[b] / rs.length;
      expect(share, `ring ${b} holds ${(share * 100).toFixed(0)}% (want 33% ± 14)`).toBeGreaterThanOrEqual(0.19);
      expect(share, `ring ${b} holds ${(share * 100).toFixed(0)}% (want 33% ± 14)`).toBeLessThanOrEqual(0.47);
    }
    // and the fill reaches the rim: the outermost linked note near BLOB_FILL
    expect(rMax).toBeGreaterThanOrEqual(0.95);
  });

  test('layout is mass-balanced: communities fill the disc symmetrically, not piled to one side', () => {
    // one big community + two small islands, seeded lopsided. The settled
    // layout must balance: center of mass near the middle and every quadrant
    // holding real mass — not "some on the left and some in the middle".
    const mk = (prefix: string, n: number, sx: number, sy: number) =>
      Array.from({ length: n }, (_, i) => page(`${prefix}${String(i).padStart(2, '0')}`, { vx: sx + (i % 6) * 0.01, vy: sy + Math.floor(i / 6) * 0.01 }));
    const chain = (prefix: string, n: number) =>
      Array.from({ length: n - 1 }, (_, i) => wiki(`${prefix}${String(i).padStart(2, '0')}`, `${prefix}${String(i + 1).padStart(2, '0')}`));
    const nodes = [...mk('a', 40, -0.4, 0.1), ...mk('b', 10, -0.5, -0.3), ...mk('c', 10, -0.45, 0.35)];
    const edges = [...chain('a', 40), ...chain('b', 10), ...chain('c', 10)];
    const g = distillMemoryGraph({ nodes, edges }, { maxPages: 60 });
    const inner = g.nodes.filter((n) => n.type === 'page' && n.links > 0);
    const comX = inner.reduce((s, n) => s + n.vx, 0) / inner.length;
    const comY = inner.reduce((s, n) => s + n.vy, 0) / inner.length;
    expect(Math.hypot(comX, comY), `center of mass off by ${Math.hypot(comX, comY).toFixed(3)}`).toBeLessThan(0.15);
    const quad = [0, 0, 0, 0];
    for (const n of inner) quad[(n.vx >= 0 ? 1 : 0) + (n.vy >= 0 ? 2 : 0)]++;
    for (let q = 0; q < 4; q++) {
      expect(quad[q] / inner.length, `quadrant ${q} holds only ${quad[q]}/${inner.length}`).toBeGreaterThanOrEqual(0.08);
    }
  });

  test('layout fills the disc: a linked community is not one clump inside an empty circle', () => {
    // one 60-note wikilinked community — springs alone pile it near the
    // middle; the radial spread pass must push real mass toward the rim
    const nodes = Array.from({ length: 60 }, (_, i) =>
      page(`c${String(i).padStart(2, '0')}`, { vx: Math.cos(i) * 0.2, vy: Math.sin(i) * 0.2 }));
    const edges = Array.from({ length: 59 }, (_, i) => wiki(`c${String(i).padStart(2, '0')}`, `c${String(i + 1).padStart(2, '0')}`));
    const g = distillMemoryGraph({ nodes, edges }, { maxPages: 60 });
    const rs = g.nodes.filter((n) => n.type === 'page').map((n) => Math.hypot(n.vx, n.vy));
    const outer = rs.filter((r) => r > 0.5).length;
    expect(outer / rs.length, `only ${(outer / rs.length * 100).toFixed(0)}% of notes past half-radius`).toBeGreaterThanOrEqual(0.3);
  });

  test('pickRestTier spreads the mini graph around the whole disc, not just the dense blob', () => {
    // 48 heavily-linked pages piled into one sector plus 48 lightly-linked
    // pages evenly around the rim: link-rank alone would show one clump. The
    // mini Notes view must cover (nearly) every angular sector instead.
    const heavy = Array.from({ length: 48 }, (_, i) =>
      ({ ...page(`h${String(i).padStart(2, '0')}`, { vx: 0.5 + (i % 7) * 0.012, vy: 0.02 + Math.floor(i / 7) * 0.012 }), cluster: 0, links: 100 - i }) as MemoryNode);
    const light = Array.from({ length: 48 }, (_, i) => {
      const a = (i / 48) * 2 * Math.PI;
      return { ...page(`l${String(i).padStart(2, '0')}`, { vx: 0.7 * Math.cos(a), vy: 0.7 * Math.sin(a) }), cluster: 0, links: 1 } as MemoryNode;
    });
    const tier = pickRestTier([...heavy, ...light], 24);
    const sectors = new Set(
      tier.filter((n) => n.type === 'page').map((n) => Math.min(11, Math.floor(((Math.atan2(n.vy, n.vx) + Math.PI) / (2 * Math.PI)) * 12))),
    );
    expect(sectors.size, `pages cover only ${sectors.size}/12 sectors`).toBeGreaterThanOrEqual(10);
    // determinism holds under the spatial sampling too
    expect(pickRestTier([...heavy, ...light], 24)).toEqual(tier);
  });

  test('pickRestTier default budget stays mini: at most 96 linked pages', () => {
    const nodes = Array.from({ length: 300 }, (_, i) => {
      const a = (i / 300) * 2 * Math.PI;
      return { ...page(`n${String(i).padStart(3, '0')}`, { vx: 0.6 * Math.cos(a), vy: 0.6 * Math.sin(a) }), cluster: 0, links: 1 + (i % 9) } as MemoryNode;
    });
    const tier = pickRestTier(nodes);
    expect(tier.filter((n) => n.type === 'page' && n.links > 0).length).toBeLessThanOrEqual(96);
  });

  test('spacing contract: the resting disc clears the pillar ring by ≥ 10u', () => {
    // disc edge = R_CORE + 10 (component backdrop); pillar icon inner edge =
    // ring1 − 14 (team node radius). They must never overlap at rest.
    const ring1 = responsiveRingR(880, 600)[1];
    expect(ring1 - 14 - (R_CORE + 10)).toBeGreaterThanOrEqual(10);
  });

  test('a dense constellation still spreads without violating the disc bound', () => {
    // 200 chained (same-community) notes piled on one spot must still separate
    const nodes = Array.from({ length: 200 }, (_, i) => page(`d-${i}`, { vx: 0, vy: 0 }));
    const edges = Array.from({ length: 199 }, (_, i) => wiki(`d-${i}`, `d-${i + 1}`));
    const g = distillMemoryGraph({ nodes, edges }, { maxPages: 200 });
    let min = Infinity;
    for (let i = 0; i < g.nodes.length; i++) {
      for (let j = i + 1; j < g.nodes.length; j++) {
        min = Math.min(min, Math.hypot(g.nodes[i].vx - g.nodes[j].vx, g.nodes[i].vy - g.nodes[j].vy));
      }
    }
    expect(min).toBeGreaterThanOrEqual(0.02);
    for (const n of g.nodes) expect(Math.hypot(n.vx, n.vy)).toBeLessThanOrEqual(1.16);
  });

  test('empty input → empty graph, no throw', () => {
    expect(distillMemoryGraph({ nodes: [], edges: [] })).toEqual({ nodes: [], edges: [] });
  });

  test('deterministic for identical input', () => {
    const nodes = [page('a'), page('b'), page('c'), hub('ideas')];
    const edges = [wiki('a', 'b'), wiki('b', 'c')];
    const g1 = distillMemoryGraph({ nodes, edges }, { maxPages: 2 });
    const g2 = distillMemoryGraph({ nodes, edges }, { maxPages: 2 });
    expect(g1).toEqual(g2);
  });
});

const VIEW = { w: 880, h: 600 };
const CORE = { x: 440, y: 300 };

const state = (over: Partial<CameraState> = {}): CameraState => ({
  focusedTeam: false,
  coreExpanded: false,
  coreCenter: CORE,
  selectedNodePos: null,
  memorySelectedPos: null,
  ...over,
});

describe('cameraRect', () => {
  test('rest → the full frame, breathed out a touch (Alex: a bit more zoomed out)', () => {
    const r = cameraRect(VIEW, state());
    expect(r.x).toBeLessThan(0);
    expect(r.y).toBeLessThan(0);
    expect(r.w).toBeGreaterThan(880);
    expect(r.w).toBeLessThan(880 * 1.2); // just a little, not a satellite view
    expect(r.w / r.h).toBeCloseTo(880 / 600, 5);
    // centered: equal margins on both sides
    expect(r.x + r.w / 2).toBeCloseTo(440, 5);
    expect(r.y + r.h / 2).toBeCloseTo(300, 5);
  });

  test('dept focus without a selection → the same breathed-out frame (the wheel fills it)', () => {
    expect(cameraRect(VIEW, state({ focusedTeam: true }))).toEqual(cameraRect(VIEW, state()));
  });

  test('selected org node → tighter frame centered on the node, canvas aspect kept', () => {
    const r = cameraRect(VIEW, state({ focusedTeam: true, selectedNodePos: { x: 440, y: 300 } }));
    expect(r.w).toBeLessThan(880 * 0.7);
    expect(r.w / r.h).toBeCloseTo(880 / 600, 5);
    expect(r.x + r.w / 2).toBeCloseTo(440, 5);
    expect(r.y + r.h / 2).toBeCloseTo(300, 5);
  });

  test('selected node near a corner → rect clamps inside the canvas', () => {
    const r = cameraRect(VIEW, state({ selectedNodePos: { x: 6, y: 4 } }));
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(880);
    expect(r.y + r.h).toBeLessThanOrEqual(600);
  });

  test('expanded core → dives to a half-canvas frame with breathing room', () => {
    const r = cameraRect(VIEW, state({ coreExpanded: true }));
    expect(r.w).toBeCloseTo(880 * 0.5, 5);
    expect(r.x + r.w / 2).toBeCloseTo(CORE.x, 5);
    expect(r.y + r.h / 2).toBeCloseTo(CORE.y, 5);
  });

  test('selected memory note zooms closer than the expanded core', () => {
    const core = cameraRect(VIEW, state({ coreExpanded: true }));
    const note = cameraRect(VIEW, state({ coreExpanded: true, memorySelectedPos: { x: 430, y: 310 } }));
    expect(note.w).toBeLessThan(core.w);
    expect(note.x + note.w / 2).toBeCloseTo(430, 5);
  });
});

describe('memoryNodePos', () => {
  test('maps projection coords onto a disc around the core center', () => {
    const p = memoryNodePos({ vx: 0.5, vy: -1 }, { x: 440, y: 300 }, 70);
    expect(p).toEqual({ x: 440 + 0.5 * 70, y: 300 - 70 });
  });

  test('center coords land exactly on the core center', () => {
    expect(memoryNodePos({ vx: 0, vy: 0 }, { x: 100, y: 50 }, 70)).toEqual({ x: 100, y: 50 });
  });
});

describe('lerpRect', () => {
  const a: Rect = { x: 0, y: 0, w: 880, h: 600 };
  const b: Rect = { x: 200, y: 150, w: 300, h: 204.545 };

  test('t=1 snaps exactly to the target (reduced-motion branch)', () => {
    expect(lerpRect(a, b, 1)).toEqual(b);
  });

  test('converges onto the target under repeated small steps', () => {
    let cur = a;
    for (let i = 0; i < 120; i++) cur = lerpRect(cur, b, 0.12);
    expect(cur.x).toBeCloseTo(b.x, 1);
    expect(cur.y).toBeCloseTo(b.y, 1);
    expect(cur.w).toBeCloseTo(b.w, 1);
    expect(cur.h).toBeCloseTo(b.h, 1);
  });

  test('is stable once at the target', () => {
    expect(lerpRect(b, b, 0.12)).toEqual(b);
  });

  test('moves monotonically toward the target', () => {
    const one = lerpRect(a, b, 0.12);
    const two = lerpRect(one, b, 0.12);
    expect(Math.abs(two.x - b.x)).toBeLessThan(Math.abs(one.x - b.x));
    expect(Math.abs(two.w - b.w)).toBeLessThan(Math.abs(one.w - b.w));
  });
});
