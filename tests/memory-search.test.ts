import { describe, expect, test } from 'vitest';
import { searchMemoryNotes, MAX_SEARCH_HITS } from '@/lib/memory-search';
import type { MemoryNode } from '@/lib/memory-core';

const note = (id: string, over: Partial<MemoryNode> = {}): MemoryNode => ({
  id,
  type: 'page',
  label: id,
  folder: 'ideas',
  excerpt: `${id} excerpt`,
  wordCount: 100,
  chunks: 1,
  vx: 0,
  vy: 0,
  cluster: 0,
  links: 1,
  ...over,
});

describe('searchMemoryNotes', () => {
  test('ranks label prefix over label substring over folder over excerpt', () => {
    const nodes = [
      note('n1', { label: 'zernio pipeline' }),
      note('n2', { label: 'the zernio api' }),
      note('n3', { label: 'posting', folder: 'zernio' }),
      note('n4', { label: 'growth notes', excerpt: 'zernio metrics live here' }),
      note('n5', { label: 'unrelated' }),
    ];
    expect(searchMemoryNotes(nodes, 'zernio').map((n) => n.id)).toEqual(['n1', 'n2', 'n3', 'n4']);
  });

  test('needs at least 2 characters and is case-insensitive on both sides', () => {
    const nodes = [note('a', { label: 'Attio CRM' })];
    expect(searchMemoryNotes(nodes, 'a')).toEqual([]);
    expect(searchMemoryNotes(nodes, '  ')).toEqual([]);
    expect(searchMemoryNotes(nodes, 'ATTIO')).toHaveLength(1);
  });

  test('skips folder hubs, caps hits, and is deterministic', () => {
    const nodes = [
      note('folder:ideas', { type: 'folder', label: 'match ideas' }),
      ...Array.from({ length: 40 }, (_, i) => note(`m${String(i).padStart(2, '0')}`, { label: `match ${i}` })),
    ];
    const hits = searchMemoryNotes(nodes, 'match');
    expect(hits).toHaveLength(MAX_SEARCH_HITS);
    expect(hits.every((n) => n.type === 'page')).toBe(true);
    expect(searchMemoryNotes(nodes, 'match')).toEqual(hits);
  });
});
