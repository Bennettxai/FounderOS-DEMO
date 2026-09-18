'use client';

import { useEffect, useRef, useState } from 'react';
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
  /** the Obsidian vault is expanded — Escape collapses it (via
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

  // the directory is a wide right-docked panel; drag its left edge to resize.
  const DIR_MIN = 288;
  const DIR_MAX = 680;
  const [dirWidth, setDirWidth] = useState(380);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    resizeRef.current = { startX: e.clientX, startW: dirWidth };
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const d = resizeRef.current;
    if (!d) return;
    // dragging the handle left (clientX decreases) widens the panel
    const next = d.startW + (d.startX - e.clientX);
    setDirWidth(Math.max(DIR_MIN, Math.min(DIR_MAX, next)));
  };
  const onResizeUp = (e: React.PointerEvent) => {
    resizeRef.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };
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

        {/* vault search — top-left while the Obsidian core is open */}
        {searchSlot && <div className="absolute left-5 top-5 z-10">{searchSlot}</div>}

        {/* department title — big and bold at the TOP CENTER, ALWAYS on (even
            with a card open) so you can always read which department you're
            looking at during the demo (the operator) */}
        {!coreOpen && currentDept && (
          <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2">
            <span
              className="text-[24px] font-bold uppercase leading-none tracking-[0.08em]"
              style={{ color: '#ffffff', textShadow: '0 1px 8px rgba(0,0,0,0.75)' }}
            >
              {currentDept.name}
            </span>
          </div>
        )}

        {/* pillar selector — compact, TOP-LEFT (the operator: convenient, not in
            the graph's way): current pillar + one dot per pillar to jump */}
        {!coreOpen && !hasDetail && (
          <div className="absolute left-5 top-5 z-20 flex items-center gap-2.5 rounded-sm-t border border-os-border-strong bg-os-bg/85 px-2.5 py-1.5 backdrop-blur">
            <div className="flex flex-col">
              <span
                className="state-fade max-w-[150px] truncate text-[12.5px] font-bold leading-tight"
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
                    className="pressable group grid h-6 w-5 place-items-center"
                  >
                    <span
                      className={`rounded-full transition-[width,height,opacity,transform] duration-200 group-hover:scale-125 ${
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

        {/* the everything-index — a wide right-docked panel (the detail aside
            overlays it while a card is open). Drag its left edge to resize. */}
        {directorySlot && (
          <div
            className="absolute bottom-5 right-5 top-16 z-[5] flex"
            style={{ width: directoryCollapsed ? 36 : dirWidth }}
          >
            {!directoryCollapsed && (
              <div
                onPointerDown={onResizeDown}
                onPointerMove={onResizeMove}
                onPointerUp={onResizeUp}
                role="separator"
                aria-orientation="vertical"
                aria-label="Drag to resize the directory"
                title="Drag to resize"
                className="group absolute -left-2 top-0 z-10 flex h-full w-4 cursor-ew-resize touch-none items-center justify-center"
              >
                <span className="state-fade h-12 w-0.5 rounded-full bg-os-border-strong group-hover:bg-os-accent" />
              </div>
            )}
            <div className="min-w-0 flex-1">{directorySlot}</div>
          </div>
        )}

        {/* exit fullscreen — top-right */}
        <button
          onClick={onClose}
          className="pressable absolute right-5 top-5 z-20 flex items-center gap-1.5 rounded-sm-t border border-os-border bg-os-surface px-2.5 py-1 font-mono text-[11px] text-os-muted hover:border-os-border-strong hover:text-os-text"
        >
          <Minimize2 className="h-3.5 w-3.5" /> Exit
        </button>

        {/* department nav — a single control pinned to the BOTTOM CENTER at all
            times (the operator), so you can always turn the wheel to another pillar
            no matter what card or panel is open. Bottom-center is clear water
            between the left card and the right directory. */}
        {!coreOpen && (
          <div className="absolute bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-os-border-strong bg-os-bg/90 px-1.5 py-1.5 backdrop-blur">
            <button
              onClick={() => step(-1)}
              aria-label="Previous department"
              title="Previous pillar (←)"
              className="pressable flex h-10 w-10 items-center justify-center rounded-full text-os-muted hover:bg-os-surface hover:text-os-text"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span
              className="min-w-[96px] px-1 text-center font-mono text-[11px] font-semibold leading-none"
              style={currentDept ? { color: currentDept.color } : undefined}
            >
              {currentDept?.name ?? 'All pillars'}
            </span>
            <button
              onClick={() => step(1)}
              aria-label="Next department"
              title="Next pillar (→)"
              className="pressable flex h-10 w-10 items-center justify-center rounded-full text-os-muted hover:bg-os-surface hover:text-os-text"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {/* detail panel — a FLOATING inset card on the left (the operator: not
          edge-to-edge top-to-bottom, a bit wider, don't blanket the tree). It
          stays an absolute overlay (opening/closing never reflows the graph —
          that reflow was the old back-and-forth glitch); the top/bottom insets
          keep it clear of the top controls and the bottom-center nav. Its own
          body scrolls on hover (bounded flex height). */}
      {hasDetail && (
        <aside className="absolute bottom-6 left-4 top-16 z-30 flex w-[400px] flex-col overflow-hidden rounded-lg-t border border-os-border-strong bg-os-bg/95 shadow-lg backdrop-blur max-[860px]:inset-x-2 max-[860px]:bottom-2 max-[860px]:top-auto max-[860px]:h-[70vh] max-[860px]:w-auto">
          {/* the trail: node → pillar (this) → home. Same affordance inline. */}
          <button
            onClick={onBack}
            aria-label={`Back to the ${currentDept?.name ?? 'graph'} pillar`}
            className="pressable flex shrink-0 items-center gap-1.5 border-b border-os-border px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-os-dim hover:text-os-text"
          >
            <ArrowLeft className="h-3 w-3 shrink-0" />
            <span className="truncate">
              Back · <span style={currentDept ? { color: currentDept.color } : undefined}>{currentDept?.name ?? 'graph'}</span>
            </span>
          </button>
          <div className="min-h-0 flex-1 overflow-hidden">
            {toolWiki ? <ToolDetailCard wiki={toolWiki} onClose={onBack} /> : extraDetail ?? null}
          </div>
        </aside>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}
