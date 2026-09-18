'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Layers, Maximize2, Minimize2, Play, Scan } from 'lucide-react';
import type { BlueprintGraph } from '@/lib/blueprint/graph';
import { buildHierarchy, expandedAtLevel, indexHierarchy, KIND_LABEL, LEGEND, matchesKind, matchesQuery, relationsOf, type HKind } from '@/lib/blueprint/hierarchy';
import { focusEdges as computeFocusEdges, layoutHierarchy, spineEdges } from '@/lib/blueprint/hierarchy-layout';
import { HierarchyCanvas, type CanvasHandle, type FocusMode } from './HierarchyCanvas';
import { HierarchySearch } from './HierarchySearch';
import { HierarchyInspector } from './HierarchyInspector';
import { AskBar, type AskHandle } from './AskBar';

type Level = 1 | 2 | 3;
const LEVELS: Array<{ n: Level; label: string; Icon: typeof Layers }> = [
  { n: 1, label: 'Overview', Icon: Minimize2 },
  { n: 2, label: 'Systems', Icon: Layers },
  { n: 3, label: 'Everything', Icon: Maximize2 },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Blueprint, hierarchy edition: the compiled graph as expandable buckets.
 * Three disclosure levels, focus mode on click (everything unrelated blurs,
 * the selection's relations light up in its kind's colour), ⌘K search that
 * dims live, a kind legend that filters, a breadcrumb, the inspector, the
 * ask bar, and "trace the chain" which runs a flare down the command spine.
 */
export function HierarchyWorkspace({ graph, subline }: { graph: BlueprintGraph; subline: string }) {
  const h = useMemo(() => buildHierarchy(graph), [graph]);
  const idx = useMemo(() => indexHierarchy(h), [h]);

  const [level, setLevelState] = useState<Level>(1);
  const [expanded, setExpanded] = useState<Set<string>>(() => expandedAtLevel(idx, 1));
  const [selected, setSelected] = useState<string | null>(null);
  const [opened, setOpened] = useState<string[]>([]);
  const [kindFilter, setKindFilter] = useState<HKind | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [inspMin, setInspMin] = useState(false);
  const [tracing, setTracing] = useState(false);
  const [lit, setLit] = useState<Set<string>>(() => new Set());

  const canvas = useRef<CanvasHandle>(null);
  const ask = useRef<AskHandle>(null);
  const pendingFly = useRef<{ id: string; s: number } | null>(null);
  const pendingFit = useRef(false);

  const layout = useMemo(() => layoutHierarchy(h, expanded), [h, expanded]);
  const spine = useMemo(() => spineEdges(h, idx, layout), [h, idx, layout]);

  const q = query.trim().toLowerCase();
  const focus: FocusMode = useMemo(() => {
    if (selected) {
      const rels = relationsOf(h, idx, selected);
      return { mode: 'focus', selected, hot: computeFocusEdges(idx, layout, selected, rels).hot };
    }
    if (q.length >= 2 || kindFilter) {
      const match = new Set<string>();
      for (const id of idx.items.keys()) if (kindFilter ? matchesKind(idx, id, kindFilter) : matchesQuery(idx, id, q)) match.add(id);
      return { mode: 'filter', match };
    }
    return { mode: 'none' };
  }, [selected, q, kindFilter, h, idx, layout]);
  const focusEdges = useMemo(() => (selected ? computeFocusEdges(idx, layout, selected, relationsOf(h, idx, selected)).edges : []), [selected, h, idx, layout]);
  const selectedItem = selected ? (idx.items.get(selected) ?? null) : null;
  const focusColor = selectedItem ? `var(--bh-k-${selectedItem.kind}, var(--accent))` : null;

  // camera moves that must wait for the new layout to commit
  useEffect(() => {
    if (pendingFly.current) {
      const { id, s } = pendingFly.current;
      pendingFly.current = null;
      canvas.current?.flyTo(id, s);
    }
    if (pendingFit.current) {
      pendingFit.current = false;
      canvas.current?.fitAll();
    }
  }, [layout, selected]);

  const select = useCallback(
    (id: string | null, fly = true) => {
      if (id && !idx.items.has(id)) return;
      if (id) {
        // expand whatever contains it so it is drawn
        const need = idx.chain(id).filter((p) => p !== id && idx.items.get(p)?.type === 'group' && !expanded.has(p));
        if (need.length) setExpanded((prev) => new Set([...prev, ...need]));
        setOpened((prev) => {
          if (prev.includes(id)) return prev;
          const next = [...prev, id];
          return next.length > 5 ? next.slice(next.length - 5) : next;
        });
        setKindFilter(null);
        if (fly) pendingFly.current = { id, s: 0.95 };
      }
      setSelected(id);
    },
    [idx, expanded],
  );

  const toggle = useCallback(
    (id: string) => {
      const open = expanded.has(id);
      setExpanded((prev) => {
        const next = new Set(prev);
        if (open) next.delete(id);
        else next.add(id);
        return next;
      });
      if (open && selected && idx.chain(selected).includes(id) && selected !== id) setSelected(id);
      if (!open) pendingFly.current = { id, s: 0.85 };
    },
    [expanded, selected, idx],
  );

  const setLevel = useCallback(
    (n: Level) => {
      setLevelState(n);
      setExpanded(expandedAtLevel(idx, n));
      pendingFit.current = true;
    },
    [idx],
  );

  const clear = useCallback(() => setSelected(null), []);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery('');
  }, []);
  const openSearch = useCallback(() => setSearchOpen(true), []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        if (searchOpen) closeSearch();
        else openSearch();
        return;
      }
      if (ev.key === 'Escape') {
        if (searchOpen) closeSearch();
        else if (!ask.current?.isFocused()) clear();
        return;
      }
      if (typing) return;
      if (ev.key === '/') {
        ev.preventDefault();
        ask.current?.focus();
      }
      if (ev.key === 'i' && !ev.metaKey && opened.length) setInspMin((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen, closeSearch, openSearch, clear, opened.length]);

  // trace the chain: light the spine band by band, a flare running each structural edge
  const trace = useCallback(async () => {
    if (tracing) return;
    setTracing(true);
    setSelected(null);
    canvas.current?.fitAll();
    const litIds = new Set<string>();
    const light = (ids: string[]) => {
      ids.forEach((id) => litIds.add(id));
      setLit(new Set(litIds));
    };
    await wait(400);
    for (let i = 0; i < h.spine.length; i++) {
      const e = h.spine[i];
      light([e.from]);
      await wait(180);
      light([`sp-${i}`]);
      await canvas.current?.runFlare(`sp-${i}`, 560);
      light(Array.isArray(e.to) ? e.to : [e.to]);
    }
    await wait(1800);
    setLit(new Set());
    setTracing(false);
  }, [tracing, h.spine]);

  const closeTab = useCallback(
    (id: string) => {
      setOpened((prev) => {
        const next = prev.filter((o) => o !== id);
        if (selected === id) setSelected(next[next.length - 1] ?? null);
        return next;
      });
    },
    [selected],
  );

  const hasInspector = opened.length > 0;
  const stageClass = `bh-stage ${hasInspector && !inspMin ? 'has-inspector' : ''} ${hasInspector && inspMin ? 'inspector-min' : ''}`;
  const crumb = selected ? idx.chain(selected) : [];

  return (
    <div className="bh-page">
      <header className="bh-top">
        <div className="bh-title">
          <div className="bh-h1">Blueprint</div>
          <div className="bh-sub">{subline}</div>
        </div>
        <div className="bh-levels">
          {LEVELS.map(({ n, label, Icon }) => (
            <button key={n} type="button" className={`pressable bh-lvl ${level === n ? 'is-on' : ''}`} onClick={() => setLevel(n)}>
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <HierarchySearch
          idx={idx}
          open={searchOpen}
          query={query}
          onOpen={openSearch}
          onClose={closeSearch}
          onQuery={(v) => {
            setQuery(v);
            if (selected) setSelected(null);
          }}
          onPick={(id) => {
            closeSearch();
            select(id);
          }}
        />
        <div className="bh-actions">
          <button type="button" className="pressable bh-btn" onClick={() => canvas.current?.fitAll()}>
            <Scan />
            <span>Fit</span>
          </button>
          <button type="button" className={`pressable bh-btn bh-btn-primary ${tracing ? 'is-busy' : ''}`} onClick={() => void trace()}>
            <Play />
            <span>Trace the chain</span>
          </button>
        </div>
      </header>

      <div className="bh-kinds">
        {LEGEND.map((k) => (
          <button
            key={k}
            type="button"
            className={`pressable bh-kind ${kindFilter === k ? 'is-on' : ''}`}
            style={{ '--c': `var(--bh-k-${k})` } as CSSProperties}
            onClick={() => {
              const next = kindFilter === k ? null : k;
              setKindFilter(next);
              if (next) setSelected(null);
            }}
          >
            <i className="sw" />
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <section className={stageClass}>
        <HierarchyCanvas ref={canvas} h={h} idx={idx} layout={layout} spine={spine} focusEdges={focusEdges} focusColor={focusColor} focus={focus} lit={lit} onSelect={(id) => select(id === selected ? null : id)} onToggle={toggle} onFly={(id) => canvas.current?.flyTo(id, 1.3)} />

        <AskBar ref={ask} scope={selectedItem} onClearScope={clear} />

        <div className={`bh-crumb ${crumb.length ? 'is-on' : ''}`}>
          {crumb.map((p, i) => (
            <span key={p}>
              <b onClick={() => select(p)}>{idx.items.get(p)?.name ?? p}</b>
              {i < crumb.length - 1 && <i className="sep">›</i>}
            </span>
          ))}
        </div>

        <HierarchyInspector
          h={h}
          idx={idx}
          opened={opened}
          active={selected}
          expanded={expanded}
          minimized={inspMin}
          onSelect={(id) => select(id)}
          onCloseTab={closeTab}
          onMinimize={setInspMin}
          onFocus={() => selected && canvas.current?.flyTo(selected, 1.3)}
          onFit={() => canvas.current?.fitAll()}
          onToggle={toggle}
        />
      </section>
    </div>
  );
}
