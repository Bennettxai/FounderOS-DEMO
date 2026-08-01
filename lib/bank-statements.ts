/**
 * Bank checking-statement summaries (pure). We don't parse every transaction
 * line — bank descriptions are generic transfer-speak — we pull each statement's
 * reliable per-period totals: income (Total Credits), outflow (Total Debits),
 * the account/business, and the month. That powers a per-business income chart.
 */

export type BankSummary = {
  account: string; // last-4, e.g. '4219'
  business: string; // 'General Operations' | 'Vantage'
  month: string; // 'YYYY-MM' (from Statement Date)
  creditsCents: number; // income / deposits this period
  debitsCents: number; // outflow this period (positive magnitude)
  netCents: number; // credits − debits
};

export type MonthPoint = { month: string; creditsCents: number; debitsCents: number; netCents: number };
export type BusinessSeries = { business: string; months: MonthPoint[] };

/** Range options for the income chart — months of history (30d≈1, 60d≈2, …). */
export type IncomeRange = 1 | 2 | 3 | 6 | 12 | 'all';

// First $-amount after a label (the value sits on the next line in pdftotext).
function amountAfter(text: string, labelRe: RegExp): number | null {
  const idx = text.search(labelRe);
  if (idx < 0) return null;
  const m = text.slice(idx).match(/(-?)\$?([\d,]+\.\d{2})/);
  if (!m) return null;
  const n = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return m[1] === '-' ? -n : n;
}

/** Parse one statement's pdftotext into a summary, or null if it isn't one. */
export function parseBankStatementSummary(text: string): BankSummary | null {
  const account = text.match(/Account Ending:\s*\*?(\d{3,4})/i)?.[1];
  const business = text.match(/Account Name:\s*([^\n]+?)(?:\s{2,}|\n|$)/i)?.[1]?.trim();
  const dm = text.match(/Statement Date:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  const month = dm ? `${dm[3]}-${dm[1].padStart(2, '0')}` : null;
  const credits = amountAfter(text, /Total Credits This Period/i);
  const debits = amountAfter(text, /Total Debits This Period/i);
  if (!account || !business || !month || credits == null || debits == null) return null;
  const creditsCents = Math.round(credits * 100);
  const debitsCents = Math.abs(Math.round(debits * 100));
  return { account, business, month, creditsCents, debitsCents, netCents: creditsCents - debitsCents };
}

/** Group summaries into per-business monthly series (months ascending, deduped). */
export function businessSeries(summaries: BankSummary[]): BusinessSeries[] {
  const byBiz = new Map<string, Map<string, BankSummary>>();
  for (const s of summaries) {
    const months = byBiz.get(s.business) ?? new Map<string, BankSummary>();
    months.set(s.month, s); // dup month → latest wins
    byBiz.set(s.business, months);
  }
  return [...byBiz.entries()]
    .map(([business, months]) => ({
      business,
      months: [...months.values()]
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((s) => ({ month: s.month, creditsCents: s.creditsCents, debitsCents: s.debitsCents, netCents: s.netCents })),
    }))
    .sort((a, b) => a.business.localeCompare(b.business));
}

/** Income (credits) summed over the last `range` months ('all' = everything). */
export function rangeTotalCents(months: MonthPoint[], range: IncomeRange): number {
  const slice = range === 'all' ? months : months.slice(-range);
  return slice.reduce((s, m) => s + m.creditsCents, 0);
}
