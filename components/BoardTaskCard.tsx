'use client';

import { useEffect, useState } from 'react';
import { boardTaskDecisionId } from '@/lib/board-live';
import type { PaperclipIssue } from '@/lib/connectors/paperclip';
import type { DecisionKind, DeliverableDecision } from '@/lib/deliverable-decisions';

/**
 * One task in a board lane. Click it and it opens in place to Approve or
 * Dismiss, which is a REAL write: the same `deliverable_decisions` store the
 * deliverables queue uses, namespaced `board:<issueId>`, so the call survives a
 * reload and follows the operator between the laptop and the host.
 *
 * The card is a role="button" div rather than a real button element, because it
 * contains two buttons of its own, and a button inside a button is invalid
 * markup that browsers silently unnest. The lens vocabulary agrees: the card is a row
 * (data-lens="r", 1.02 lift) and its actions are controls (data-lens="c",
 * 1.05), which cannot legally nest either.
 */
export function BoardTaskCard({
  issue,
  working,
  decision,
}: {
  issue: PaperclipIssue;
  working: boolean;
  decision?: DeliverableDecision;
}) {
  const [open, setOpen] = useState(false);
  // optimistic: the board poll is 4s away, the click has to answer now
  const [local, setLocal] = useState<DecisionKind | null>(decision?.decision ?? null);
  const [busy, setBusy] = useState(false);
  // a newer poll (or a call made on another machine) wins over our optimism
  useEffect(() => setLocal(decision?.decision ?? null), [decision?.decision, decision?.decidedAt]);

  const decide = async (kind: DecisionKind) => {
    if (busy) return;
    setBusy(true);
    setLocal(kind);
    try {
      const res = await fetch('/api/board/deliverables/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: boardTaskDecisionId(issue.id),
          decision: kind,
          // the task's own revision: an agent touching it reopens the call
          decidedRevision: issue.updatedAt ?? '',
        }),
      });
      if (!res.ok) setLocal(decision?.decision ?? null);
    } catch {
      setLocal(decision?.decision ?? null);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const approved = local === 'approved';
  const dismissed = local === 'dismissed';
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }}
      data-lens="r"
      className={`pressable is-row animate-enter cursor-pointer rounded-ctl border bg-os-bg px-2 py-1.5 text-left ${
        working && !approved ? 'task-live' : 'border-os-border'
      } ${dismissed ? 'opacity-45' : ''}`}
      style={approved ? { borderColor: 'color-mix(in oklab, var(--ok) 35%, transparent)' } : undefined}
      title={issue.title}
    >
      <div className="line-clamp-2 text-[10.5px] leading-snug">{issue.title}</div>
      <div className="mt-0.5 flex items-center gap-1 font-mono text-[9px] text-os-dim">
        {issue.assigneeName && (
          <>
            <span
              className={`h-1 w-1 ${working && !approved ? 'bg-os-ok task-live-dot' : 'bg-os-muted'}`}
            />
            <span className="truncate">{issue.assigneeName}</span>
          </>
        )}
        {approved && <span className="ml-auto shrink-0 text-os-ok">✓ approved</span>}
        {dismissed && <span className="ml-auto shrink-0">dismissed</span>}
      </div>

      {open && (
        // stopPropagation so a click on an action does not also re-toggle the row
        <div
          className="animate-enter mt-1.5 flex gap-1"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            data-lens="c"
            disabled={busy}
            onClick={() => void decide('approved')}
            className="pressable is-primary h-[22px] flex-1 rounded-ctl border border-os-text font-mono text-[9.5px] font-bold text-os-ink disabled:opacity-40"
          >
            Approve
          </button>
          <button
            data-lens="c"
            disabled={busy}
            onClick={() => void decide('dismissed')}
            className="pressable is-dark h-[22px] flex-1 rounded-ctl border border-os-border bg-os-bg font-mono text-[9.5px] font-semibold text-os-muted disabled:opacity-40"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
