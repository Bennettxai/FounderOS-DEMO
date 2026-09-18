'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { KIND_LABEL, searchHierarchy, type HierarchyIndex, type HKind } from '@/lib/blueprint/hierarchy';
import { iconFor } from './icons';
import { KIND_ICON } from '@/lib/blueprint/hierarchy';

/**
 * The top-centre search pill that opens into a ⌘K palette. Typing dims the
 * map live (the workspace owns `query`); Enter or a click selects the hit,
 * which expands whatever contains it and flies the camera there.
 */
export function HierarchySearch({
  idx,
  open,
  query,
  onOpen,
  onClose,
  onQuery,
  onPick,
}: {
  idx: HierarchyIndex;
  open: boolean;
  query: string;
  onOpen: () => void;
  onClose: () => void;
  onQuery: (q: string) => void;
  onPick: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(0);
  const hits = useMemo(() => searchHierarchy(idx, query), [idx, query]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open]);
  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    if (!open) return;
    const onDown = (ev: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, onClose]);

  const onKey = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'ArrowDown') {
      setCursor((c) => Math.min(hits.length - 1, c + 1));
      ev.preventDefault();
    } else if (ev.key === 'ArrowUp') {
      setCursor((c) => Math.max(0, c - 1));
      ev.preventDefault();
    } else if (ev.key === 'Enter') {
      const hit = hits[cursor];
      if (hit) onPick(hit.id);
    }
  };

  const groups: Array<[HKind, typeof hits]> = [];
  for (const hit of hits) {
    const g = groups.find(([k]) => k === hit.kind);
    if (g) g[1].push(hit);
    else groups.push([hit.kind, [hit]]);
  }

  return (
    <div ref={rootRef} className={`bh-search ${open ? 'is-open' : ''}`}>
      <button type="button" className="pressable bh-search-pill" onClick={onOpen}>
        <Search />
        <span>Search the system</span>
        <kbd>⌘K</kbd>
      </button>
      <div className="bh-search-panel" aria-hidden={!open}>
        <div className="bh-search-row">
          <Search />
          <input ref={inputRef} type="text" value={query} placeholder="Agents, connectors, skills, daemons, stores, pages, models…" autoComplete="off" spellCheck={false} onChange={(e) => onQuery(e.target.value)} onKeyDown={onKey} />
          <kbd>esc</kbd>
        </div>
        <div className="bh-search-results">
          {hits.length === 0 ? (
            <div className="bh-sr-empty">Nothing in the system matches that.</div>
          ) : (
            groups.map(([kind, list]) => (
              <div key={kind}>
                <div className="bh-sr-group">{KIND_LABEL[kind]}</div>
                {list.map((hit) => {
                  const i = hits.indexOf(hit);
                  const it = idx.items.get(hit.id);
                  const Icon = iconFor(it?.icon || KIND_ICON[hit.kind]);
                  return (
                    <div key={hit.id} className={`bh-sr ${i === cursor ? 'is-active' : ''}`} onClick={() => onPick(hit.id)} onMouseEnter={() => setCursor(i)}>
                      <div className="bh-tile" style={{ '--c': `var(--bh-k-${hit.kind}, var(--text-2))` } as React.CSSProperties}>
                        <Icon />
                      </div>
                      <div className="min-w-0">
                        <div className="t">{hit.name}</div>
                        <div className="s">{hit.sub}</div>
                      </div>
                      <span className="k">{hit.path}</span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
