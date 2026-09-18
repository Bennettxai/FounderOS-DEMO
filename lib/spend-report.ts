/**
 * Month-to-month expenditure report (pure). Takes the ledger's out-rows and
 * answers the questions the operator asks of a statement: what did each month cost,
 * per card; which merchants are recurring subscriptions; and which of those
 * stopped charging (i.e. got cancelled). No DB, no network, no LLM — the
 * grouping is deterministic so the same statements always read the same.
 */

import { CARD_LANES, type CardId } from '@/lib/cards';

export type SpendRow = {
  date: string; // YYYY-MM-DD
  description: string;
  amountCents: number;
  direction: 'in' | 'out';
  category: string;
  card: CardId;
};

export type MonthTotal = { month: string; totalCents: number; byCard: Record<CardId, number> };

export type Subscription = {
  merchant: string;
  card: CardId;
  /** the typical (median) charge — what it costs him a month */
  monthlyCents: number;
  /** the most recent charge, which may differ after a price change */
  latestCents: number;
  months: string[]; // ascending, deduped
  firstMonth: string;
  lastMonth: string;
  charges: number;
  status: 'active' | 'cancelled';
  category: string;
};

const monthOf = (date: string): string => date.slice(0, 7);

/** The calendar month before `month` ('2026-01' → '2025-12'). */
export function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * A stable merchant key. Statement descriptors carry per-charge noise — Amex
 * `*` reference codes, order/store numbers, terminal ids — that would split one
 * subscription into a dozen one-offs. Strip that, keep the leading words.
 */
export function normalizeMerchant(description: string): string {
  const raw = description.toUpperCase().trim();
  let s = raw.split('*')[0]; // ORBIT.COM*RT4G2 → ORBIT.COM
  s = s.replace(/[^A-Z0-9.& ]+/g, ' ');
  s = s.replace(/\b\d[\d.]*\b/g, ' '); // order / store / terminal numbers
  s = s.replace(/\s{2,}/g, ' ').trim();
  const tokens = s.split(' ').filter(Boolean).slice(0, 3);
  return tokens.length > 0 ? tokens.join(' ') : raw.replace(/\s+/g, ' ').trim() || description;
}

const zeroByCard = (): Record<CardId, number> =>
  Object.fromEntries(CARD_LANES.map((c) => [c.id, 0])) as Record<CardId, number>;

/** Spend per month (ascending), split across the card lanes. Income ignored. */
export function monthlyTotals(rows: SpendRow[]): MonthTotal[] {
  const byMonth = new Map<string, MonthTotal>();
  for (const r of rows) {
    if (r.direction !== 'out') continue;
    const month = monthOf(r.date);
    const entry = byMonth.get(month) ?? { month, totalCents: 0, byCard: zeroByCard() };
    entry.totalCents += r.amountCents;
    entry.byCard[r.card] = (entry.byCard[r.card] ?? 0) + r.amountCents;
    byMonth.set(month, entry);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

const median = (ns: number[]): number => {
  const s = [...ns].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

/**
 * Recurring merchants: charged in two or more distinct months on the same card,
 * at a steady amount (every charge within 25% of the median — enough slack for
 * a price rise or a usage-based plan, tight enough to reject a coffee shop).
 *
 * `latestMonth` is the newest month in the ledger. A subscription whose last
 * charge is older than the month before that has stopped billing — cancelled.
 * Active first, then most expensive; the cancelled ones list underneath.
 */
export function detectSubscriptions(rows: SpendRow[], latestMonth: string): Subscription[] {
  const groups = new Map<string, SpendRow[]>();
  for (const r of rows) {
    if (r.direction !== 'out') continue;
    const key = `${r.card}|${normalizeMerchant(r.description)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const grace = prevMonth(latestMonth);
  const subs: Subscription[] = [];
  for (const [key, group] of groups) {
    const months = [...new Set(group.map((r) => monthOf(r.date)))].sort();
    if (months.length < 2) continue;
    const amounts = group.map((r) => r.amountCents);
    const typical = median(amounts);
    if (typical <= 0) continue;
    if (amounts.some((a) => Math.abs(a - typical) > typical * 0.25)) continue;
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const lastMonth = months[months.length - 1];
    subs.push({
      merchant: key.slice(key.indexOf('|') + 1),
      card: group[0].card,
      monthlyCents: typical,
      latestCents: sorted[sorted.length - 1].amountCents,
      months,
      firstMonth: months[0],
      lastMonth,
      charges: group.length,
      status: lastMonth >= grace ? 'active' : 'cancelled',
      category: sorted[sorted.length - 1].category,
    });
  }

  return subs.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return b.monthlyCents - a.monthlyCents || a.merchant.localeCompare(b.merchant);
  });
}

/** What a single month went on, merchant by merchant, biggest first. */
export function topMerchants(
  rows: SpendRow[],
  month: string | null,
  limit = 25,
): { merchant: string; amountCents: number; count: number; card: CardId; category: string }[] {
  const totals = new Map<string, { merchant: string; amountCents: number; count: number; card: CardId; category: string }>();
  for (const r of rows) {
    if (r.direction !== 'out') continue;
    if (month && monthOf(r.date) !== month) continue;
    const merchant = normalizeMerchant(r.description);
    const entry = totals.get(merchant) ?? { merchant, amountCents: 0, count: 0, card: r.card, category: r.category };
    entry.amountCents += r.amountCents;
    entry.count += 1;
    totals.set(merchant, entry);
  }
  return [...totals.values()].sort((a, b) => b.amountCents - a.amountCents).slice(0, limit);
}

/** Total spend for a month (or all of it when `month` is null). */
export function spendTotalCents(rows: SpendRow[], month: string | null): number {
  return rows.reduce(
    (sum, r) => (r.direction === 'out' && (!month || monthOf(r.date) === month) ? sum + r.amountCents : sum),
    0,
  );
}

/** Per-category spend for a month (or all of it when `month` is null), biggest
    first. This is what redraws the pie when the operator steps through months. */
export function categoryTotals(
  rows: SpendRow[],
  month: string | null,
): { category: string; totalCents: number }[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (r.direction !== 'out') continue;
    if (month && monthOf(r.date) !== month) continue;
    totals.set(r.category, (totals.get(r.category) ?? 0) + r.amountCents);
  }
  return [...totals.entries()]
    .map(([category, totalCents]) => ({ category, totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents || a.category.localeCompare(b.category));
}

/** Spend split across the three card lanes. Every lane is reported even when it
    was silent that month, so a missing statement reads as $0 rather than as an
    absent lane. */
export function cardTotals(rows: SpendRow[], month: string | null): { card: CardId; totalCents: number }[] {
  const totals = new Map<CardId, number>(CARD_LANES.map((c) => [c.id, 0]));
  for (const r of rows) {
    if (r.direction !== 'out') continue;
    if (month && monthOf(r.date) !== month) continue;
    totals.set(r.card, (totals.get(r.card) ?? 0) + r.amountCents);
  }
  return CARD_LANES.map((c) => ({ card: c.id, totalCents: totals.get(c.id) ?? 0 }));
}

/**
 * Where the expenses view should point after the ledger changes underneath
 * it: an upload has to show the data that was just submitted.
 *
 * A month that was not in the list before is a month that was just uploaded,
 * so that is what belongs on screen: the newest of them when a statement
 * spans several, and a back-dated statement too, not just whatever is newest
 * overall. When the upload only added rows to months already there, the
 * current month stays put: the totals under it redraw on their own.
 */
export function monthAfterRefresh(
  current: string | null,
  previousMonths: string[],
  months: string[],
): string | null {
  const seen = new Set(previousMonths);
  const arrived = months.filter((m) => !seen.has(m));
  if (arrived.length > 0) return arrived[arrived.length - 1];
  if (current && months.includes(current)) return current;
  return months.length > 0 ? months[months.length - 1] : null;
}
