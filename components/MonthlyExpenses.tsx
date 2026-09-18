'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { cardLabel } from '@/lib/cards';
import { cardTotals, categoryTotals, monthAfterRefresh, spendTotalCents, type SpendRow } from '@/lib/spend-report';
import { SharePie } from '@/components/SharePie';
import { ExpenditureReport } from '@/components/ExpenditureReport';
import { STATEMENT_UPLOADED, type StatementUploadedDetail } from '@/lib/statement-events';
import { SectionHead } from '@/components/terminal';

const usd = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const monthName = (month: string): string =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * Monthly expenses: the pie is per month, not a frozen
 * latest-month snapshot — stepping months redraws it from the ledger rows the
 * server handed down, and the full expenditure statement opens over the page.
 * With no statements uploaded it falls back to the declared set fees, honestly
 * labelled.
 */
export function MonthlyExpenses({
  rows,
  months,
  fallback,
  children,
}: {
  rows: SpendRow[];
  months: string[]; // ascending
  /** declared set fees in cents, used only when nothing has been uploaded */
  fallback: { category: string; totalCents: number }[];
  /** the statement uploader, rendered as the third column */
  children?: React.ReactNode;
}) {
  const live = rows.length > 0;
  const [month, setMonth] = useState<string | null>(() => monthAfterRefresh(null, [], months));
  const [open, setOpen] = useState(false);

  // An upload refreshes the server data under us, and React keeps this client
  // state across that refresh — so without this the month just submitted
  // showed up as an unselected chip while the pie kept drawing the old one.
  // Sync during render (no effect): the panel never paints the stale month.
  const [seenMonths, setSeenMonths] = useState<string[]>(months);
  if (seenMonths.length !== months.length || seenMonths.some((m, i) => m !== months[i])) {
    setSeenMonths(months);
    setMonth(monthAfterRefresh(month, seenMonths, months));
  }

  // A statement just uploaded from the panel below: go to the month it covered,
  // even one already in the ledger (a re-upload of a month not currently in view).
  // It is held until the refreshed rows actually carry that month, otherwise
  // the pie would briefly draw an empty one.
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    const onUploaded = (e: Event) => {
      const uploaded = (e as CustomEvent<StatementUploadedDetail>).detail?.months ?? [];
      if (uploaded.length > 0) setPending(uploaded[uploaded.length - 1]);
    };
    window.addEventListener(STATEMENT_UPLOADED, onUploaded);
    return () => window.removeEventListener(STATEMENT_UPLOADED, onUploaded);
  }, []);
  if (pending && months.includes(pending)) {
    setPending(null);
    if (pending !== month) setMonth(pending);
  }

  const index = month ? months.indexOf(month) : -1;

  const step = (delta: number) => {
    const next = months[index + delta];
    if (next) setMonth(next);
  };

  const cats = useMemo(
    () => (live ? categoryTotals(rows, month) : fallback),
    [live, rows, month, fallback],
  );
  const lanes = useMemo(() => cardTotals(rows, month), [rows, month]);
  // Last six months, plus the selected one when a back-dated statement lands
  // outside that window — the chosen chip is always on screen.
  const chips = useMemo(() => {
    const tail = months.slice(-6);
    return month && !tail.includes(month) ? [month, ...tail] : tail;
  }, [months, month]);
  const total = live ? spendTotalCents(rows, month) : fallback.reduce((s, c) => s + c.totalCents, 0);
  const maxCategory = Math.max(...cats.map((c) => c.totalCents), 1);
  const period = live ? (month ? monthName(month) : 'all time') : 'per month';

  return (
    <section className="mb-5">
      <SectionHead
        label="Monthly expenses · by category"
        count={live ? `${usd(total)} · ${period}` : `${usd(total)} /mo`}
      />

      {/* month switcher + the way in to the full statement */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={!live || index <= 0}
            aria-label="Previous month"
            className="pressable rounded-ctl border border-os-border-strong p-1 text-os-muted hover:bg-os-surface2 disabled:opacity-30"
          >
            <ChevronLeft className="h-3 w-3" strokeWidth={1.8} />
          </button>
          <div className="flex flex-wrap items-center gap-1">
            {chips.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonth(m)}
                data-lens="c" className={`pressable rounded-ctl border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${
 m === month
 ? 'border-os-accent text-os-accent'
 : 'border-os-border text-os-dim hover:bg-os-surface2'
 }`}
              >
                {monthName(m)}
              </button>
            ))}
            {!live && (
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-os-warn">
                set fees · upload a card statement for real months
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={!live || index < 0 || index >= months.length - 1}
            aria-label="Next month"
            className="pressable rounded-ctl border border-os-border-strong p-1 text-os-muted hover:bg-os-surface2 disabled:opacity-30"
          >
            <ChevronRight className="h-3 w-3" strokeWidth={1.8} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!live}
          data-lens="c" className="pressable inline-flex items-center gap-1.5 rounded-ctl border border-os-border-strong px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-accent hover:bg-os-surface2 disabled:text-os-dim disabled:opacity-40"
        >
          <Maximize2 className="h-3 w-3" strokeWidth={1.8} />
          View full expenditure statement
        </button>
      </div>

      <div className="grid items-stretch gap-3.5 lg:grid-cols-[1.15fr_1fr_0.85fr]">
        {/* where the money goes: share per category, for the chosen month */}
        <SharePie
          items={cats.map((c) => ({ key: c.category, label: c.category, value: c.totalCents }))}
          total={total}
          centerLabel={period}
          format={(cents) => usd(cents)}
          donutPx={190}
          ariaLabel="Monthly expenses by category"
        />

        <div className="flex flex-col justify-between rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="flex flex-col gap-2.5">
            {cats.length === 0 ? (
              <p className="py-3 text-center font-mono text-[10.5px] text-os-dim">Nothing spent this month.</p>
            ) : (
              cats.map((c) => (
                <div key={c.category}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 font-mono text-[11px]">
                    <span className="text-os-muted">{c.category}</span>
                    <span className="text-os-text">{usd(c.totalCents)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-sm-t bg-os-surface2">
                    <div
                      className="fill h-full bg-os-accent opacity-60"
                      style={{ width: `${(c.totalCents / maxCategory) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* the three card lanes, so the split is visible without opening the report */}
          {live && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-os-border pt-2.5">
              {lanes.map((l) => (
                <span key={l.card} className="font-mono text-[10px] text-os-dim">
                  {cardLabel(l.card)} <span className="text-os-muted">{usd(l.totalCents)}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {children}
      </div>

      {open && (
        <ExpenditureReport rows={rows} months={months} initialMonth={month} onClose={() => setOpen(false)} />
      )}
    </section>
  );
}
