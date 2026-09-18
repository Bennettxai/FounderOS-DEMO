'use client';

import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  RefreshCw,
} from 'lucide-react';
import { Label } from '@/components/terminal';
import type { DeliverableGroup, DeliverableItem } from '@/lib/board-deliverables';
import type { UnseenState } from '@/lib/deliverables-opened';
import { DELIVERABLES_COLLAPSED_KEY, parseCollapsed } from '@/lib/deliverables-seen';

/**
 * The Deliverables tab on /agents: every file the
 * Paperclip agents produce (workspace deliverables/ folders), with one-click
 * downloads served straight off the board host's disk.
 *
 * Proposals join it as folders pinned at the top. They are links
 * rather than downloads — the proposal generator deploys to Vercel and leaves
 * the source on the operator's laptop, which the host cannot see — so the row
 * opens the live page instead of streaming bytes.
 *
 * Folders collapse, and the state persists, so a long agent-file
 * list can be folded away without hiding the proposals above it. The data
 * itself comes from useDeliverables one level up, because the unread badge on
 * the tab has to count items while this list is unmounted.
 */
const ago = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'now';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const size = (b: number): string =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

export function DeliverablesList({
  groups,
  refreshing,
  onRefresh,
  onOpen,
  unseenOf,
}: {
  groups: DeliverableGroup[] | null;
  refreshing: boolean;
  onRefresh: () => void;
  /** Ids that changed since the operator last looked: a red ping
 * update when proposals get updated from their initial state. */
  onOpen: (i: DeliverableItem) => void;
  unseenOf: (i: DeliverableItem) => UnseenState;
}) {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  // the operator sends the link and the code together, so the code is one tap away
  // rather than something to retype off the screen.
  const copyCode = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1400);
    } catch {
      /* clipboard blocked: the code is on screen anyway */
    }
  };

  useEffect(() => {
    try {
      setCollapsed(parseCollapsed(window.localStorage.getItem(DELIVERABLES_COLLAPSED_KEY)));
    } catch {
      /* blocked storage — every folder just stays open */
    }
  }, []);

  const toggle = (name: string) => {
    setCollapsed((prev) => {
      const next = prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name];
      try {
        window.localStorage.setItem(DELIVERABLES_COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        /* not worth failing the click over */
      }
      return next;
    });
  };

  const total = groups === null ? 0 : groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <section className="rounded-lg-t border border-os-border bg-os-surface">
      <div className="flex items-center gap-3 border-b border-os-border px-4 py-2.5">
        <Label>Agent deliverables</Label>
        <span className="font-mono text-[10px] text-os-dim">
          {groups === null
            ? 'loading…'
            : `${total} item${total === 1 ? '' : 's'} · ${groups.length} folder${
                groups.length === 1 ? '' : 's'
              }`}
        </span>
        <button
          onClick={onRefresh}
          title="Refresh"
          className="pressable ml-auto rounded-full p-1.5 text-os-dim hover:text-os-text"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {groups !== null && groups.length === 0 && (
        <p className="px-4 py-3 font-mono text-[10.5px] text-os-dim">
          Nothing in review yet. Proposals appear as folders above; agent files land here when agents write
          into their workspace deliverables folders on the board host — a dev machine that does not
          host the board honestly shows none.
        </p>
      )}

      {groups !== null && groups.length > 0 && (
        <div className="max-h-[60vh] overflow-y-auto">
          {groups.map((group) => {
            const open = !collapsed.includes(group.name);
            return (
              <div key={group.name}>
                <button
                  type="button"
                  onClick={() => toggle(group.name)}
                  aria-expanded={open}
                  className="pressable flex w-full items-center gap-2 border-b border-os-border bg-os-bg px-4 py-1.5 text-left hover:bg-os-surface2"
                >
                  {open ? (
                    <ChevronDown className="h-3 w-3 shrink-0 text-os-dim" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 text-os-dim" />
                  )}
                  {open ? (
                    <FolderOpen className="h-3 w-3 shrink-0 text-os-dim" />
                  ) : (
                    <Folder className="h-3 w-3 shrink-0 text-os-dim" />
                  )}
                  <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-os-muted">
                    {group.name}
                  </span>
                  <span className="ml-auto font-mono text-[9px] text-os-dim">{group.items.length}</span>
                </button>
                {open && (
                  <div className="divide-y divide-os-border">
                    {group.items.map((d) => (
                      <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                        {d.kind === 'link' ? (
                          <ExternalLink className="h-4 w-4 shrink-0 text-os-muted" />
                        ) : (
                          <FileText className="h-4 w-4 shrink-0 text-os-muted" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {/* The dot belongs on the piece
                                of content. Driven by the OPENED store, not the
                                tab's seen map, so looking at the tab does not
                                wipe every dot on it. */}
                            {unseenOf(d) && (
                              <span
                                title={
                                  unseenOf(d) === 'new'
                                    ? 'New since you last looked'
                                    : 'Rewritten since you read it'
                                }
                                aria-label={unseenOf(d) === 'new' ? 'new' : 'updated'}
                                className={`h-1.5 w-1.5 shrink-0 animate-pulse rounded-full ${
                                  unseenOf(d) === 'new' ? 'bg-os-accent' : 'bg-os-warn'
                                }`}
                              />
                            )}
                            <span className="truncate text-[12px] font-semibold" title={d.name}>
                              {d.title || d.name}
                            </span>
                            {d.accessCode && (
                              <button
                                type="button"
                                onClick={() => void copyCode(d.id, d.accessCode)}
                                title="Copy the access code that opens this proposal"
                                className="pressable shrink-0 rounded-full border border-os-border-strong px-2 py-0.5 font-mono text-[9px] tracking-[0.08em] text-os-muted hover:border-os-dim hover:text-os-text"
                              >
                                {copied === d.id ? 'copied' : d.accessCode}
                              </button>
                            )}
                          </div>
                          <div className="truncate font-mono text-[9.5px] text-os-dim">
                            {[d.meta, d.sizeBytes !== null ? size(d.sizeBytes) : null, ago(d.modifiedAt)]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpen(d)}
                          title="Review this without leaving the OS"
                          className="pressable flex shrink-0 items-center gap-1.5 rounded-full border border-os-border px-3 py-1.5 font-mono text-[10px] text-os-dim hover:border-os-dim hover:text-os-text"
                        >
                          review
                        </button>
                        {d.kind === 'link' ? (
                          <a
                            href={d.url ?? '#'}
                            target="_blank"
                            rel="noreferrer"
                            data-lens="c"
                            className="pressable is-dark flex shrink-0 items-center gap-1.5 rounded-full border border-os-border-strong bg-os-surface2 px-3 py-1.5 font-mono text-[10px] text-os-text"
                          >
                            <ExternalLink className="h-3 w-3" /> open
                          </a>
                        ) : (
                          <a
                            href={`/api/board/deliverables?file=${encodeURIComponent(d.id)}`}
                            download
                            data-lens="c"
                            className="pressable is-dark flex shrink-0 items-center gap-1.5 rounded-full border border-os-border-strong bg-os-surface2 px-3 py-1.5 font-mono text-[10px] text-os-text"
                          >
                            <Download className="h-3 w-3" /> download
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
