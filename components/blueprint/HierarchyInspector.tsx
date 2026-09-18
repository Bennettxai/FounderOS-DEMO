'use client';

import type { CSSProperties } from 'react';
import { Focus, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, Scan, X } from 'lucide-react';
import { KIND_ICON, KIND_LABEL, STATUS_LABEL, relationsOf, type HAny, type Hierarchy, type HierarchyIndex } from '@/lib/blueprint/hierarchy';
import { iconFor } from './icons';

const colorOf = (it: HAny) => `var(--bh-k-${it.kind}, var(--text-2))`;

/**
 * Right glass panel: one tab per opened thing (last five), the active one
 * showing what it is, its facts, what is inside it and every connection -
 * each connection a click that jumps the map there.
 */
export function HierarchyInspector({
  h,
  idx,
  opened,
  active,
  expanded,
  minimized,
  onSelect,
  onCloseTab,
  onMinimize,
  onFocus,
  onFit,
  onToggle,
}: {
  h: Hierarchy;
  idx: HierarchyIndex;
  opened: string[];
  active: string | null;
  expanded: Set<string>;
  minimized: boolean;
  onSelect: (id: string) => void;
  onCloseTab: (id: string) => void;
  onMinimize: (v: boolean) => void;
  onFocus: () => void;
  onFit: () => void;
  onToggle: (id: string) => void;
}) {
  const has = opened.length > 0;
  const current = active && opened.includes(active) ? active : opened[opened.length - 1];
  const it = current ? idx.items.get(current) : undefined;
  const handleLabel = (active && idx.items.get(active)?.name) || it?.name || 'Details';

  const rels = it ? relationsOf(h, idx, it.id) : [];
  const grouped = new Map<string, typeof rels>();
  for (const r of rels) {
    const label = r.dir === 'out' ? r.via || r.kind : `${r.via || r.kind} ←`;
    grouped.set(label, [...(grouped.get(label) ?? []), r]);
  }
  const facts = it && it.type === 'node' ? Object.entries(it.facts) : it && it.type === 'container' ? Object.entries(it.facts) : [];
  const path = it ? idx.chain(it.id).slice(0, -1) : [];
  const members = it && it.type !== 'node' ? idx.descendants(it.id).filter((m) => m.type === 'node') : [];
  const Icon = it ? iconFor(it.icon || KIND_ICON[it.kind]) : null;
  const status = it ? (it.type === 'node' ? it.status : it.type === 'group' ? it.status : undefined) : undefined;

  return (
    <>
      <button type="button" className="pressable bh-insp-handle" title="Show details (i)" onClick={() => onMinimize(false)} style={{ display: has && minimized ? 'inline-flex' : 'none' }}>
        <PanelRightOpen />
        <span>{handleLabel}</span>
      </button>
      <aside className="bh-inspector" aria-hidden={!has || minimized}>
        <div className="bh-insp-bar">
          <div className="bh-insp-tabs">
            {opened.map((id) => (
              <button key={id} type="button" className={`pressable bh-itab ${id === current ? 'is-on' : ''}`} onClick={() => onSelect(id)}>
                <span>{idx.items.get(id)?.name ?? id}</span>
                <span
                  className="x"
                  role="button"
                  aria-label="Close"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(id);
                  }}
                >
                  <X />
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="pressable bh-insp-min" title="Hide panel (i)" onClick={() => onMinimize(true)}>
            <PanelRightClose />
          </button>
        </div>
        {it && Icon && (
          <div className="bh-insp-body" key={it.id}>
            <div className="bh-insp-head">
              <div className="bh-tile" style={{ '--c': colorOf(it) } as CSSProperties}>
                <Icon />
              </div>
              <div>
                <div className="t">{it.name}</div>
                <div className="s">
                  <span className="bh-kchip" style={{ '--c': colorOf(it) } as CSSProperties}>
                    {KIND_LABEL[it.kind]}
                  </span>
                  {status && (
                    <span className="bh-badge" data-s={status}>
                      <i />
                      {STATUS_LABEL[status]}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {path.length > 0 && (
              <div className="bh-insp-path">
                {path.map((p, i) => (
                  <span key={p}>
                    <b>{idx.items.get(p)?.name ?? p}</b>
                    {i < path.length - 1 ? ' › ' : ''}
                  </span>
                ))}
              </div>
            )}
            {it.sub && (
              <div className="bh-insp-sec">
                <div className="h">What it is</div>
                <div className="bh-insp-what">{it.sub}</div>
              </div>
            )}
            {facts.length > 0 && (
              <div className="bh-insp-sec">
                <div className="h">Facts</div>
                <div className="bh-kv">
                  {facts.map(([k, v]) => (
                    <div key={k} className="contents">
                      <div className="k">{k}</div>
                      <div className="v">{v === '' ? 'none' : v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {members.length > 0 && (
              <div className="bh-insp-sec">
                <div className="h">
                  <span>Inside</span>
                  <span>{members.length}</span>
                </div>
                {members.slice(0, 14).map((m) => {
                  const MI = iconFor(m.icon || KIND_ICON[m.kind]);
                  return (
                    <div key={m.id} className="bh-conn" onClick={() => onSelect(m.id)}>
                      <div className="bh-tile" style={{ '--c': colorOf(m) } as CSSProperties}>
                        <MI />
                      </div>
                      <div className="min-w-0">
                        <div className="t">{m.name}</div>
                        <div className="s">{m.sub}</div>
                      </div>
                      <span className="kind">{m.type === 'node' ? STATUS_LABEL[m.status] : ''}</span>
                    </div>
                  );
                })}
                {members.length > 14 && <div className="bh-insp-more">+{members.length - 14} more</div>}
              </div>
            )}
            {rels.length > 0 && (
              <div className="bh-insp-sec">
                <div className="h">
                  <span>Connections</span>
                  <span>{rels.length}</span>
                </div>
                {[...grouped.entries()].map(([label, list]) =>
                  list.slice(0, 10).map((r) => {
                    const o = idx.items.get(r.other);
                    if (!o) return null;
                    const OI = iconFor(o.icon || KIND_ICON[o.kind]);
                    return (
                      <div key={`${label}-${r.other}`} className="bh-conn" onClick={() => onSelect(r.other)}>
                        <div className="bh-tile" style={{ '--c': colorOf(o) } as CSSProperties}>
                          <OI />
                        </div>
                        <div className="min-w-0">
                          <div className="t">{o.name}</div>
                          <div className="s">{o.sub}</div>
                        </div>
                        <span className={`kind ${r.dir === 'out' ? 'is-out' : ''}`}>{label}</span>
                      </div>
                    );
                  }),
                )}
              </div>
            )}
            <div className="bh-insp-actions">
              <button type="button" className="pressable bh-btn" onClick={onFocus}>
                <Focus />
                <span>Focus</span>
              </button>
              {it.type === 'group' ? (
                <button type="button" className="pressable bh-btn" onClick={() => onToggle(it.id)}>
                  {expanded.has(it.id) ? <Minimize2 /> : <Maximize2 />}
                  <span>{expanded.has(it.id) ? 'Collapse' : 'Expand'}</span>
                </button>
              ) : (
                <button type="button" className="pressable bh-btn" onClick={onFit}>
                  <Scan />
                  <span>Whole map</span>
                </button>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
