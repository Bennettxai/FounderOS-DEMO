/**
 * Brain knowledge graph: parses brain-store markdown into an Notes-style
 * node/edge graph plus a deterministic local embedding projection.
 *
 * The embedding here is a lexical stand-in (hashed bag-of-words → PCA → 2D)
 * so the vector view works while Supabase/pgvector is unreachable. When the
 * real ZeroEntropy vectors come back online, swap `embedNotes` for a provider
 * that reads them — the graph payload shape stays identical.
 */
import type { BrainGraph, BrainGraphEdge, BrainGraphNode } from '@/lib/schemas';

export type BrainNote = { path: string; content: string };

export type ParsedNote = {
  slug: string;
  folder: string;
  title: string;
  wikilinks: string[];
  tags: string[];
  excerpt: string;
  wordCount: number;
  body: string;
};

/** Which agents are assigned to which brain-store folders ('*' = everything). */
export const AGENT_BRAIN_SCOPES: Record<string, string[]> = {
  // Current roster (instance agents + workers, 2026-06-12)
  conductor: ['*'],
  'data-agent': ['*'],
  'markdown-auditor': ['*'],
  'vector-auditor': ['*'],
  'comms-agent': ['inbox', 'meetings', 'org'],
  'gmail-worker': ['inbox', 'meetings'],
  'whatsapp-worker': ['inbox', 'people'],
  'slack-worker': ['inbox', 'org'],
  'social-agent': ['media', 'writing', 'ideas'],
  'zernio-publisher': ['media', 'writing', 'ideas'],
  'arcads-creative': ['media', 'ideas'],
  'remotion-editor': ['media', 'writing'],
  'higgsfield-creative': ['media', 'ideas'],
  'manychat-mcp': ['media', 'people'],
  'sales-agent': ['people', 'companies', 'hiring'],
  'launchpad-cohort-sales': ['people', 'companies'],
  'vantage-sales': ['people', 'companies'],
  'fanbasis-sales': ['people', 'companies'],
  'vantage-fanbasis': ['people', 'companies'],
  'stripe-sales': ['companies'],
  'processor-confirmation': ['companies'],
  'pava-financing': ['people', 'companies'],
  'sales-calls-data': ['meetings', 'people', 'companies'],
  'client-roster': ['people', 'companies'],
  'client-onboarding': ['people', 'companies'],
  'client-success': ['people', 'companies', 'meetings'],
  'stack-monitor': ['media', 'projects'],
  'payments-pulse': ['companies'],
  'notion-sync': ['projects', 'writing'],
  'crm-pulse': ['people', 'companies', 'hiring'],
  // Pre-roster ids kept for back-compat with in-flight work; remove once
  // nothing references them.
  'brain-librarian': ['*'],
  'inbox-triage': ['inbox', 'meetings'],
  'slack-scout': ['inbox', 'org'],
  'social-pulse': ['media', 'writing', 'ideas'],
  'studio-monitor': ['media', 'projects'],
};

/**
 * Split a note body into chunks the way an embedding pipeline would:
 * paragraph-first, merged up to ~120 words per chunk.
 */
export function chunkText(text: string): string[] {
  const CHUNK_WORDS = 120;
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  let words = 0;
  for (const p of paragraphs) {
    const w = p.split(/\s+/).length;
    if (words > 0 && words + w > CHUNK_WORDS) {
      chunks.push(current);
      current = '';
      words = 0;
    }
    current = current ? `${current}\n\n${p}` : p;
    words += w;
    while (words > CHUNK_WORDS) {
      const all = current.split(/\s+/);
      chunks.push(all.slice(0, CHUNK_WORDS).join(' '));
      current = all.slice(CHUNK_WORDS).join(' ');
      words = current ? current.split(/\s+/).length : 0;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const INLINE_TAG_RE = /(?:^|\s)#([a-z0-9][\w/-]*)/gi;

function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  if (!content.startsWith('---')) return { frontmatter: '', body: content };
  const end = content.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: '', body: content };
  return {
    frontmatter: content.slice(3, end),
    body: content.slice(content.indexOf('\n', end + 1) + 1),
  };
}

function frontmatterTags(frontmatter: string): string[] {
  const tags: string[] = [];
  const inline = frontmatter.match(/^tags:\s*\[([^\]]*)\]/m);
  if (inline) {
    tags.push(...inline[1].split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, '')));
  } else {
    const block = frontmatter.match(/^tags:\s*\n((?:\s*-\s*.+\n?)+)/m);
    if (block) {
      for (const line of block[1].split('\n')) {
        const item = line.match(/-\s*(.+)/);
        if (item) tags.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
      }
    }
  }
  return tags.filter(Boolean);
}

export function parseNote(relPath: string, content: string): ParsedNote {
  const slug = relPath.replace(/\\/g, '/').replace(/\.md$/, '');
  const folder = slug.includes('/') ? slug.split('/')[0] : '(root)';
  const { frontmatter, body } = splitFrontmatter(content);

  const h1 = body.match(/^#\s+(.+)$/m);
  const title = h1 ? h1[1].trim() : slug.split('/').pop()!;

  const wikilinks = [...body.matchAll(WIKILINK_RE)].map((m) => m[1].trim());
  const tags = [
    ...new Set([...frontmatterTags(frontmatter), ...[...body.matchAll(INLINE_TAG_RE)].map((m) => m[1])]),
  ];

  const plain = body
    .replace(WIKILINK_RE, (_m, target: string) => target.split('/').pop() ?? '')
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/[*_`>\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    slug,
    folder,
    title,
    wikilinks,
    tags,
    excerpt: plain.slice(0, 220),
    wordCount: plain ? plain.split(/\s+/).length : 0,
    body,
  };
}

// --- deterministic local embedding -----------------------------------------

const DIM = 64;

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hashVector(text: string): number[] {
  const v = new Array<number>(DIM).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9][\w-]{2,}/g) ?? [];
  for (const token of tokens) {
    const h = fnv1a(token);
    const idx = h % DIM;
    const sign = (h >>> 8) & 1 ? 1 : -1;
    v[idx] += sign;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/** Embed arbitrary text into the same 64-dim hashed lexical space. */
export function embedText(text: string): number[] {
  return hashVector(text);
}

export type VectorSpace = {
  dim: number;
  mean: number[];
  components: number[][];
  scale: number;
};

/** Project a 64-dim vector into the store's 2D PCA space. */
export function projectVector(v: number[], space: VectorSpace): [number, number] {
  const centered = v.map((x, i) => x - space.mean[i]);
  return [
    cosineFreeDot(centered, space.components[0]) / space.scale,
    cosineFreeDot(centered, space.components[1]) / space.scale,
  ];
}

/** First two principal components via deterministic power iteration. */
function pca2(vectors: number[][]): { coords: [number, number][]; space: VectorSpace } {
  const n = vectors.length;
  const emptySpace: VectorSpace = {
    dim: DIM,
    mean: new Array<number>(DIM).fill(0),
    components: [new Array<number>(DIM).fill(0), new Array<number>(DIM).fill(0)],
    scale: 1,
  };
  if (n === 0) return { coords: [], space: emptySpace };
  const mean = new Array<number>(DIM).fill(0);
  for (const v of vectors) for (let i = 0; i < DIM; i++) mean[i] += v[i] / n;
  const centered = vectors.map((v) => v.map((x, i) => x - mean[i]));

  const components: number[][] = [];
  for (let c = 0; c < 2; c++) {
    let w = Array.from({ length: DIM }, (_, i) => Math.sin(i + 1 + c)); // deterministic init
    for (let iter = 0; iter < 30; iter++) {
      // multiply covariance (X^T X) by w without materializing it
      const proj = centered.map((v) => cosineFreeDot(v, w));
      let next = new Array<number>(DIM).fill(0);
      for (let r = 0; r < n; r++) {
        for (let i = 0; i < DIM; i++) next[i] += centered[r][i] * proj[r];
      }
      for (const comp of components) {
        const d = cosineFreeDot(next, comp);
        next = next.map((x, i) => x - d * comp[i]);
      }
      const norm = Math.sqrt(next.reduce((s, x) => s + x * x, 0));
      if (norm < 1e-9) break;
      w = next.map((x) => x / norm);
    }
    components.push(w);
  }

  const raw = centered.map(
    (v) => [cosineFreeDot(v, components[0]), cosineFreeDot(v, components[1])] as [number, number],
  );
  const maxAbs = Math.max(1e-9, ...raw.flat().map(Math.abs));
  return {
    coords: raw.map(([x, y]) => [x / maxAbs, y / maxAbs]),
    space: { dim: DIM, mean, components, scale: maxAbs },
  };
}

function cosineFreeDot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function embedNotes(texts: string[]): {
  coords: [number, number][];
  neighbors: number[][];
  vectors: number[][];
  space: VectorSpace;
} {
  const vectors = texts.map(hashVector);
  const { coords, space } = pca2(vectors);
  const neighbors = vectors.map((v, i) =>
    vectors
      .map((other, j) => ({ j, sim: i === j ? -Infinity : cosine(v, other) }))
      .sort((a, b) => b.sim - a.sim)
      .map((x) => x.j)
      .slice(0, Math.max(0, texts.length - 1)),
  );
  return { coords, neighbors, vectors, space };
}

// --- graph assembly ---------------------------------------------------------

export function buildBrainGraph(
  notes: BrainNote[],
  opts: { agentScopes?: Record<string, string[]> } = {},
): BrainGraph {
  const scopes = opts.agentScopes ?? AGENT_BRAIN_SCOPES;
  const parsed = notes.map((n) => parseNote(n.path, n.content));
  const { coords, neighbors, vectors, space } = embedNotes(parsed.map((p) => p.body));
  const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

  const bySlug = new Map(parsed.map((p) => [p.slug.toLowerCase(), p.slug]));
  const byBasename = new Map<string, string>();
  for (const p of parsed) {
    byBasename.set(p.slug.split('/').pop()!.toLowerCase(), p.slug);
  }
  const resolve = (target: string): string | null => {
    const key = target.replace(/\.md$/, '').toLowerCase();
    return bySlug.get(key) ?? byBasename.get(key.split('/').pop()!) ?? null;
  };

  const agentsFor = (folder: string): string[] =>
    Object.entries(scopes)
      .filter(([, dirs]) => dirs.includes('*') || dirs.includes(folder))
      .map(([id]) => id)
      .sort();

  const nodes: BrainGraphNode[] = [];
  const edges: BrainGraphEdge[] = [];

  // page nodes
  parsed.forEach((p, i) => {
    nodes.push({
      id: p.slug,
      type: 'page',
      label: p.title,
      folder: p.folder,
      kind: p.folder,
      excerpt: p.excerpt,
      wordCount: p.wordCount,
      tags: p.tags,
      agents: agentsFor(p.folder),
      vx: coords[i]?.[0] ?? 0,
      vy: coords[i]?.[1] ?? 0,
      vector: (vectors[i] ?? []).map(r4),
      chunks: Math.max(1, chunkText(p.body).length),
    });
  });

  // folder hubs at the centroid of their members
  const folders = [...new Set(parsed.map((p) => p.folder))].sort();
  for (const folder of folders) {
    const members = parsed.map((p, i) => ({ p, i })).filter(({ p }) => p.folder === folder);
    const cx = members.reduce((s, { i }) => s + (coords[i]?.[0] ?? 0), 0) / members.length;
    const cy = members.reduce((s, { i }) => s + (coords[i]?.[1] ?? 0), 0) / members.length;
    nodes.push({
      id: `folder:${folder}`,
      type: 'folder',
      label: folder,
      folder,
      kind: 'hub',
      excerpt: '',
      wordCount: members.reduce((s, { p }) => s + p.wordCount, 0),
      tags: [],
      agents: agentsFor(folder),
      vx: cx,
      vy: cy,
      vector: Array.from({ length: space.dim }, (_, d) =>
        r4(members.reduce((s, { i }) => s + (vectors[i]?.[d] ?? 0), 0) / members.length),
      ),
      chunks: members.reduce((s, { p }) => s + Math.max(1, chunkText(p.body).length), 0),
    });
    for (const { p } of members) {
      edges.push({ source: `folder:${folder}`, target: p.slug, type: 'member' });
    }
  }

  // wikilink edges (unresolved targets dropped)
  for (const p of parsed) {
    for (const target of p.wikilinks) {
      const resolved = resolve(target);
      if (resolved && resolved !== p.slug) {
        edges.push({ source: p.slug, target: resolved, type: 'wikilink' });
      }
    }
  }

  // nearest-neighbor similarity edges, deduped as undirected pairs
  const simSeen = new Set<string>();
  parsed.forEach((p, i) => {
    const nearest = neighbors[i]?.[0];
    if (nearest === undefined || nearest < 0) return;
    const pair = [p.slug, parsed[nearest].slug].sort().join('::');
    if (simSeen.has(pair)) return;
    simSeen.add(pair);
    edges.push({ source: p.slug, target: parsed[nearest].slug, type: 'similar' });
  });

  return {
    nodes,
    edges,
    space: {
      dim: space.dim,
      mean: space.mean.map(r4),
      components: space.components.map((c) => c.map(r4)),
      scale: r4(space.scale),
    },
  };
}
