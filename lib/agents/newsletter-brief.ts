import type { Newsletter } from '@/lib/connectors/beehiiv';

/**
 * What the list has actually done, assembled before the Newsletter Agent writes
 * a word. The draft should be aimed at evidence, not at vibes.
 *
 * The honesty rule here matters more than the arithmetic: with two sends there
 * is no such thing as a trend, and an agent that reports one would have the operator
 * writing to a pattern that does not exist. So the brief carries `confident`
 * and says out loud when it is guessing. `agents/newsletter/skill.md` decides
 * the voice and the format; this decides what is true.
 */
export type IssueRef = { id: string; title: string; openRate: number; clickRate: number };

export type NewsletterBrief = {
  sends: number;
  /** Enough history to draw a conclusion from. Below this, say so. */
  confident: boolean;
  medianOpenRate: number;
  medianClickRate: number;
  /** Best opens: what the subject line should learn from. */
  bestBySubject: IssueRef | null;
  /** Best clicks: what the body and the offer should learn from. */
  bestByBody: IssueRef | null;
  worst: IssueRef | null;
  unsubscribeWarning: string | null;
  /** Newest first, so the agent does not pitch the same idea twice. */
  recentTitles: string[];
  notes: string[];
};

/** Below this many sends, the numbers are anecdotes rather than evidence. */
export const MIN_SENDS_FOR_CONFIDENCE = 5;
/** A latest-send unsubscribe rate this many times the median is worth flagging. */
const UNSUB_SPIKE_MULTIPLE = 2;
/** ...but only once it is meaningful in absolute terms too. */
const UNSUB_SPIKE_FLOOR = 1;
const RECENT_TITLES = 6;

const round2 = (n: number): number => Math.round(n * 100) / 100;

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return round2(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}

const ref = (n: Newsletter): IssueRef => ({
  id: n.id,
  title: n.title,
  openRate: n.openRate,
  clickRate: n.clickRate,
});

const bestBy = (list: Newsletter[], pick: (n: Newsletter) => number): Newsletter | null =>
  list.length ? list.reduce((a, b) => (pick(b) > pick(a) ? b : a)) : null;

export function buildNewsletterBrief(newsletters: Newsletter[]): NewsletterBrief {
  const sends = newsletters.length;
  const notes: string[] = [];

  if (!sends) {
    return {
      sends: 0,
      confident: false,
      medianOpenRate: 0,
      medianClickRate: 0,
      bestBySubject: null,
      bestByBody: null,
      worst: null,
      unsubscribeWarning: null,
      recentTitles: [],
      notes: ['No sends on record yet, so there is nothing to learn from. Write to the audience the operator describes in the skill file, not to past performance.'],
    };
  }

  const byNewest = [...newsletters].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const medianOpenRate = median(newsletters.map((n) => n.openRate));
  const medianClickRate = median(newsletters.map((n) => n.clickRate));
  const confident = sends >= MIN_SENDS_FOR_CONFIDENCE;

  if (!confident) {
    notes.push(
      `Only ${sends} send${sends === 1 ? '' : 's'} on record, which is too few to call a pattern. Treat the numbers below as anecdotes, not evidence.`,
    );
  }

  // Opens judge the subject line; clicks judge whether the body earned the open.
  const topOpen = bestBy(newsletters, (n) => n.openRate);
  const topClick = bestBy(newsletters, (n) => n.clickRate);
  const worst = bestBy(newsletters, (n) => -n.openRate);

  let unsubscribeWarning: string | null = null;
  const latest = byNewest[0];
  const medianUnsub = median(newsletters.map((n) => n.unsubscribeRate));
  if (
    latest.unsubscribeRate >= UNSUB_SPIKE_FLOOR &&
    latest.unsubscribeRate > medianUnsub * UNSUB_SPIKE_MULTIPLE
  ) {
    unsubscribeWarning = `The last send ("${latest.title}") lost ${latest.unsubscribeRate}% of the list against a ${medianUnsub}% median. Something in it cost subscribers, so do not repeat its angle without a reason.`;
    notes.push(unsubscribeWarning);
  }

  if (confident && topClick && topClick.clickRate > medianClickRate * 1.5) {
    notes.push(`"${topClick.title}" pulled ${topClick.clickRate}% clicks against a ${medianClickRate}% median. Whatever it asked readers to do, that ask works.`);
  }

  return {
    sends,
    confident,
    medianOpenRate,
    medianClickRate,
    bestBySubject: topOpen ? ref(topOpen) : null,
    bestByBody: topClick ? ref(topClick) : null,
    worst: worst ? ref(worst) : null,
    unsubscribeWarning,
    recentTitles: byNewest.slice(0, RECENT_TITLES).map((n) => n.title),
    notes,
  };
}

/** One-line run summary the OS can show without asking the model anything. */
export function briefSummary(b: NewsletterBrief): string {
  if (!b.sends) return 'No Beehiiv sends on record yet, so the draft has no performance history behind it.';
  const conf = b.confident ? 'enough history to aim at' : `only ${b.sends} sends, treat as anecdote`;
  return `${b.sends} sends · median ${b.medianOpenRate}% open / ${b.medianClickRate}% click · ${conf}${b.unsubscribeWarning ? ' · unsubscribe spike flagged' : ''}`;
}
