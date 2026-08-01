import { describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { slugifyTitle, writeBrainDump, ingestBrainDump } from '@/lib/brain-dump';

function store() {
  return mkdtempSync(path.join(tmpdir(), 'brain-dump-'));
}

describe('slugifyTitle', () => {
  test('kebab-cases and strips noise', () => {
    expect(slugifyTitle('Call with ACME — pricing $$ ideas!')).toBe('call-with-acme-pricing-ideas');
    expect(slugifyTitle('   ')).toBe('untitled');
  });
});

describe('writeBrainDump', () => {
  test('writes a markdown memory file with frontmatter into the chosen folder', () => {
    const dir = store();
    const result = writeBrainDump(
      { text: 'Student Sarah closed her first client today. Huge win for LC.', title: 'Sarah first client', folder: 'inbox', tags: ['launchpad-cohort'] },
      dir,
    );
    expect(result.relPath.startsWith('inbox/')).toBe(true);
    const content = readFileSync(path.join(dir, result.relPath), 'utf8');
    expect(content).toContain('# Sarah first client');
    expect(content).toContain('Student Sarah closed her first client');
    expect(content).toMatch(/tags: \[launchpad-cohort\]/);
    expect(content).toContain('source: founder-os-brain-dump');
  });

  test('derives a title from the first words when none given', () => {
    const dir = store();
    const result = writeBrainDump({ text: 'Vantage retainer should move to monthly billing cycle', folder: 'ideas', tags: [] }, dir);
    expect(result.title.toLowerCase()).toContain('vantage retainer');
    expect(existsSync(path.join(dir, result.relPath))).toBe(true);
  });

  test('never overwrites: same title twice gets a unique suffix', () => {
    const dir = store();
    const a = writeBrainDump({ text: 'one', title: 'Same Title', folder: 'inbox', tags: [] }, dir);
    const b = writeBrainDump({ text: 'two', title: 'Same Title', folder: 'inbox', tags: [] }, dir);
    expect(a.relPath).not.toBe(b.relPath);
    expect(readFileSync(path.join(dir, b.relPath), 'utf8')).toContain('two');
  });

  test('rejects empty text and path-escaping folders', () => {
    const dir = store();
    expect(() => writeBrainDump({ text: '   ', folder: 'inbox', tags: [] }, dir)).toThrow();
    expect(() => writeBrainDump({ text: 'x', folder: '../evil', tags: [] }, dir)).toThrow();
    expect(() => writeBrainDump({ text: 'x', folder: 'a/b', tags: [] }, dir)).toThrow();
  });
});

describe('ingestBrainDump', () => {
  test('writes locally AND embeds via capture, returning the slug', async () => {
    const captured: { text: string; title?: string }[] = [];
    const res = await ingestBrainDump(
      { text: 'a live thought worth keeping', folder: 'inbox', tags: [] },
      {
        writeLocal: () => ({ relPath: 'inbox/note.md', title: 'a live thought' }),
        capture: async (input) => {
          captured.push(input);
          return { ok: true, slug: 'inbox/2026-07-03-abc', contentHash: 'h1' };
        },
      },
    );
    expect(res).toEqual({
      relPath: 'inbox/note.md',
      title: 'a live thought',
      embedded: true,
      slug: 'inbox/2026-07-03-abc',
    });
    expect(captured[0]).toMatchObject({ text: 'a live thought worth keeping', title: 'a live thought' });
  });

  test('keeps the local write and reports the error when capture fails', async () => {
    const res = await ingestBrainDump(
      { text: 'x', folder: 'inbox', tags: [] },
      {
        writeLocal: () => ({ relPath: 'inbox/x.md', title: 'x' }),
        capture: async () => ({ ok: false, error: 'Supabase paused' }),
      },
    );
    expect(res.embedded).toBe(false);
    expect(res.captureError).toBe('Supabase paused');
    expect(res.slug).toBeUndefined();
    expect(res.relPath).toBe('inbox/x.md');
  });

  test('without a capture dep, writes locally only (embedded:false, no error)', async () => {
    const res = await ingestBrainDump(
      { text: 'x', folder: 'inbox', tags: [] },
      { writeLocal: () => ({ relPath: 'inbox/x.md', title: 'x' }) },
    );
    expect(res.embedded).toBe(false);
    expect(res.captureError).toBeUndefined();
    expect(res.slug).toBeUndefined();
  });

  test('falls back to the real writeBrainDump when no writeLocal dep is given', async () => {
    const dir = store();
    const res = await ingestBrainDump(
      { text: 'real file write path', folder: 'inbox', tags: [] },
      { storePath: dir, capture: async () => ({ ok: true, slug: 's', contentHash: 'h' }) },
    );
    expect(res.embedded).toBe(true);
    expect(existsSync(path.join(dir, res.relPath))).toBe(true);
  });
});
