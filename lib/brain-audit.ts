/**
 * A real audit of the knowledge base.
 *
 * The Markdown Auditor used to count files per folder and report "130 pages
 * across 17 folders". It ran green for months while the vector index held
 * `Links: 0` on 1,038 pages and while the index and the folder on disk drifted
 * into two different corpora. An auditor that cannot catch a total ingest
 * failure is not auditing, so this one checks the things that actually break
 * retrieval:
 *
 *  - links that point at nothing (the graph DROPS them silently, by design,
 *    which is exactly why nobody noticed)
 *  - pages nothing links to, which retrieval can only reach by luck
 *  - two pages claiming the same title, so a recall picks one at random
 *  - pages with no heading, whose title is only a filename
 *  - the store on disk versus the index that search actually queries
 *
 * Pure: notes in, findings out. The agent supplies the store and the stats.
 */
import { createWikilinkResolver, linkTarget, parseNote, type BrainNote } from '@/lib/brain-graph';
import type { GBrainStats } from '@/lib/connectors/gbrain';

export type AuditKind =
  | 'broken-link'
  | 'orphan'
  | 'duplicate-title'
  | 'no-title'
  | 'index-drift'
  | 'links-not-ingested'
  | 'empty-store';

export type AuditFinding = {
  kind: AuditKind;
  severity: 'warn' | 'err';
  detail: string;
  count?: number;
};

export type BrainAudit = {
  pages: number;
  links: number;
  resolved: number;
  broken: number;
  orphans: number;
  findings: AuditFinding[];
  summary: string;
};

// The resolution rule itself lives in lib/brain-graph beside parseNote, so the
// graph, this auditor and the wiki panels cannot disagree about whether a link
// is broken. Re-exported here because callers of the audit expect it.
export { createWikilinkResolver };

const LIST = (items: string[], n = 5): string =>
  items.slice(0, n).join(', ') + (items.length > n ? `, +${items.length - n} more` : '');

export function auditBrainStore(
  notes: BrainNote[],
  opts: { stats?: GBrainStats | null } = {},
): BrainAudit {
  const findings: AuditFinding[] = [];

  if (notes.length === 0) {
    findings.push({
      kind: 'empty-store',
      severity: 'err',
      detail: 'no markdown pages found — the store path is wrong or the export never ran',
    });
    return { pages: 0, links: 0, resolved: 0, broken: 0, orphans: 0, findings, summary: 'brain-store is empty' };
  }

  const parsed = notes.map((n) => parseNote(n.path, n.content));
  const resolve = createWikilinkResolver(parsed);

  let links = 0;
  let resolvedCount = 0;
  const broken: string[] = [];
  const linked = new Set<string>();

  for (const p of parsed) {
    for (const raw of p.wikilinks) {
      links++;
      const target = resolve(linkTarget(raw));
      if (!target) {
        broken.push(`${p.slug} → ${linkTarget(raw)}`);
        continue;
      }
      resolvedCount++;
      if (target !== p.slug) {
        linked.add(p.slug);
        linked.add(target);
      }
    }
  }

  if (broken.length > 0) {
    findings.push({
      kind: 'broken-link',
      severity: 'warn',
      count: broken.length,
      detail: `${broken.length} wikilink(s) point at nothing: ${LIST(broken)}`,
    });
  }

  const orphans = parsed.filter((p) => !linked.has(p.slug)).map((p) => p.slug);
  if (orphans.length > 0) {
    findings.push({
      kind: 'orphan',
      severity: 'warn',
      count: orphans.length,
      detail: `${orphans.length} page(s) with no link in or out: ${LIST(orphans)}`,
    });
  }

  const byTitle = new Map<string, string[]>();
  for (const p of parsed) {
    const key = p.title.trim().toLowerCase();
    byTitle.set(key, [...(byTitle.get(key) ?? []), p.slug]);
  }
  const dupes = [...byTitle.entries()].filter(([, slugs]) => slugs.length > 1);
  if (dupes.length > 0) {
    findings.push({
      kind: 'duplicate-title',
      severity: 'warn',
      count: dupes.length,
      detail: `${dupes.length} title(s) claimed by more than one page: ${LIST(
        dupes.map(([, slugs]) => `${parsed.find((p) => p.slug === slugs[0])!.title} (${slugs.join(' / ')})`),
      )}`,
    });
  }

  // Ask the source, not the parsed title: parseNote falls back to the
  // basename, and a page legitimately titled "A" in a file called a.md would
  // otherwise be reported as untitled.
  const NAMED = /^\s*(#{1,6}\s+\S|title:\s*\S)/m;
  const untitled = notes.filter((n) => !NAMED.test(n.content)).map((n) => n.path.replace(/\.md$/, ''));
  if (untitled.length > 0) {
    findings.push({
      kind: 'no-title',
      severity: 'warn',
      count: untitled.length,
      detail: `${untitled.length} page(s) with no heading, so their title is only a filename: ${LIST(untitled)}`,
    });
  }

  const stats = opts.stats;
  if (stats) {
    // The check the old auditor could not make: search does not read this
    // folder, it reads the index, and the two can be entirely different bodies
    // of knowledge.
    if (stats.pages > 0 && Math.abs(stats.pages - parsed.length) > Math.max(10, parsed.length * 0.2)) {
      findings.push({
        kind: 'index-drift',
        severity: 'err',
        detail: `the index holds ${stats.pages} pages and this store holds ${parsed.length} — search is not answering from what is on disk`,
      });
    }
    if (resolvedCount > 0 && stats.links === 0) {
      findings.push({
        kind: 'links-not-ingested',
        severity: 'err',
        detail: `${resolvedCount} link(s) resolve on disk but the index reports Links: 0 — every wikilink is decorative as far as retrieval is concerned`,
      });
    }
  }

  const summary = `${parsed.length} pages · ${resolvedCount}/${links} links resolve · ${orphans.length} orphan(s) · ${
    findings.length === 0 ? 'no findings' : `${findings.length} finding(s): ${findings.map((f) => f.kind).join(', ')}`
  }`;

  return { pages: parsed.length, links, resolved: resolvedCount, broken: broken.length, orphans: orphans.length, findings, summary };
}
