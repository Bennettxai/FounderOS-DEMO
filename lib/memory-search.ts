import type { MemoryNode } from '@/lib/memory-core';

/**
 * Type-to-find over the open Notes vault: rank label prefix hits above
 * label substrings, above folder hits, above excerpt hits. Deterministic
 * (score, then label, then id), capped so the highlight overlay stays light.
 * Pure — no React, no DOM.
 */
export const MAX_SEARCH_HITS = 24;

export function searchMemoryNotes(nodes: MemoryNode[], query: string, cap = MAX_SEARCH_HITS): MemoryNode[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored: { n: MemoryNode; score: number }[] = [];
  for (const n of nodes) {
    if (n.type !== 'page') continue;
    const label = n.label.toLowerCase();
    let score = 0;
    if (label.startsWith(q)) score = 4;
    else if (label.includes(q)) score = 3;
    else if (n.folder.toLowerCase().includes(q)) score = 2;
    else if (n.excerpt.toLowerCase().includes(q)) score = 1;
    if (score > 0) scored.push({ n, score });
  }
  scored.sort(
    (a, b) => b.score - a.score || a.n.label.localeCompare(b.n.label) || a.n.id.localeCompare(b.n.id),
  );
  return scored.slice(0, cap).map((s) => s.n);
}
