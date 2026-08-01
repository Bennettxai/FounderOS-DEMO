import { describe, expect, test, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  AGENT_BRAIN_SCOPES,
  buildBrainGraph,
  chunkText,
  embedNotes,
  embedText,
  parseNote,
  projectVector,
  type BrainNote,
} from '@/lib/brain-graph';
import { readStoreNotes } from '@/lib/connectors/gbrain';
import { BrainGraphSchema } from '@/lib/schemas';

const NOTES: BrainNote[] = [
  {
    path: 'people/jane-doe.md',
    content:
      '---\ntags: [investor, sf]\n---\n# Jane Doe\nMet at the summit. Works with [[acme-corp]] on the rollout. #priority\n',
  },
  {
    path: 'companies/acme-corp.md',
    content: '# Acme Corp\nEnterprise rollout partner. Contact is [[people/jane-doe|Jane]].\n',
  },
  {
    path: 'concepts/embeddings.md',
    content: '# Embeddings\nVectors capture semantic meaning of text chunks for retrieval.\n',
  },
  {
    path: 'inbox/raw-capture.md',
    content: 'quick capture, no heading, mentions [[nowhere-real]] which resolves to nothing\n',
  },
];

describe('parseNote', () => {
  test('extracts title from first H1, wikilinks, tags from frontmatter and inline', () => {
    const note = parseNote(NOTES[0].path, NOTES[0].content);
    expect(note.slug).toBe('people/jane-doe');
    expect(note.folder).toBe('people');
    expect(note.title).toBe('Jane Doe');
    expect(note.wikilinks).toEqual(['acme-corp']);
    expect(note.tags).toEqual(expect.arrayContaining(['investor', 'sf', 'priority']));
    expect(note.wordCount).toBeGreaterThan(5);
    expect(note.excerpt).toContain('Met at the summit');
    expect(note.excerpt).not.toContain('---'); // frontmatter stripped
  });

  test('falls back to slug basename when no H1, keeps alias-form wikilink target', () => {
    const note = parseNote(NOTES[3].path, NOTES[3].content);
    expect(note.title).toBe('raw-capture');
    expect(note.wikilinks).toEqual(['nowhere-real']);
  });

  test('alias wikilinks resolve to the target, not the alias', () => {
    const note = parseNote(NOTES[1].path, NOTES[1].content);
    expect(note.wikilinks).toEqual(['people/jane-doe']);
  });
});

describe('embedNotes', () => {
  test('is deterministic and bounded to [-1, 1]', () => {
    const texts = NOTES.map((n) => n.content);
    const a = embedNotes(texts);
    const b = embedNotes(texts);
    expect(a.coords).toEqual(b.coords);
    expect(a.coords).toHaveLength(texts.length);
    for (const [x, y] of a.coords) {
      expect(Math.abs(x)).toBeLessThanOrEqual(1);
      expect(Math.abs(y)).toBeLessThanOrEqual(1);
    }
  });

  test('near-duplicate texts are mutual nearest neighbors', () => {
    const texts = [
      'stripe payments revenue invoices billing churn mrr arr',
      'stripe payments revenue invoices billing churn metrics',
      'hiking trails mountain weather forecast snow gear boots',
    ];
    const { neighbors } = embedNotes(texts);
    expect(neighbors[0][0]).toBe(1);
    expect(neighbors[1][0]).toBe(0);
  });
});

describe('chunkText', () => {
  test('short text is a single chunk; long text splits into multiple', () => {
    expect(chunkText('just a few words here')).toHaveLength(1);
    const long = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ${'word '.repeat(40)}.`).join('\n\n');
    expect(chunkText(long).length).toBeGreaterThan(3);
  });

  test('empty text yields no chunks', () => {
    expect(chunkText('')).toHaveLength(0);
    expect(chunkText('   \n  ')).toHaveLength(0);
  });
});

describe('vector space (embedText + projectVector)', () => {
  test('embedText returns a unit-ish 64-dim vector, deterministically', () => {
    const v = embedText('stripe payments revenue billing');
    expect(v).toHaveLength(64);
    expect(v).toEqual(embedText('stripe payments revenue billing'));
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  test('a query projects nearer to its related note than to an unrelated one', () => {
    const texts = [
      'stripe payments revenue invoices billing churn mrr arr subscriptions',
      'hiking trails mountain weather forecast snow gear boots elevation camping',
      'typescript react components hooks rendering state props jsx bundler',
    ];
    const { coords, space } = embedNotes(texts);
    const q = projectVector(embedText('billing revenue from stripe subscriptions'), space);
    const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    expect(dist(q, coords[0])).toBeLessThan(dist(q, coords[1]));
    expect(dist(q, coords[0])).toBeLessThan(dist(q, coords[2]));
  });
});

describe('buildBrainGraph', () => {
  const graph = buildBrainGraph(NOTES, {
    agentScopes: { 'brain-librarian': ['*'], 'crm-pulse': ['people', 'companies'] },
  });

  test('creates one hub node per folder plus one node per page', () => {
    const hubs = graph.nodes.filter((n) => n.type === 'folder');
    const pages = graph.nodes.filter((n) => n.type === 'page');
    expect(hubs.map((h) => h.label).sort()).toEqual(['companies', 'concepts', 'inbox', 'people']);
    expect(pages).toHaveLength(4);
  });

  test('membership edges connect pages to their folder hub', () => {
    const member = graph.edges.filter((e) => e.type === 'member');
    expect(member).toHaveLength(4);
    expect(member).toContainEqual(
      expect.objectContaining({ source: 'folder:people', target: 'people/jane-doe' }),
    );
  });

  test('wikilinks resolve by full slug or basename; unresolved links are dropped', () => {
    const links = graph.edges.filter((e) => e.type === 'wikilink');
    expect(links).toContainEqual(
      expect.objectContaining({ source: 'people/jane-doe', target: 'companies/acme-corp' }),
    );
    expect(links).toContainEqual(
      expect.objectContaining({ source: 'companies/acme-corp', target: 'people/jane-doe' }),
    );
    expect(links.some((e) => e.target.includes('nowhere-real'))).toBe(false);
  });

  test('pages carry kind (folder name) for future color coding and embedding coords', () => {
    const jane = graph.nodes.find((n) => n.id === 'people/jane-doe');
    expect(jane?.kind).toBe('people');
    expect(typeof jane?.vx).toBe('number');
    expect(typeof jane?.vy).toBe('number');
  });

  test('every page carries its 64-dim vector fingerprint and chunk count', () => {
    for (const n of graph.nodes.filter((n) => n.type === 'page')) {
      expect(n.vector).toHaveLength(64);
      expect(n.chunks).toBeGreaterThanOrEqual(1);
    }
    const hub = graph.nodes.find((n) => n.id === 'folder:people');
    expect(hub?.vector).toHaveLength(64); // centroid of members
    expect(hub?.chunks).toBeGreaterThanOrEqual(1); // sum of members
  });

  test('the payload exposes the PCA space so queries can be projected client-side', () => {
    expect(graph.space.dim).toBe(64);
    expect(graph.space.mean).toHaveLength(64);
    expect(graph.space.components).toHaveLength(2);
    expect(graph.space.components[0]).toHaveLength(64);
  });

  test('agents are assigned to pages by folder scope, wildcard matches everything', () => {
    const jane = graph.nodes.find((n) => n.id === 'people/jane-doe');
    const concept = graph.nodes.find((n) => n.id === 'concepts/embeddings');
    expect(jane?.agents).toEqual(expect.arrayContaining(['brain-librarian', 'crm-pulse']));
    expect(concept?.agents).toEqual(['brain-librarian']);
  });

  test('similar edges link each page to its nearest embedding neighbor', () => {
    const similar = graph.edges.filter((e) => e.type === 'similar');
    expect(similar.length).toBeGreaterThan(0);
    for (const e of similar) {
      expect(graph.nodes.some((n) => n.id === e.source)).toBe(true);
      expect(graph.nodes.some((n) => n.id === e.target)).toBe(true);
    }
  });

  test('payload validates against the BrainGraphSchema zod boundary', () => {
    expect(() => BrainGraphSchema.parse(graph)).not.toThrow();
  });

  test('default agent scopes cover every real agent that touches the brain', () => {
    expect(AGENT_BRAIN_SCOPES['brain-librarian']).toEqual(['*']);
    expect(AGENT_BRAIN_SCOPES['sales-agent']).toEqual(expect.arrayContaining(['people', 'companies']));
    expect(AGENT_BRAIN_SCOPES['crm-pulse']).toEqual(expect.arrayContaining(['people', 'companies']));
  });
});

describe('GET /api/brain/graph', () => {
  test('returns a schema-valid graph built from the configured store', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'brain-graph-api-'));
    mkdirSync(path.join(dir, 'people'));
    writeFileSync(path.join(dir, 'people', 'sam.md'), '# Sam\nLinked to [[projects/os]].\n');
    mkdirSync(path.join(dir, 'projects'));
    writeFileSync(path.join(dir, 'projects', 'os.md'), '# OS\nThe build.\n');

    const prev = process.env.GBRAIN_STORE;
    process.env.GBRAIN_STORE = dir;
    vi.resetModules();
    try {
      const { GET } = await import('@/app/api/brain/graph/route');
      const res = await GET();
      expect(res.status).toBe(200);
      const body = BrainGraphSchema.parse(await res.json());
      expect(body.nodes.filter((n) => n.type === 'page')).toHaveLength(2);
      expect(body.edges.some((e) => e.type === 'wikilink')).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.GBRAIN_STORE;
      else process.env.GBRAIN_STORE = prev;
      vi.resetModules();
    }
  });
});

describe('readStoreNotes', () => {
  test('reads markdown files from disk with posix-relative paths', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'brain-graph-'));
    mkdirSync(path.join(dir, 'ideas'));
    writeFileSync(path.join(dir, 'ideas', 'one.md'), '# One\nhello\n');
    writeFileSync(path.join(dir, 'root.md'), 'root note\n');
    const notes = readStoreNotes(dir);
    expect(notes.map((n) => n.path).sort()).toEqual(['ideas/one.md', 'root.md']);
    expect(notes.find((n) => n.path === 'ideas/one.md')?.content).toContain('hello');
  });
});
