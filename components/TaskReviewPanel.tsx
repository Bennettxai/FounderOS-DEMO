'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Download, ExternalLink, Undo2, X } from 'lucide-react';
import type { DeliverableItem } from '@/lib/board-deliverables';
import { previewKind } from '@/lib/deliverable-preview';
import { Markdown } from '@/components/Markdown';
import { classifyDeliverable } from '@/lib/board-approvals';
import { revisionOf } from '@/lib/deliverable-revision';
import type { DecisionKind, DeliverableDecision } from '@/lib/schemas';
import { Label } from '@/components/terminal';

/**
 * Read one piece of agent work, then decide on it.
 *
 * The task lanes on the agent tab needed to open into the actual content, not
 * just a link, with a way to dismiss, continue, or approve a task right there.
 *
 * Before this the only affordance on a task was a link to `?file=<id>`, which
 * the route serves as an attachment: every click was a download, so the queue
 * could be counted but never actually read. This pulls the content back as data
 * and puts the two decision controls right next to it.
 */
type Preview = { kind: string; text: string | null; truncated: boolean } | null;

/**
 * A `.json` deliverable is an envelope the agent would post; the document is
 * inside it. Showing the envelope is how "approve" came to mean reading raw
 * JSON. Falls back to the raw text when it is not the shape we expect.
 */
function jsonBodyOf(name: string, text: string): string {
  if (!/\.json$/i.test(name)) return text;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      for (const key of ['body', 'comment', 'text', 'content', 'markdown']) {
        const v = (parsed as Record<string, unknown>)[key];
        if (typeof v === 'string' && v.trim()) return v;
      }
    }
  } catch {
    /* truncated or not JSON at all - show what we have */
  }
  return text;
}

export function TaskReviewPanel({
  item,
  decision,
  onDecide,
  onClose,
}: {
  item: DeliverableItem | null;
  decision: DeliverableDecision | undefined;
  onDecide: (id: string, decision: DecisionKind | null, revision: string) => void;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<Preview>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Esc closes, so reviewing a queue never traps the operator in a panel.
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  useEffect(() => {
    if (!item) {
      setPreview(null);
      return;
    }
    // Proposals are live pages, not files on the board — nothing to fetch.
    if (item.kind === 'link') {
      setPreview({ kind: 'link', text: null, truncated: false });
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void (async () => {
      try {
        const res = await fetch(
          `/api/board/deliverables?file=${encodeURIComponent(item.id)}&mode=view`,
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error('bad status');
        const body = (await res.json()) as Preview;
        if (!cancelled) setPreview(body);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item]);

  if (!item) return null;

  const rev = revisionOf(item);
  const raw = `/api/board/deliverables?file=${encodeURIComponent(item.id)}`;
  const kind = item.kind === 'link' ? 'link' : previewKind(item.name);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-os-bg/70" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col border-l border-os-border-strong bg-os-surface"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-os-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <Label>Review</Label>
            {/* The document's own title, not the filename. */}
            <div className="mt-1 break-words text-[13.5px] font-semibold leading-snug text-os-text">
              {item.title || item.name}
            </div>
            <div className="mt-0.5 font-mono text-[9.5px] text-os-dim" title={item.name}>
              {item.name} · {item.meta}
              {decision && (
                <span className={decision.decision === 'approved' ? 'text-os-ok' : 'text-os-muted'}>
                  {' · '}
                  {decision.decision}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close review"
            className="pressable shrink-0 rounded-lg border border-os-border p-1 text-os-dim hover:border-os-dim hover:text-os-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        {item.kind === 'file' && (
          <p className="shrink-0 border-b border-os-border bg-os-text/[0.03] px-4 py-2 text-[11.5px] text-os-muted">
            {classifyDeliverable(item).action}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {loading && <p className="px-4 py-3 font-mono text-[10.5px] text-os-dim">reading…</p>}

          {failed && (
            <p className="px-4 py-3 font-mono text-[10.5px] text-os-err">
              Could not read this file. It may have been moved or the board host is unreachable.
            </p>
          )}

          {!loading && !failed && kind === 'text' && (
            <>
              {preview?.truncated && (
                <p className="border-b border-os-border bg-os-warn/[0.08] px-4 py-1.5 font-mono text-[9.5px] text-os-warn">
                  Showing the first part only. Download for the whole file.
                </p>
              )}
              <div className="px-4 py-3">
                {/* Rendered Markdown, not raw text: a wall of syntax and
                    unformatted gibberish read as broken. This used to be
                    a <pre> of the raw file. */}
                <Markdown text={jsonBodyOf(item.name, preview?.text ?? '')} />
              </div>
            </>
          )}

          {!loading && !failed && kind === 'image' && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={`${raw}&inline=1`} alt={item.name} className="max-w-full p-4" />
          )}

          {!loading && !failed && kind === 'pdf' && (
            <iframe src={`${raw}&inline=1`} title={item.name} className="h-full min-h-[70vh] w-full" />
          )}

          {!loading && !failed && kind === 'binary' && (
            <p className="px-4 py-3 font-mono text-[10.5px] text-os-dim">
              This format can&apos;t be shown here. Download it to review.
            </p>
          )}

          {kind === 'link' && (
            <div className="px-4 py-3 font-mono text-[10.5px] text-os-dim">
              This is a live proposal page rather than a file on the board.
              {item.accessCode && (
                <>
                  {' '}
                  Gate code <span className="text-os-text">{item.accessCode}</span>.
                </>
              )}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-os-border px-4 py-3">
          {decision ? (
            <button
              onClick={() => onDecide(item.id, null, rev)}
              className="pressable flex items-center gap-1.5 rounded-lg border border-os-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-os-muted hover:border-os-dim hover:text-os-text"
            >
              <Undo2 className="h-3 w-3" /> undo {decision.decision}
            </button>
          ) : (
            <>
              <button
                onClick={() => onDecide(item.id, 'approved', rev)}
                className="pressable flex items-center gap-1.5 rounded-lg border border-os-ok/50 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-os-ok hover:bg-os-ok/10"
              >
                <Check className="h-3 w-3" /> approve
              </button>
              <button
                onClick={() => onDecide(item.id, 'dismissed', rev)}
                className="pressable flex items-center gap-1.5 rounded-lg border border-os-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-os-muted hover:border-os-dim hover:text-os-text"
              >
                <X className="h-3 w-3" /> dismiss
              </button>
            </>
          )}

          <a
            href={item.kind === 'link' ? (item.url ?? raw) : raw}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1 font-mono text-[10px] text-os-dim linky"
          >
            {item.kind === 'link' ? (
              <>
                open page <ExternalLink className="h-3 w-3" />
              </>
            ) : (
              <>
                download <Download className="h-3 w-3" />
              </>
            )}
          </a>
        </footer>

        <p className="shrink-0 border-t border-os-border px-4 py-1.5 font-mono text-[9px] text-os-dim">
          Your call is recorded in the OS and clears this from the queue. If the agent rewrites the
          file, it comes back.
        </p>
      </aside>
    </div>
  );
}
