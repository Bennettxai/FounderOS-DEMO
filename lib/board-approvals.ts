import type { DeliverableItem } from '@/lib/board-deliverables';

/**
 * The queue of agent work that is waiting on the operator.
 *
 * the operator, 2026-08-20: "I want to be able to approve tasks that agents need my
 * input on." The agents were already saying which ones those were — they name
 * the files. 92 deliverables sat in one flat list where a staged reply waiting
 * to be sent looked identical to a finished audit, so the ones with his name on
 * them were invisible.
 *
 * This reads the vocabulary the agents already use rather than inventing one:
 *   STAGED-…            written and waiting for him to send it
 *   …-decision-…        a call only he can make
 *   …-plan-gate-…       a gate to open before work continues
 *   …-request-…         a request routed to him
 *   …-draft-…           a draft to approve
 *   …-DELIVER-BEFORE-1430Z…   the agent gave it a deadline
 *   …UNBLOCKED… / …RESOLVED… / …FINAL…   finished, informational only
 *
 * Pure and unit-tested; the route and the tab stay thin.
 */
export const APPROVAL_KINDS = ['staged', 'decision', 'gate', 'request', 'draft', 'done', 'output'] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export type Classified = DeliverableItem & {
  /** NOT DeliverableItem.kind, which is 'file' | 'link' — this is the kind of ASK. */
  ask: ApprovalKind;
  /** true when the file is asking him for something */
  needsYou: boolean;
  /** ISO instant the agent asked for it by, or null */
  deadline: string | null;
  overdue: boolean;
  /** short human label for the badge */
  label: string;
  /** Plain English: what approving and dismissing actually DO. */
  action: string;
  /** true when a human is on the other end of this, waiting for a reply. */
  person: boolean;
  /** Mock 3a: the kind, as one character, in its own 22px box. */
  glyph: string;
  /** Colour on the glyph is STATUS, never decoration (Monolith Signal rule). */
  glyphTone: 'ok' | 'warn' | 'err' | 'dim';
  /** One lowercase clause: why the Conductor put this in front of him. */
  why: string;
};

/**
 * The badge used to say "staged · send it", which assumes you already know what
 * staged means. This says what the two buttons do, in a sentence, per kind, so
 * a row can be answered without knowing the board's vocabulary.
 */
export const ACTION_TEXT: Record<ApprovalKind, string> = {
  staged: 'The agent already wrote this. Approve to send it. Dismiss to bin it.',
  decision: 'Only you can make this call. Approve to go ahead. Dismiss to drop it.',
  gate: 'Work is paused until you answer. Approve to unblock it. Dismiss to keep it closed.',
  request: 'Someone asked you for something. Approve to act on it. Dismiss to decline.',
  draft: 'A draft is waiting on you. Approve to publish it. Dismiss to send it back.',
  done: 'Finished work. Nothing is being asked of you.',
  output: 'Reference output. Nothing is being asked of you.',
};

/**
 * Mock 3a: every row says "why here · …" under it.
 *
 * ACTION_TEXT says what the two buttons do. This says why it surfaced at all,
 * which is a different question and the one he asks first. Lowercase because it
 * is a clause, not a sentence: the row reads "why here · someone is waiting".
 */
export const WHY_TEXT: Record<ApprovalKind, string> = {
  staged: 'a reply is written and unsent',
  decision: 'nobody else can make this call',
  gate: 'work is paused behind it',
  request: 'someone asked you directly',
  draft: 'a draft is waiting to go out',
  done: 'finished, kept for the record',
  output: 'reference only',
};

/** A blown deadline explains itself before its kind does. */
const WHY_OVERDUE = 'the deadline the agent set has passed';

const GLYPH: Record<ApprovalKind, string> = {
  staged: '\u2709',
  decision: '!',
  gate: '\u25d0',
  request: '!',
  draft: '!',
  done: '\u2713',
  output: '\u00b7',
};

/**
 * Money outranks the kind. A staged reply is an envelope until the reply is
 * about a refund, at which point what it is matters less than what it moves.
 */
const MONEY = /(invoice|refund|payment|stripe|pricing|quote|contract|proposal)/i;

/** Finished markers win over action markers, or a resolved request nags forever. */
const DONE = /(UNBLOCKED|RESOLVED|FINAL|COMPLETE)/i;

const ACTION: [RegExp, ApprovalKind, string][] = [
  [/STAGED/i, 'staged', 'staged · send it'],
  [/\bdecision\b|-decision-/i, 'decision', 'your call'],
  [/-gate-|\bgate\b/i, 'gate', 'gate'],
  [/-request-|\brequest\b/i, 'request', 'request'],
  [/-draft-|\bdraft\b/i, 'draft', 'draft to approve'],
];

/** `DELIVER-BEFORE-1430Z` → 14:30 UTC on the file's own day. */
function deadlineFrom(name: string, modifiedAt: string): string | null {
  const m = name.match(/DELIVER-BEFORE-(\d{2})(\d{2})Z/i);
  if (!m) return null;
  const day = new Date(modifiedAt);
  if (Number.isNaN(day.getTime())) return null;
  const at = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), Number(m[1]), Number(m[2]), 0, 0),
  );
  return at.toISOString();
}

export function classifyDeliverable(item: DeliverableItem, now = Date.now()): Classified {
  const name = item.name;
  const deadline = deadlineFrom(name, item.modifiedAt);
  const done = DONE.test(name);

  let ask: ApprovalKind = 'output';
  let label = 'output';
  let person = false;
  if (done) {
    ask = 'done';
    label = 'done';
  } else {
    for (const [re, k, l] of ACTION) {
      if (re.test(name)) {
        ask = k;
        label = l;
        // A staged reply and a routed request both have a human on the other
        // end. A gate, a decision and a draft are work waiting on him alone.
        person = k === 'staged' || k === 'request';
        break;
      }
    }
  }

  // A deadline is itself an ask. An agent that wrote DELIVER-BEFORE-1430Z is
  // waiting on him even when the filename carries no other marker, so a bare
  // deadline promotes the file into the queue rather than sitting in outputs.
  if (ask === 'output' && deadline && !done) {
    ask = 'request';
    label = 'due';
  }

  const needsYou = !done && ask !== 'output';
  const overdue = !!deadline && !done && Date.parse(deadline) < now;
  const money = MONEY.test(name) || MONEY.test(item.title ?? '');
  return {
    ...item,
    ask,
    needsYou,
    deadline,
    overdue,
    label,
    action: ACTION_TEXT[ask],
    person,
    glyph: money && needsYou ? '$' : GLYPH[ask],
    glyphTone: overdue
      ? 'err'
      : money && needsYou
        ? 'warn'
        : ask === 'staged'
          ? 'ok'
          : ask === 'gate' || ask === 'decision'
            ? 'warn'
            : 'dim',
    why: overdue ? WHY_OVERDUE : WHY_TEXT[ask],
  };
}

/**
 * The Conductor's rank: people first, then deadlines.
 *
 * Mock 3a labels the queue "ranked by the Conductor · people first, then
 * deadlines", and that ordering is a claim about what actually costs him.
 * A blown deadline is already damage, so it leads. After that a human waiting
 * on a reply outranks a machine-set deadline that has not yet passed, which
 * outranks work that is merely paused. Age only breaks ties inside a band.
 */
function conductorRank(c: Classified): number {
  if (c.overdue) return 0;
  if (c.person) return 1;
  if (c.deadline) return 2;
  return 3;
}

/**
 * Everything waiting on him, in the Conductor's order (see conductorRank).
 *
 * Overdue leads no matter how old it is: a deadline the agent set and missed
 * outranks a draft written five minutes ago, which is the whole point of a
 * queue rather than a feed. Newest-first only breaks ties within a band.
 */
export function needsYou(items: DeliverableItem[], now = Date.now()): Classified[] {
  return items
    .map((i) => classifyDeliverable(i, now))
    .filter((c) => c.needsYou)
    .sort(
      (a, b) =>
        conductorRank(a) - conductorRank(b) ||
        Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt),
    );
}
