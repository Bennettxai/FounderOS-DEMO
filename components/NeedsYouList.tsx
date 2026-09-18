'use client';

import { ExternalLink, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { AsyncButton } from '@/components/AsyncButton';
import { useToast } from '@/components/Toaster';
import type { UnseenState } from '@/lib/deliverables-opened';
import { needsYou, type ApprovalKind, type Classified } from '@/lib/board-approvals';
import { partitionByDecision } from '@/lib/deliverable-decisions';
import { revisionOf } from '@/lib/deliverable-revision';
import type { DeliverableGroup, DeliverableItem } from '@/lib/board-deliverables';
import type { DecisionKind, DeliverableDecision } from '@/lib/schemas';
import { Label } from '@/components/terminal';

/**
 * Needs You — the queue of agent work waiting on the operator.
 *
 * The point is a place to see tasks are getting done and to approve the
 * ones agents need input on, without having to dig through every file.
 *
 * It reads the SAME payload the Deliverables tab already polls, one fetch, two
 * views, and filters it through the agents' own naming vocabulary. On a busy
 * board that turns a large pile of undifferentiated files into a much smaller
 * set that are actually asking for something, with a good chunk of those being
 * replies staged and never sent.
 *
 * Mock 3a turned the row from a link into the answer itself: kind glyph, where
 * it came from, what it is, why the Conductor surfaced it, and the two calls in
 * place. The row still opens the review panel for the full text, but the
 * operator should never have to open it to say yes.
 *
 * Deliberately not a second poller and not a second source of truth: if it ever
 * disagreed with Deliverables about what exists, both would stop being trusted.
 */
const GLYPH_TONE: Record<Classified['glyphTone'], string> = {
  ok: 'border-os-ok/40 text-os-ok',
  warn: 'border-os-warn/40 text-os-warn',
  err: 'border-os-err/50 text-os-err',
  dim: 'border-os-border text-os-dim',
};

/** What the white button says, per kind. "Approve" is not the operator's word for it. */
const PRIMARY: Record<ApprovalKind, { label: string; busy: string; done: string }> = {
  staged: { label: 'send it', busy: 'sending', done: 'sent' },
  decision: { label: 'go ahead', busy: 'recording', done: 'called' },
  gate: { label: 'unblock', busy: 'opening', done: 'open' },
  request: { label: 'approve', busy: 'recording', done: 'approved' },
  draft: { label: 'publish', busy: 'publishing', done: 'published' },
  done: { label: 'ok', busy: 'saving', done: 'ok' },
  output: { label: 'ok', busy: 'saving', done: 'ok' },
};

const when = (iso: string): string => {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};

/** Strip the agent's bookkeeping so the row reads as a subject, not a filename. */
function subject(name: string): string {
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^STAGED-/i, '')
    .replace(/-?DELIVER-BEFORE-\d{4}Z/i, '')
    .replace(/-?\d{4}-\d{2}-\d{2}(T\d{4}Z)?$/i, '')
    .replace(/-(COMMENT|PATCH)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

/**
 * The dot, on the piece of content itself: a way to see what hasn't been
 * looked at yet directly on the piece of content that was created, rather
 * than in a separate unread list.
 *
 * NEW means it appeared since the operator last opened anything here. UPDATED
 * means they read it and an agent has rewritten it since, which on this board
 * happens a lot: files sometimes get retracted by their own authors.
 */
function UnseenDot({ state }: { state: UnseenState }) {
  if (!state) return null;
  return (
    <span
      title={state === 'new' ? 'New since you last looked' : 'Rewritten since you read it'}
      aria-label={state === 'new' ? 'new' : 'updated'}
      className={`h-1.5 w-1.5 shrink-0 animate-pulse ${
        state === 'new' ? 'bg-os-accent' : 'bg-os-warn'
      }`}
    />
  );
}

function Row({
  c,
  onOpen,
  unseen,
  onDecide,
  onSnooze,
  onWake,
}: {
  c: Classified;
  onOpen: (i: DeliverableItem) => void;
  unseen: UnseenState;
  onDecide: (id: string, decision: DecisionKind | null, revision: string) => void | Promise<void>;
  onSnooze: (i: DeliverableItem) => void;
  onWake: (i: DeliverableItem) => void;
}) {
  const toast = useToast();
  const rev = revisionOf(c);
  const text = c.title || subject(c.name);
  const words = PRIMARY[c.ask];

  /**
   * Every handled row leaves with a receipt the operator can take back. The undo clears
   * the decision rather than writing an opposite one, so the file returns to
   * the queue exactly as the agent left it.
   */
  const settle = async (decision: DecisionKind, said: string) => {
    await onDecide(c.id, decision, rev);
    toast.ok(`${said} · ${text}`, () => void onDecide(c.id, null, rev));
  };

  return (
    <div
      role="button"
      data-lens="r"
      tabIndex={0}
      onClick={() => onOpen(c)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(c))}
      className={`pressable is-row grid w-full cursor-pointer grid-cols-[22px_minmax(0,1fr)] gap-2.5 border-b border-os-border px-3 py-2.5 text-left last:border-b-0 ${
        c.overdue ? 'bg-os-err/[0.06]' : ''
      }`}
    >
      {/* The kind, as one character. Colour on it is status, never decoration. */}
      <span
        aria-label={c.label}
        title={c.label}
        className={`mt-px grid h-[22px] w-[22px] place-items-center rounded-ctl border font-mono text-[11px] font-bold ${GLYPH_TONE[c.glyphTone]}`}
      >
        {c.glyph}
      </span>

      <div className="min-w-0">
        <div className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-os-dim">
          <UnseenDot state={unseen} />
          <span className="truncate">{c.meta || 'board'}</span>
          <span className="ml-auto shrink-0">{when(c.modifiedAt)}</span>
        </div>

        {/* The title is the document's own, not the filename: a raw filename reads as noise, not English. */}
        <div className="mt-0.5 text-[12.5px] font-semibold leading-snug text-os-text" title={c.name}>
          {text}
        </div>

        {c.summary && (
          <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-os-muted">{c.summary}</p>
        )}

        {/* Mock 3a: the Conductor shows its working. */}
        <p className="mt-1 font-mono text-[10px] text-os-dim">
          why here · {c.why}
          {c.deadline && (
            <span className={c.overdue ? ' font-bold text-os-err' : ' text-os-warn'}>
              {c.overdue ? ' · past due ' : ' · due '}
              {new Date(c.deadline).toISOString().slice(11, 16)}Z
            </span>
          )}
        </p>

        {/* Answerable in place. The row opens the review panel, so the controls
            have to stop the click before it gets there. AsyncButton's onClick
            takes no event, hence the wrapper rather than a handler argument. */}
        <div
          className="mt-2 flex flex-wrap items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <AsyncButton
            run={() => settle('approved', words.done)}
            tone="primary"
            busyLabel={words.busy}
            doneLabel={words.done}
          >
            {words.label}
          </AsyncButton>
          <AsyncButton
            run={() => settle('dismissed', 'dismissed')}
            tone="secondary"
            busyLabel="dismissing"
            doneLabel="dismissed"
          >
            dismiss
          </AsyncButton>
          <button
            onClick={() => {
              onSnooze(c);
              toast.ok(`snoozed 2h · ${text}`, () => onWake(c));
            }}
            title="Hold it for two hours. Nothing is sent and no agent is told."
            data-lens="c"
            className="pressable is-dark inline-flex h-[26px] items-center rounded-ctl border border-os-border bg-os-bg px-2.5 font-mono text-[10.5px] font-semibold text-os-muted"
          >
            snooze
          </button>
          <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.1em] text-os-dim">
            {c.label}
            {c.alsoAs && c.alsoAs.length > 0 && ` · also .${c.alsoAs.join(', .')}`}
          </span>
        </div>
      </div>
    </div>
  );
}

export function NeedsYouList({
  groups,
  refreshing,
  onRefresh,
  boardUrl,
  decisions,
  onOpen,
  unseenOf,
  onDismissMany,
  onDecide,
  snoozedOf,
  onSnooze,
  onWake,
}: {
  groups: DeliverableGroup[] | null;
  refreshing: boolean;
  onRefresh: () => void;
  boardUrl: string | null;
  decisions: Record<string, DeliverableDecision>;
  onOpen: (i: DeliverableItem) => void;
  unseenOf: (i: DeliverableItem) => UnseenState;
  onDismissMany: (items: DeliverableItem[]) => void;
  onDecide: (id: string, decision: DecisionKind | null, revision: string) => void | Promise<void>;
  snoozedOf: (i: DeliverableItem) => boolean;
  onSnooze: (i: DeliverableItem) => void;
  onWake: (i: DeliverableItem) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (groups === null) {
    return <p className="font-mono text-[10.5px] text-os-dim">reading the board…</p>;
  }

  const files = groups.flatMap((g) => g.items).filter((i) => i.kind === 'file');
  // What the operator has already approved or dismissed leaves the queue, and comes back
  // by itself if the agent rewrites it (see lib/deliverable-decisions).
  const { open: ranked, decided } = partitionByDecision(needsYou(files), decisions);
  // "Not now" is not a decision; it is a hold on the operator's own view for two hours.
  const queue = ranked.filter((c) => !snoozedOf(c));
  const held = ranked.length - queue.length;
  const overdue = queue.filter((c) => c.overdue).length;
  const unread = queue.filter((c) => unseenOf(c) !== null).length;

  return (
    <section className="rounded-panel border border-os-border bg-os-surface">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-os-border px-4 py-2.5">
        <Label>Needs you</Label>
        <span className="font-mono text-[10px] text-os-dim">
          {queue.length} of {files.length} agent files are waiting on you
          {overdue > 0 && <span className="text-os-err"> · {overdue} past due</span>}
          {unread > 0 && <span className="text-os-accent"> · {unread} unread</span>}
          {held > 0 && <span className="text-os-dim"> · {held} snoozed</span>}
          {decided.length > 0 && <span className="text-os-dim"> · {decided.length} handled</span>}
        </span>
        {boardUrl && (
          <a
            href={boardUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1 font-mono text-[10px] text-os-dim linky"
          >
            open board <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {/* Bulk clear. DISMISS only:
            on a staged item approve means SEND IT, so there is deliberately no
            bulk approve. Two clicks, because a large batch of dismissals is not undoable in
            one gesture even though each row individually is. */}
        {queue.length > 0 &&
          (confirming ? (
            <span className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => {
                  onDismissMany(queue);
                  setConfirming(false);
                }}
                className="pressable flex items-center gap-1 rounded-ctl border border-os-err/50 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-os-err hover:bg-os-err/10"
              >
                <X className="h-3 w-3" /> dismiss all {queue.length}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="pressable font-mono text-[10px] uppercase tracking-[0.12em] text-os-dim hover:text-os-text"
              >
                cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              title="Dismiss everything shown. Nothing is sent."
              className="pressable flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-os-dim hover:text-os-text"
            >
              <X className="h-3 w-3" /> clear all
            </button>
          ))}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="pressable flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-os-dim hover:text-os-text disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> refresh
        </button>
      </div>

      {/* Mock 3a: the queue says who ranked it, because the order is a claim. */}
      <div className="flex items-center gap-2 px-4 pt-2">
        <span className="h-px flex-1 bg-os-border" />
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-os-dim">
          ranked by the Conductor · people first, then deadlines
        </span>
        <span className="h-px flex-1 bg-os-border" />
      </div>

      {queue.length === 0 ? (
        <div className="m-4 grid place-items-center gap-1 rounded-panel border border-dashed border-os-border px-4 py-8 text-center">
          <span className="text-[18px] text-os-ok">✓</span>
          <p className="text-[12.5px] font-semibold text-os-text">Nothing needs you.</p>
          <p className="font-mono text-[10px] text-os-dim">
            the Conductor will surface the next thing here
            {held > 0 && ` · ${held} snoozed`}
            {decided.length > 0 && ` · you handled ${decided.length}`}
          </p>
        </div>
      ) : (
        <div className="mt-2 max-h-[calc(100dvh-20rem)] overflow-y-auto overscroll-contain">
          {queue.map((c) => (
            <Row
              key={c.id}
              c={c}
              onOpen={onOpen}
              unseen={unseenOf(c)}
              onDecide={onDecide}
              onSnooze={onSnooze}
              onWake={onWake}
            />
          ))}
        </div>
      )}
    </section>
  );
}
