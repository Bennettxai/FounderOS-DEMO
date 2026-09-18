import type { BrandDeal } from '@/lib/schemas';

/**
 * What the Brand Deal Agent is allowed to raise, and how loudly.
 *
 * The judgment lives here rather than in the prompt on purpose. "This deal is
 * bleeding money" is a rule with a right answer, and a rule can be tested; the
 * model's job is the wording and the negotiating posture, which is what
 * `agents/brand-deals/skill.md` governs. Keeping the two apart means the operator can
 * rewrite the voice without touching what counts as urgent, and the agent can
 * never invent an action for a deal that does not warrant one.
 */
export type DealActionKind =
  | 'overdue'
  | 'chase-payment'
  | 'deadline-soon'
  | 'follow-up-due'
  | 'needs-price'
  | 'stale-inbound';

/** Higher wins. Money already earned outranks money not yet agreed. */
export const URGENCY: Record<DealActionKind, number> = {
  overdue: 100,
  'chase-payment': 80,
  'deadline-soon': 60,
  'follow-up-due': 40,
  'needs-price': 30,
  'stale-inbound': 20,
};

export type DealAction = {
  dealId: string;
  brand: string;
  kind: DealActionKind;
  urgency: number;
  detail: string;
  notionUrl: string;
};

/** Statuses where the deliverable is already out of the operator's hands. */
const DELIVERED = new Set(['Delivered', 'Invoiced', 'Approved', 'Paid']);
/** Statuses nobody should be chased about. */
const DEAD = new Set(['Declined', 'Paused']);

const DAY_MS = 86_400_000;
const DEADLINE_WARNING_DAYS = 7;
/** Inbound older than this without movement has gone cold. */
const STALE_INBOUND_DAYS = 3;

const usd = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/** Whole days from `iso` to `today`; positive means `iso` is in the past. */
function daysAgo(iso: string, today: string): number | null {
  const then = Date.parse(iso);
  const now = Date.parse(`${today}T00:00:00.000Z`);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return null;
  return Math.floor((now - then) / DAY_MS);
}

/**
 * Turn the pipeline into a ranked list of things to actually do today.
 *
 * `today` is passed in rather than read from the clock so the same pipeline
 * always produces the same actions in a test, and so a run can be replayed.
 */
export function triageDeals(deals: BrandDeal[], today: string): DealAction[] {
  const actions: DealAction[] = [];

  for (const d of deals) {
    // Placeholder rows exist only so the board is not blank before
    // NOTION_API_KEY is planted. Chasing a fake brand would be worse than
    // showing nothing.
    if (d.seeded) continue;
    if (DEAD.has(d.status)) continue;

    const raise = (kind: DealActionKind, detail: string) =>
      actions.push({ dealId: d.id, brand: d.brand, kind, urgency: URGENCY[kind], detail, notionUrl: d.notionUrl });

    const delivered = DELIVERED.has(d.status);

    if (d.deadline && !delivered) {
      const late = daysAgo(d.deadline, today);
      if (late !== null && late > 0) {
        raise('overdue', `Deadline was ${d.deadline}, ${late} day${late === 1 ? '' : 's'} ago, and it is still ${d.status}.`);
      } else if (late !== null && -late <= DEADLINE_WARNING_DAYS) {
        raise('deadline-soon', `Due ${d.deadline}, in ${-late} day${-late === 1 ? '' : 's'}, currently ${d.status}.`);
      }
    }

    // Work that shipped and was billed but never landed. This is the only
    // category that is purely the operator's money sitting in someone else's account.
    if (!d.paidInFull && (d.status === 'Invoiced' || d.status === 'Approved')) {
      const amount = d.amountAgreedUsd ?? d.dealValueUsd;
      raise('chase-payment', `${d.status} and unpaid${amount ? ` (${usd(amount)})` : ''}. Chase the invoice.`);
    }

    if (d.followUpDate) {
      const due = daysAgo(d.followUpDate, today);
      if (due !== null && due >= 0) raise('follow-up-due', `Follow-up was set for ${d.followUpDate}.`);
    }

    if (d.status === 'Negotiating' && d.amountAgreedUsd === null) {
      const opener = d.suggestedRateUsd ?? d.budgetUsd;
      raise(
        'needs-price',
        opener
          ? `Negotiating with no agreed number. Open at ${usd(opener)}.`
          : 'Negotiating with no agreed number and no suggested rate to open from.',
      );
    }

    if (d.status === 'New') {
      const age = daysAgo(d.lastEdited, today);
      if (age !== null && age >= STALE_INBOUND_DAYS) {
        raise('stale-inbound', `Inbound has sat ${age} days with no movement.`);
      }
    }
  }

  // Stable within a tie: keep pipeline order so the same run reads the same way.
  return actions.sort((a, b) => b.urgency - a.urgency);
}

/** One-line run summary: what the agent found, without the model's help. */
export function triageSummary(actions: DealAction[], dealCount: number): string {
  if (!actions.length) return `${dealCount} deals, nothing needs you today.`;
  const top = actions[0];
  const money = actions.filter((a) => a.kind === 'chase-payment').length;
  const late = actions.filter((a) => a.kind === 'overdue').length;
  const parts = [`${actions.length} action${actions.length === 1 ? '' : 's'} across ${dealCount} deals`];
  if (late) parts.push(`${late} overdue`);
  if (money) parts.push(`${money} unpaid`);
  parts.push(`first: ${top.brand} (${top.kind})`);
  return parts.join(' · ');
}
