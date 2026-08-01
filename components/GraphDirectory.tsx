'use client';

import { ChevronLeft, ChevronRight, ClipboardList, User, UserRound, Wrench, type LucideIcon } from 'lucide-react';
import type { DirectoryGroup } from '@/lib/knowledge-graph';

/**
 * The everything-index of the knowledge graph: every AI agent, human, SOP and
 * tool in labeled groups, alphabetized, scrollable. Clicking a row jumps the
 * graph to that node (camera focus + detail card); hovering pre-lights its
 * chain. Collapsible: when `collapsed`, it shrinks to a slim right-edge rail
 * (click to bring the list back) so the graph — inline or fullscreen — can be
 * viewed unobstructed.
 */

const GROUP_ICON: Record<DirectoryGroup['kind'], LucideIcon> = {
  employee: User,
  person: UserRound,
  task: ClipboardList,
  tool: Wrench,
};

const GROUP_COLOR: Record<DirectoryGroup['kind'], string> = {
  employee: 'var(--accent)',
  person: 'var(--warn)',
  task: 'var(--brain-1)',
  tool: 'var(--kg-tool)',
};

export function GraphDirectory({
  groups, onPick, onHover, collapsed = false, onToggleCollapse, className = '',
}: {
  groups: DirectoryGroup[];
  /** kind + row id (node id; tools pass their slug) */
  onPick: (kind: DirectoryGroup['kind'], id: string) => void;
  onHover?: (kind: DirectoryGroup['kind'], id: string | null) => void;
  /** when true, render only the slim reopen rail */
  collapsed?: boolean;
  /** wired = the header shows a collapse chevron and the rail is clickable */
  onToggleCollapse?: () => void;
  className?: string;
}) {
  // collapsed → a slim vertical rail hugging the edge; click brings it back
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        title="Show directory"
        aria-label="Show directory"
        className={`group flex w-9 shrink-0 flex-col items-center gap-3 rounded-sm-t border border-os-border-strong bg-os-bg/95 py-3 backdrop-blur transition-colors hover:border-os-dim ${className}`}
      >
        <ChevronLeft className="h-4 w-4 text-os-dim transition-colors group-hover:text-os-text" />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim [writing-mode:vertical-rl] group-hover:text-os-muted">
          Directory
        </span>
      </button>
    );
  }
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-sm-t border border-os-border-strong bg-os-bg/95 backdrop-blur ${className}`}
    >
      <div className="flex items-center justify-between border-b border-os-border px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-os-dim">Directory</span>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Hide directory"
            aria-label="Hide directory"
            className="-mr-1 rounded-sm-t p-0.5 text-os-dim transition-colors hover:text-os-text"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {groups.map((g, gi) => {
          const Icon = GROUP_ICON[g.kind];
          const color = GROUP_COLOR[g.kind];
          return (
            <div key={g.kind} className={gi > 0 ? 'mt-2 border-t border-os-border pt-0.5' : undefined}>
              {/* segment title carries the kind's COLOR; SOLID background so the
                  scrolling rows never bleed through and the label stays legible */}
              <div
                className="sticky top-0 z-10 flex items-center gap-2 bg-os-bg px-2 pb-1.5 pt-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color }}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                <span className="flex-1">{g.title}</span>
                <span className="text-os-dim">{g.rows.length}</span>
              </div>
              {g.rows.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onPick(g.kind, r.id)}
                  onMouseEnter={() => onHover?.(g.kind, r.id)}
                  onMouseLeave={() => onHover?.(g.kind, null)}
                  className="group relative flex w-full items-baseline gap-2 rounded-sm-t py-1.5 pl-3 pr-2 text-left transition-colors hover:bg-os-surface2"
                  title={`Show ${r.label} on the graph`}
                >
                  {/* colored left accent in the group's color makes the hovered
                      row unmistakable at a glance */}
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[3px] opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ background: color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] leading-snug text-os-text group-hover:text-white">
                    {r.label}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-os-dim group-hover:text-os-muted">{r.sub}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
