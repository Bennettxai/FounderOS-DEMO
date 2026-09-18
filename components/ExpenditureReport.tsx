'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Minimize2 } from 'lucide-react';
import { CARD_LANES, cardLabel, type CardId } from '@/lib/cards';
import {
  cardTotals,
  categoryTotals,
  detectSubscriptions,
  monthlyTotals,
  spendTotalCents,
  topMerchants,
  type SpendRow,
} from '@/lib/spend-report';
import { Badge, Label, SectionHead } from '@/components/terminal';

const usd = (cents: number, decimals = false) =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: decimals ? 2 : 0,
  });

const monthLabel = (month: string): string =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

const dayLabel = (date: string): string =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * The full expenditure statement (the operator): fullscreen, month to
 * month, every card lane, and every subscription including the ones he
 * cancelled. Pure client math over the ledger rows the page handed down — no
 * fetch, so stepping months is instant.
 */
export function ExpenditureReport({
  rows,
  months,
  initialMonth,
  onClose,
}: {
  rows: SpendRow[];
  months: string[]; // ascending
  initialMonth: string | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const latest = months.length > 0 ? months[months.length - 1] : null;
  const [month, setMonth] = useState<string | null>(initialMonth ?? latest);
  const index = month ? months.indexOf(month) : -1;

  const step = (delta: number) => {
    if (index < 0) return;
    const next = months[index + delta];
    if (next) setMonth(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const timeline = useMemo(() => monthlyTotals(rows), [rows]);
  const subs = useMemo(() => (latest ? detectSubscriptions(rows, latest) : []), [rows, latest]);
  const lanes = useMemo(() => cardTotals(rows, month), [rows, month]);
  const cats = useMemo(() => categoryTotals(rows, month), [rows, month]);
  const merchants = useMemo(() => topMerchants(rows, month, 40), [rows, month]);
  const charges = useMemo(
    () =>
      rows
        .filter((r) => r.direction === 'out' && (!month || r.date.slice(0, 7) === month))
        .sort((a, b) => b.amountCents - a.amountCents),
    [rows, month],
  );

  const monthTotal = spendTotalCents(rows, month);
  const peak = Math.max(...timeline.map((t) => t.totalCents), 1);
  const laneMax = Math.max(...lanes.map((l) => l.totalCents), 1);
  const catMax = Math.max(...cats.map((c) => c.totalCents), 1);
  const activeSubs = subs.filter((s) => s.status === 'active');
  const subsMonthly = activeSubs.reduce((sum, s) => sum + s.monthlyCents, 0);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-os-bg">
      <div className="mx-auto max-w-[1180px] px-6 py-6">
        {/* header */}
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-os-border pb-4">
          <div>
            <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.32em] text-os-dim">
              // full expenditure statement
            </div>
            <h1 className="text-[25px] font-bold uppercase tracking-[0.06em]">
              {month ? monthLabel(month) : 'All time'}
            </h1>
            <p className="mt-1 font-mono text-[10.5px] text-os-dim">
              {usd(monthTotal)} out · {charges.length} charges · {months.length} month
              {months.length === 1 ? '' : 's'} on file
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={index <= 0}
              aria-label="Previous month"
              className="pressable rounded-sm-t border border-os-border-strong p-1.5 text-os-muted hover:bg-os-surface2 disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={index < 0 || index >= months.length - 1}
              aria-label="Next month"
              className="pressable rounded-sm-t border border-os-border-strong p-1.5 text-os-muted hover:bg-os-surface2 disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={() => setMonth(null)}
              className={`pressable rounded-sm-t border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] ${
 month === null
 ? 'border-os-accent text-os-accent'
 : 'border-os-border-strong text-os-dim hover:bg-os-surface2'
 }`}
            >
              all time
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close expenditure statement"
              className="pressable rounded-sm-t border border-os-border-strong p-1.5 text-os-muted hover:bg-os-surface2"
            >
              <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* month to month */}
        <section className="mb-5">
          <SectionHead label="Month to month" count={`${timeline.length} months`} />
          <div className="rounded-lg-t border border-os-border bg-os-surface px-4 py-4">
            {timeline.length === 0 ? (
              <p className="py-3 text-center font-mono text-[10.5px] text-os-dim">No statements uploaded yet.</p>
            ) : (
              <div className="flex items-end gap-2 overflow-x-auto pb-1">
                {timeline.map((t) => {
                  const on = t.month === month;
                  return (
                    <button
                      key={t.month}
                      type="button"
                      onClick={() => setMonth(t.month)}
                      className="pressable group flex w-[64px] shrink-0 flex-col items-center gap-1.5"
                      title={`${monthLabel(t.month)} · ${usd(t.totalCents)}`}
                    >
                      <span className={`font-mono text-[9.5px] ${on ? 'text-os-text' : 'text-os-dim'}`}>
                        {usd(t.totalCents)}
                      </span>
                      <span className="flex h-[112px] w-full items-end">
                        <span
                          className={`lens-child w-full ${on ? 'bg-os-accent' : 'bg-os-accent opacity-30 group-hover:opacity-60'}`}
                          style={{ height: `${Math.max(2, (t.totalCents / peak) * 100)}%` }}
                        />
                      </span>
                      <span
                        className={`font-mono text-[9.5px] uppercase tracking-[0.1em] ${on ? 'text-os-accent' : 'text-os-dim'}`}
                      >
                        {monthLabel(t.month)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* the three lanes */}
        <section className="mb-5">
          <SectionHead label="By card · three lanes" count={month ? monthLabel(month) : 'all time'} />
          <div className="grid gap-3.5 lg:grid-cols-3">
            {lanes.map((l) => {
              const lane = CARD_LANES.find((c) => c.id === l.card);
              return (
                <div key={l.card} className="rounded-lg-t border border-os-border bg-os-surface px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label>{cardLabel(l.card as CardId)}</Label>
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-os-dim">
                      {monthTotal > 0 ? `${Math.round((l.totalCents / monthTotal) * 100)}%` : '—'}
                    </span>
                  </div>
                  <div className="mt-1.5 font-mono text-[19px] font-semibold leading-none tracking-[-0.02em]">
                    {usd(l.totalCents)}
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-sm-t bg-os-surface2">
                    <div className="h-full bg-os-accent opacity-60" style={{ width: `${(l.totalCents / laneMax) * 100}%` }} />
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-os-dim">{lane?.blurb ?? ''}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* subscriptions */}
        <section className="mb-5">
          <SectionHead
            label="Subscriptions · recurring charges"
            count={`${activeSubs.length} active · ${usd(subsMonthly)}/mo`}
          />
          <div className="rounded-lg-t border border-os-border bg-os-surface">
            {subs.length === 0 ? (
              <p className="px-4 py-6 text-center font-mono text-[10.5px] text-os-dim">
                Nothing recurring yet: a merchant needs charges in two or more months before it counts as a
                subscription.
              </p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-os-border text-left font-mono text-[9.5px] uppercase tracking-[0.16em] text-os-dim">
                    <th className="px-4 py-2 font-medium">Merchant</th>
                    <th className="px-4 py-2 font-medium">Card</th>
                    <th className="px-4 py-2 text-right font-medium">Per month</th>
                    <th className="px-4 py-2 font-medium">First seen</th>
                    <th className="px-4 py-2 font-medium">Last charge</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={`${s.card}|${s.merchant}`} className="border-b border-os-border/60 last:border-0">
                      <td className="px-4 py-2 font-mono text-[11px] text-os-text">
                        {s.merchant}
                        <span className="ml-2 text-os-dim">{s.category}</span>
                      </td>
                      <td className="px-4 py-2 font-mono text-[10.5px] text-os-muted">{cardLabel(s.card)}</td>
                      <td className="px-4 py-2 text-right font-mono text-[11px] text-os-text">
                        {usd(s.monthlyCents, true)}
                      </td>
                      <td className="px-4 py-2 font-mono text-[10.5px] text-os-dim">{monthLabel(s.firstMonth)}</td>
                      <td className="px-4 py-2 font-mono text-[10.5px] text-os-dim">{monthLabel(s.lastMonth)}</td>
                      <td className="px-4 py-2">
                        <Badge tone={s.status === 'active' ? 'ok' : 'default'}>
                          {s.status === 'active' ? 'active' : `cancelled ${monthLabel(s.lastMonth)}`}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* what the month went on */}
        <section className="mb-5 grid gap-3.5 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <SectionHead label="By category" count={usd(monthTotal)} />
            <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
              {cats.length === 0 ? (
                <p className="py-3 text-center font-mono text-[10.5px] text-os-dim">Nothing this month.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {cats.map((c) => (
                    <div key={c.category}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 font-mono text-[11px]">
                        <span className="text-os-muted">{c.category}</span>
                        <span className="text-os-text">{usd(c.totalCents)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-sm-t bg-os-surface2">
                        <div
                          className="h-full bg-os-accent opacity-60"
                          style={{ width: `${(c.totalCents / catMax) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <SectionHead label="Top merchants" count={`${merchants.length} of ${charges.length} charges`} />
            <div className="max-h-[420px] overflow-y-auto rounded-lg-t border border-os-border bg-os-surface">
              {merchants.length === 0 ? (
                <p className="px-4 py-6 text-center font-mono text-[10.5px] text-os-dim">Nothing this month.</p>
              ) : (
                merchants.map((m) => (
                  <div
                    key={`${m.card}|${m.merchant}`}
                    className="flex items-baseline justify-between gap-3 border-b border-os-border/60 px-4 py-2 last:border-0"
                  >
                    <span className="min-w-0 truncate font-mono text-[11px] text-os-text">{m.merchant}</span>
                    <span className="shrink-0 font-mono text-[10px] text-os-dim">
                      {cardLabel(m.card)} · {m.count}×
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-os-text">{usd(m.amountCents, true)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* every charge */}
        <section className="mb-8">
          <SectionHead label="Every charge" count={`${charges.length} rows`} />
          <div className="max-h-[520px] overflow-y-auto rounded-lg-t border border-os-border bg-os-surface">
            {charges.length === 0 ? (
              <p className="px-4 py-6 text-center font-mono text-[10.5px] text-os-dim">
                No charges for this period. Upload a statement from the finances page.
              </p>
            ) : (
              charges.map((r, i) => (
                <div
                  key={`${r.date}|${r.description}|${r.amountCents}|${i}`}
                  className="flex items-baseline gap-3 border-b border-os-border/60 px-4 py-2 last:border-0"
                >
                  <span className="w-[54px] shrink-0 font-mono text-[10px] text-os-dim">{dayLabel(r.date)}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-os-text">{r.description}</span>
                  <span className="shrink-0 font-mono text-[10px] text-os-dim">{r.category}</span>
                  <span className="w-[92px] shrink-0 font-mono text-[10px] text-os-dim">{cardLabel(r.card)}</span>
                  <span className="w-[84px] shrink-0 text-right font-mono text-[11px] text-os-text">
                    {usd(r.amountCents, true)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}
