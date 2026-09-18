/**
 * The contact governor: whether a brand deal thread may be contacted at all.
 *
 * Ported from the deal-state model in the partner agency's brand deal autopilot (skill
 * Section 9b), which the operator handed over.
 *
 * This is in code rather than in the prompt deliberately. "Never bump a ghosted
 * thread a sixth time" and "one revival per brand per six months" are hard
 * limits protecting the operator's sender reputation and his relationships, and a
 * prompt is a suggestion that a model can talk itself out of. The skill file
 * governs what a bump SAYS; this governs whether one is allowed to exist.
 *
 * Every refusal carries a reason, because an agent that silently declines to
 * act looks identical to one that is broken.
 */
export type DealState =
  /** Their message is the latest. Ours to answer. */
  | 'live-ball-ours'
  /** Our message is the latest and still fresh. */
  | 'live-ball-theirs'
  /** Our message is the latest and has gone quiet. */
  | 'stalled'
  /** Bumped out, or long silence. One revival left, at most. */
  | 'ghosted'
  /** They said no, or we walked. They can reopen; we never do. */
  | 'lost'
  /** Bounce, lookalike domain, blast, spam, or a failed revival. */
  | 'dead'
  | 'closed-won'
  /** Receipts, newsletters, platform notices. */
  | 'not-a-deal'
  | 'needs-classification';

export type ThreadState = {
  state: DealState;
  /** Calendar days since the last message either way. */
  daysSinceLastMessage: number;
  bumpsUsed: number;
  /** Calendar days since this brand was last revived, or null if never. */
  daysSinceLastRevival: number | null;
  /** True when the latest outbound was written by the operator, not the agent. */
  humanHandled: boolean;
};

export type ContactAction = 'reply-now' | 'wait' | 'bump' | 'revival' | 'none';

export type ContactDecision = { allowed: boolean; action: ContactAction; reason: string };

/** Five bumps is the hard ceiling. Six is spam. */
export const MAX_BUMPS = 5;
/** Business days of silence before a bump is earned. */
export const BUMP_INTERVAL_BUSINESS_DAYS = 3;
/** A ghosted thread must age this long before a revival is allowed. */
export const REVIVAL_MIN_DAYS = 30;
/** And a brand may only be revived once per this window. */
export const REVIVAL_COOLDOWN_DAYS = 180;

const DAY_MS = 86_400_000;

/**
 * Weekdays between two ISO dates, excluding the start day. Bump cadence is
 * quoted in business days, and treating a Friday send as "3 days old" on Monday
 * is how an automation ends up bumping twice in one working week.
 */
export function businessDaysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00.000Z`);
  const to = Date.parse(`${toIso}T00:00:00.000Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  let count = 0;
  for (let t = from + DAY_MS; t <= to; t += DAY_MS) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

const no = (action: ContactAction, reason: string): ContactDecision => ({ allowed: false, action, reason });
const yes = (action: ContactAction, reason: string): ContactDecision => ({ allowed: true, action, reason });

export function contactDecision(thread: ThreadState, _today: string): ContactDecision {
  // Overrides everything, including a thread that is otherwise ours to answer:
  // if the operator is in there himself, the agent stepping in would talk over him.
  if (thread.humanHandled) {
    return no('none', 'the operator is handling this thread himself, so the agent stays out of it entirely.');
  }

  switch (thread.state) {
    case 'live-ball-ours':
      return yes('reply-now', 'Their message is the latest. Reply today, this is top priority.');

    case 'live-ball-theirs':
      return no('wait', 'Our message is the latest and still fresh. Waiting is the move.');

    case 'stalled': {
      if (thread.bumpsUsed >= MAX_BUMPS) {
        return no('none', `Already bumped ${thread.bumpsUsed} times. The ceiling is ${MAX_BUMPS}, so this is ghosted, not stalled.`);
      }
      if (thread.daysSinceLastMessage < BUMP_INTERVAL_BUSINESS_DAYS) {
        return no('wait', `Last message was ${thread.daysSinceLastMessage} days ago. A bump is earned at ${BUMP_INTERVAL_BUSINESS_DAYS} business days.`);
      }
      return yes('bump', `Silent ${thread.daysSinceLastMessage} days, bump ${thread.bumpsUsed + 1} of ${MAX_BUMPS}. Keep it short and alternate light and warm.`);
    }

    case 'ghosted': {
      if (thread.daysSinceLastMessage < REVIVAL_MIN_DAYS) {
        return no('none', `Ghosted and only ${thread.daysSinceLastMessage} days old. A revival is not allowed until ${REVIVAL_MIN_DAYS} days.`);
      }
      if (thread.daysSinceLastRevival !== null && thread.daysSinceLastRevival < REVIVAL_COOLDOWN_DAYS) {
        return no('none', `This brand was already revived ${thread.daysSinceLastRevival} days ago. One revival per brand per ${REVIVAL_COOLDOWN_DAYS} days.`);
      }
      return yes(
        'revival',
        'Eligible for exactly one revival, and only with a fresh angle: a new number, a new offer shape, or something that changed on their side. "Just circling back" is bump six, not a revival.',
      );
    }

    case 'lost':
      return no('none', 'They said no or we walked. They can reopen this; we never do.');

    case 'dead':
      return no('none', 'Dead thread (bounce, blast, spam, or a failed revival). Never contact.');

    case 'closed-won':
      return no('none', 'Signed, so it leaves negotiation. Execution cadence and the 60 day renewal touch apply instead.');

    case 'not-a-deal':
      return no('none', 'Not a deal. Receipts, newsletters and platform notices never enter the pipeline.');

    case 'needs-classification':
    default:
      return no('none', 'Unclassified, so it gets no automated contact until a human states what it is.');
  }
}
