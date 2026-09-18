/**
 * Brain knowledge graph: parses brain-store markdown into an Obsidian-style
 * node/edge graph plus a deterministic local embedding projection.
 *
 * The embedding here is a lexical stand-in (hashed bag-of-words → PCA → 2D)
 * so the vector view works while Supabase/pgvector is unreachable. When the
 * real bge-m3 vectors come back online, swap `embedNotes` for a provider
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
  // Current roster (instance agents + workers)
  conductor: ['*'],
  'data-agent': ['*'],
  'markdown-auditor': ['*'],
  'vector-auditor': ['*'],
  'comms-agent': ['inbox', 'meetings', 'org'],
  'gmail-worker': ['inbox', 'meetings'],
  'whatsapp-worker': ['inbox', 'people'],
  'slack-worker': ['inbox', 'org'],
  'social-agent': ['media', 'writing', 'ideas'],
  'postly-publisher': ['media', 'writing', 'ideas'],
  'adsmith-creative': ['media', 'ideas'],
  'reelkit-editor': ['media', 'writing'],
  'renderly-creative': ['media', 'ideas'],
  'dmflow-mcp': ['media', 'people'],
  'sales-agent': ['people', 'companies', 'hiring'],
  'launchpad-cohort-sales': ['people', 'companies'],
  'vantage-sales': ['people', 'companies'],
  'paykit-sales': ['people', 'companies'],
  'vantage-paykit': ['people', 'companies'],
  'stripe-sales': ['companies'],
  'processor-confirmation': ['companies'],
  'flexpay-financing': ['people', 'companies'],
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

/**
 * Code is not prose, and `[[` inside it is not a link. The imported n8n
 * workflow pages carry JSON like `{"node": "Respond to Webhook", ...}` inside
 * fenced blocks, which the bare regex happily read as eight wikilinks to a
 * page that could never exist. Blank the fences and inline spans first so the
 * link graph only ever counts links a human actually wrote.
 */
/**
 * Is this `[[target]]` a page name at all?
 *
 * One imported n8n page pastes raw workflow JSON straight into the prose, not
 * inside a fence, so `[[{"node": "Respond to Webhook", ...}]]` reads as a
 * wikilink to the regex. Twenty-five of the store's twenty-eight broken links
 * were that single page. A page name has no braces, no quotes and no line
 * break in it.
 */
export function isPageName(target: string): boolean {
  const t = target.trim();
  if (!t || t.length > 120) return false;
  return !/[{}"\n\r]/.test(t);
}

export function stripCode(body: string): string {
  return body
    .replace(/^(\s*)(```|~~~)[^\n]*\n[\s\S]*?^\s*\2[^\n]*$/gm, '')
    .replace(/`[^`\n]*`/g, '');
}

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

/** A page as the resolver needs to see it: where it lives and what it calls itself. */
export type ResolvableNote = { slug: string; title: string };

/** `[[target|alias]]` and `[[target#heading]]` both point at `target`. */
export function linkTarget(raw: string): string {
  return raw.split('|')[0].split('#')[0].trim();
}

/**
 * How a `[[wikilink]]` finds its page. ONE implementation, shared by the graph,
 * the auditor and the wiki panels, because three copies of this rule is three
 * different answers to "is that link broken".
 *
 * Title matching is the half that was missing. 303 of the store's links are
 * `[[Claude Code]]` written inside conversation pages, and the page they mean
 * is `projects/claude-code.md`. Matching only slug and basename left every one
 * of them broken, which is most of the store's link graph.
 */
export function createWikilinkResolver(pages: ResolvableNote[]) {
  const norm = (s: string): string => s.trim().toLowerCase().replace(/\.md$/, '');
  const slugify = (s: string): string => norm(s).replace(/\s+/g, '-');

  const bySlug = new Map<string, string>();
  const byBasename = new Map<string, string>();
  const byTitle = new Map<string, string>();
  for (const p of pages) {
    const slug = norm(p.slug);
    bySlug.set(slug, p.slug);
    // First page wins a contested basename or title, so resolution is stable
    // whatever order the store is read in.
    const base = slug.split('/').pop()!;
    if (!byBasename.has(base)) byBasename.set(base, p.slug);
    const title = norm(p.title);
    if (title && !byTitle.has(title)) byTitle.set(title, p.slug);
  }

  return (target: string): string | null => {
    const key = norm(target);
    const base = key.split('/').pop()!;
    const slugged = slugify(target);
    return (
      bySlug.get(key) ??
      byBasename.get(base) ??
      bySlug.get(slugged) ??
      byBasename.get(slugged.split('/').pop()!) ??
      byTitle.get(key) ??
      null
    );
  };
}

export function parseNote(relPath: string, content: string): ParsedNote {
  const slug = relPath.replace(/\\/g, '/').replace(/\.md$/, '');
  const folder = slug.includes('/') ? slug.split('/')[0] : '(root)';
  const { frontmatter, body } = splitFrontmatter(content);

  const h1 = body.match(/^#\s+(.+)$/m);
  const title = h1 ? h1[1].trim() : slug.split('/').pop()!;

  const wikilinks = [...stripCode(body).matchAll(WIKILINK_RE)]
    .map((m) => m[1].trim())
    .filter(isPageName);
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

  const resolve = createWikilinkResolver(parsed);

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
      const resolved = resolve(linkTarget(target));
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
