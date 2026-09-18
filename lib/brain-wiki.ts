/**
 * The real wiki behind the knowledge graph.
 *
 * Until now the wiki panels asserted their content: every agent was claimed to
 * have `system.md`, `playbook.md`, `memory.md` and a `.config.md` (none of
 * which exist anywhere in the store), and every tool got a summary from a
 * hand-written dictionary in the code. Meanwhile the store holds 33 real agent
 * pages and 36 real tool pages, each with a written summary, a Category, a
 * Status and a real `## Used by` list. This module reads those instead.
 *
 * What a page shows is therefore what is on disk, and what it links to is what
 * its author actually typed. A link that points at nothing is KEPT and marked
 * broken rather than dropped, because a wiki that silently hides its dead ends
 * is how `Links: 0` went unnoticed for a thousand pages.
 *
 * Pure: notes in, index out. The caller supplies the store.
 */
import { createWikilinkResolver, linkTarget, parseNote, type BrainNote } from '@/lib/brain-graph';

/** One end of a link. `slug` is null when the target resolves to no page. */
export type WikiRef = { target: string; slug: string | null; title: string };

export type WikiEntry = {
  slug: string;
  title: string;
  /** The file, relative to the store root — a real path, not a claimed one. */
  path: string;
  folder: string;
  /** The page's own opening line. Empty when it never wrote one. */
  summary: string;
  excerpt: string;
  wordCount: number;
  tags: string[];
  /** `- Key: Value` lines the page states about itself (Category, Status, …). */
  fields: Record<string, string>;
  /** Outbound links in document order; broken ones carry slug: null. */
  links: WikiRef[];
  /** Inbound links: the pages that point here. */
  backlinks: WikiRef[];
};

export type WikiIndex = Record<string, WikiEntry>;

/** `- Category: CRM & Revenue` → ['Category', 'CRM & Revenue'] */
const FIELD_RE = /^\s*[-*]\s*([A-Z][A-Za-z ]{1,20}):\s*(.+?)\s*$/;

/**
 * The page's opening sentence: the first prose paragraph under the heading.
 * Bullets are skipped because they are the field block, and a heading is
 * skipped because the next section is not a summary of this one.
 */
function summaryOf(body: string): string {
  const lines = body.split('\n');
  let seenHeading = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#{1,6}\s/.test(line)) {
      if (seenHeading) break; // past the intro, into the next section
      seenHeading = true;
      continue;
    }
    if (/^[-*]\s/.test(line) || line.startsWith('|') || line.startsWith('```')) continue;
    if (line.startsWith('---')) continue;
    return line.replace(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g, '$1');
  }
  return '';
}

function fieldsOf(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const m = line.match(FIELD_RE);
    // A bullet holding a wikilink is a relationship (the `## Used by` list),
    // not a stated fact about the page.
    if (m && !m[2].includes('[[')) fields[m[1].trim()] = m[2];
  }
  return fields;
}

export function buildWikiIndex(notes: BrainNote[]): WikiIndex {
  const parsed = notes.map((n) => ({ note: n, page: parseNote(n.path, n.content) }));
  const resolve = createWikilinkResolver(parsed.map(({ page }) => page));
  const titleOf = new Map(parsed.map(({ page }) => [page.slug, page.title]));

  const index: WikiIndex = {};
  for (const { note, page } of parsed) {
    const seen = new Set<string>();
    const links: WikiRef[] = [];
    for (const raw of page.wikilinks) {
      const target = linkTarget(raw);
      if (!target || seen.has(target.toLowerCase())) continue;
      seen.add(target.toLowerCase());
      const slug = resolve(target);
      if (slug === page.slug) continue; // a page linking to itself is not a relationship
      links.push({ target, slug, title: slug ? titleOf.get(slug) ?? slug : target });
    }
    index[page.slug] = {
      slug: page.slug,
      title: page.title,
      path: note.path,
      folder: page.folder,
      summary: summaryOf(page.body),
      excerpt: page.excerpt,
      wordCount: page.wordCount,
      tags: page.tags,
      fields: fieldsOf(page.body),
      links,
      backlinks: [],
    };
  }

  // Backlinks are derived, never authored: whatever points here, in a stable
  // order so the panel does not reshuffle between renders.
  for (const entry of Object.values(index)) {
    for (const link of entry.links) {
      if (!link.slug) continue;
      const target = index[link.slug];
      if (!target) continue;
      target.backlinks.push({ target: link.target, slug: entry.slug, title: entry.title });
    }
  }
  for (const entry of Object.values(index)) {
    entry.backlinks.sort((a, b) => a.slug!.localeCompare(b.slug!));
  }

  return index;
}

/**
 * The slice of the index a page actually renders.
 *
 * The whole index is ~1,300 entries with their link lists; shipping that to a
 * client component would dwarf the graph it decorates. A caller asks for the
 * handful of slugs its nodes map to and gets those.
 */
export function pickWikiEntries(index: WikiIndex, slugs: string[]): WikiIndex {
  const picked: WikiIndex = {};
  for (const slug of slugs) {
    const entry = index[slug];
    if (entry) picked[slug] = entry;
  }
  return picked;
}

/** Where an agent id and a tool slug live in the store, when they have a page. */
export function agentSlug(id: string): string {
  return `agents/${id}`;
}
export function toolSlug(slug: string): string {
  return `tools/${slug}`;
}
