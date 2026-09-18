import { describe, expect, test } from 'vitest';
import { auditBrainStore } from '@/lib/brain-audit';
import { parseGbrainStats } from '@/lib/connectors/gbrain';

const note = (path: string, content: string) => ({ path, content });

describe('auditBrainStore', () => {
  test('counts the links that resolve and names the ones that do not', () => {
    const audit = auditBrainStore([
      note('sops/pricing.md', '# Pricing\nsee [[sops/scripts]] and [[ghost-page]]'),
      note('sops/scripts.md', '# Scripts\nback to [[sops/pricing]]'),
    ]);

    expect(audit.links).toBe(3);
    expect(audit.resolved).toBe(2);
    expect(audit.broken).toBe(1);
    const finding = audit.findings.find((f) => f.kind === 'broken-link')!;
    expect(finding.detail).toContain('ghost-page');
    expect(finding.detail).toContain('sops/pricing');
  });

  test('resolves a bare basename the way the graph does', () => {
    const audit = auditBrainStore([
      note('sops/pricing.md', 'see [[scripts]]'),
      note('sops/scripts.md', '# Scripts'),
    ]);
    expect(audit.broken).toBe(0);
  });

  test('flags orphans, which are pages retrieval can only reach by luck', () => {
    const audit = auditBrainStore([
      note('a.md', '# A\n[[b]]'),
      note('b.md', '# B'),
      note('island.md', '# Island\nno links in or out'),
    ]);
    const orphans = audit.findings.find((f) => f.kind === 'orphan')!;
    expect(orphans.count).toBe(1);
    expect(orphans.detail).toContain('island');
  });

  test('flags two pages claiming the same title', () => {
    const audit = auditBrainStore([
      note('old/pricing.md', '# Vantage Pricing'),
      note('new/pricing.md', '# Vantage Pricing'),
    ]);
    const dupes = audit.findings.find((f) => f.kind === 'duplicate-title')!;
    expect(dupes.detail).toContain('Vantage Pricing');
  });

  test('flags a page with no heading, because its title is only a filename', () => {
    const audit = auditBrainStore([note('inbox/dump.md', 'raw text with no heading at all')]);
    expect(audit.findings.some((f) => f.kind === 'no-title')).toBe(true);
  });

  test('a clean store produces no findings and says so', () => {
    const audit = auditBrainStore([
      note('a.md', '# A\n[[b]]'),
      note('b.md', '# B\n[[a]]'),
    ]);
    expect(audit.findings).toEqual([]);
    expect(audit.summary).toContain('2 pages');
  });
});

describe('auditBrainStore against the index', () => {
  const store = [note('a.md', '# A\n[[b]]'), note('b.md', '# B\n[[a]]')];

  test('catches links that exist on disk but were never ingested', () => {
    // The finding this pins: hundreds of wikilinks on disk, `Links: 0` in the
    // vector DB. The old auditor counted files and reported everything fine.
    const stats = parseGbrainStats('Pages: 1000\nChunks: 11000\nEmbedded: 11000\nLinks: 0\nTags: 14\nTimeline: 0\n');
    const audit = auditBrainStore(store, { stats });
    const finding = audit.findings.find((f) => f.kind === 'links-not-ingested')!;
    expect(finding.severity).toBe('err');
    expect(finding.detail).toContain('0');
  });

  test('catches a store and an index that are not the same corpus', () => {
    const stats = parseGbrainStats('Pages: 1038\nChunks: 11301\nEmbedded: 11301\nLinks: 400\n');
    const audit = auditBrainStore(store, { stats });
    const drift = audit.findings.find((f) => f.kind === 'index-drift')!;
    expect(drift.detail).toContain('1038');
    expect(drift.detail).toContain('2');
  });

  test('says nothing about the index when the two agree', () => {
    const stats = parseGbrainStats('Pages: 2\nChunks: 4\nEmbedded: 4\nLinks: 2\n');
    const audit = auditBrainStore(store, { stats });
    expect(audit.findings.some((f) => f.kind === 'index-drift' || f.kind === 'links-not-ingested')).toBe(false);
  });

  test('reports nothing about an index it could not read', () => {
    const audit = auditBrainStore(store, { stats: null });
    expect(audit.findings.some((f) => f.kind === 'index-drift' || f.kind === 'links-not-ingested')).toBe(false);
  });

  test('an empty store is a finding of its own, not a clean bill of health', () => {
    const audit = auditBrainStore([]);
    expect(audit.findings.some((f) => f.kind === 'empty-store')).toBe(true);
  });
});

describe('parseGbrainStats', () => {
  test('reads the link and timeline counts the auditor depends on', () => {
    const stats = parseGbrainStats('Pages: 1038\nChunks: 11301\nEmbedded: 11301\nLinks: 0\nTags: 14\nTimeline: 0\n');
    expect(stats.pages).toBe(1038);
    expect(stats.links).toBe(0);
    expect(stats.timeline).toBe(0);
  });
});
