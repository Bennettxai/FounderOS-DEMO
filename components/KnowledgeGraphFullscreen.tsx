'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Minimize2 } from 'lucide-react';
import type { ToolWiki } from '@/lib/agent-wiki';
import { ToolDetailCard, type DeptLite } from '@/components/KnowledgeDetail';

export function KnowledgeGraphFullscreen({
  deptList, currentTeamId, currentDept,
  toolWiki, extraDetail, coreOpen = false, onCollapseCore, searchSlot, legendSlot, directorySlot, directoryCollapsed = false,
  onNavDept, onSelectToolSlug, onBack, onClose, children,
}: {
  deptList: DeptLite[];
  currentTeamId: string | null;
  currentDept: DeptLite | null;
  toolWiki: ToolWiki | null;
  /** task / human detail card rendered by the graph (SOP chain nodes) */
  extraDetail?: React.ReactNode;
  /** the Notes vault is expanded — Escape collapses it (via
      onCollapseCore) instead of exiting fullscreen; doing both at once
      stacked two heavy transitions and glitched the exit */
  coreOpen?: boolean;
  onCollapseCore?: () => void;
  /** vault search chip, rendered top-left while the vault is open */
  searchSlot?: React.ReactNode;
  /** compact kind legend, rendered bottom-left */
  legendSlot?: React.ReactNode;
  /** the everything-index, docked right; collapsible so it can step aside */
  directorySlot?: React.ReactNode;
  directoryCollapsed?: boolean;
  onNavDept: (teamId: string) => void;
  onSelectToolSlug: (slug: string) => void;
  onBack: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const hasDetail = !!(toolWiki || extraDetail);
  const idx = deptList.findIndex((d) => d.teamId === currentTeamId);
  const step = (dir: number) => {
    if (deptList.length === 0) return;
    const next = idx < 0 ? (dir > 0 ? 0 : deptList.length - 1) : (idx + dir + deptList.length) % deptList.length;
    onNavDept(deptList[next].teamId);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // typing in the vault search (or any input) must not drive navigation
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (e.key === 'Escape') {
        if (hasDetail) onBack();
        else if (coreOpen) onCollapseCore?.(); // close the vault, stay fullscreen
        else onClose();
      } else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDetail, coreOpen, idx, deptList]);

  if (!mounted) return null;

  const overlay = (
    // fully opaque own background (same terminal palette as the inline graph)
    <div className="fixed inset-0 z-[140] flex bg-os-bg">
      {/* the graph fills the field — same view as the inline "demo": every
          department in its spot in the circle, the active one bloomed into its
          tree with its colour glow, the rest dimmed in the background. */}
      <div className="relative min-w-0 flex-1 overflow-hidden bg-os-surface">
        {children}

        {/* vault search — top-left while the Notes core is open */}
        {searchSlot && <div className="absolute left-5 top-5 z-10">{searchSlot}</div>}

        {/* pillar selector — compact, TOP-LEFT (Alex: convenient, not in
            the graph's way): current pillar + one dot per pillar to jump */}
        {!coreOpen && (
          <div className="absolute left-5 top-5 z-20 flex items-center gap-2.5 rounded-sm-t border border-os-border-strong bg-os-bg/85 px-2.5 py-1.5 backdrop-blur">
            <div className="flex flex-col">
              <span
                className="max-w-[150px] truncate text-[12.5px] font-bold leading-tight transition-colors duration-300"
                style={currentDept ? { color: currentDept.color } : undefined}
              >
                {currentDept?.name ?? 'Pick a pillar'}
              </span>
              <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-os-dim">
                {idx >= 0 ? `${idx + 1} / ${deptList.length}` : `${deptList.length} pillars`}
              </span>
            </div>
            <div className="flex items-center gap-0.5 border-l border-os-border pl-2">
              {deptList.map((d) => {
                const active = d.teamId === currentTeamId;
                return (
                  <button
                    key={d.teamId}
                    onClick={() => onNavDept(d.teamId)}
                    title={d.name}
                    aria-label={d.name}
                    aria-current={active ? 'true' : undefined}
                    className="group grid h-6 w-5 place-items-center"
                  >
                    <span
                      className={`rounded-full transition-all duration-200 group-hover:scale-125 ${
                        active ? 'h-3 w-3' : 'h-2.5 w-2.5 opacity-50 group-hover:opacity-100'
                      }`}
                      style={{
                        background: active ? d.color : 'var(--text-3)',
                        boxShadow: active ? `0 0 8px ${d.color}` : undefined,
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* compact legend — bottom-left, always on */}
        {legendSlot && <div className="absolute bottom-5 left-5 z-10">{legendSlot}</div>}

        {/* the everything-index — always expanded in fullscreen (the detail
            aside overlays it while a card is open) */}
        {directorySlot && (
          <div className={`absolute bottom-5 right-5 top-16 z-[5] flex ${directoryCollapsed ? 'w-9' : 'w-72'}`}>{directorySlot}</div>
        )}

        {/* exit fullscreen — top-right */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 z-20 flex items-center gap-1.5 rounded-sm-t border border-os-border bg-os-surface px-2.5 py-1 font-mono text-[11px] text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text"
        >
          <Minimize2 className="h-3.5 w-3.5" /> Exit
        </button>

        {/* side paddles: slim, hugging the canvas edges at mid-height — you
            turn the wheel from where you're already looking, never the top.
            The right paddle steps aside when the detail panel is open. */}
        {!coreOpen && (
          <>
            <button
              onClick={() => step(-1)}
              aria-label="Previous department"
              title="Previous pillar (←)"
              className="absolute left-2 top-1/2 z-20 flex h-32 w-12 -translate-y-1/2 items-center justify-center rounded-sm-t border border-os-border bg-os-bg/70 text-os-muted backdrop-blur transition-colors hover:border-os-border-strong hover:text-os-text"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
            <button
              onClick={() => step(1)}
              aria-label="Next department"
              title="Next pillar (→)"
              className="absolute right-2 top-1/2 z-20 flex h-32 w-12 -translate-y-1/2 items-center justify-center rounded-sm-t border border-os-border bg-os-bg/70 text-os-muted backdrop-blur transition-colors hover:border-os-border-strong hover:text-os-text"
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          </>
        )}
      </div>

      {/* detail panel — an absolute overlay so opening/closing a card never
          resizes the graph area (that reflow was the back-and-forth glitch) */}
      {hasDetail && (
        <aside className="absolute right-0 top-0 z-30 flex h-full w-[300px] flex-col border-l border-os-border-strong bg-os-bg/95 shadow-lg backdrop-blur max-[820px]:inset-x-0 max-[820px]:bottom-0 max-[820px]:top-auto max-[820px]:max-h-[62vh] max-[820px]:w-full max-[820px]:rounded-t-lg-t max-[820px]:border-l-0 max-[820px]:border-t">
          {/* the trail: node → pillar (this) → home. Same affordance inline. */}
          <button
            onClick={onBack}
            aria-label={`Back to the ${currentDept?.name ?? 'graph'} pillar`}
            className="flex shrink-0 items-center gap-1.5 border-b border-os-border px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-os-dim transition-colors hover:text-os-text"
          >
            <ArrowLeft className="h-3 w-3 shrink-0" />
            <span className="truncate">
              Back · <span style={currentDept ? { color: currentDept.color } : undefined}>{currentDept?.name ?? 'graph'}</span>
            </span>
          </button>
          {toolWiki ? (
            <ToolDetailCard wiki={toolWiki} onClose={onBack} />
          ) : (
            extraDetail ?? null
          )}
        </aside>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}
