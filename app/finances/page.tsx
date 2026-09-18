import { ArrowDownLeft, ArrowUpRight, Scale, Landmark, Send } from 'lucide-react';
import { configuredProcessors, monthToDateIncome, stripeMtdForKey, stripeSnapshot, wiseOutgoing, paykitMonthToDateIncome } from '@/lib/connectors/payments';
import {
  incomeAccounts,
  totalIncome,
  totalIncomeUpper,
  totalExpenses,
  expensesByCategory,
  net,
  DECLARED_EXPENSES,
} from '@/lib/finances';
import type { IncomeBand } from '@/lib/finances';
import { openLedger } from '@/lib/ledger';
import { openPaykitHistory, type PaykitHistory } from '@/lib/paykit-history';
import type { SpendRow } from '@/lib/spend-report';
import { openBankStore } from '@/lib/bank';
import { businessSeries } from '@/lib/bank-statements';
import { PageHeader } from '@/components/PageHeader';
import { StatementUploader } from '@/components/StatementUploader';
import { MonthlyExpenses } from '@/components/MonthlyExpenses';
import { BusinessIncomeChart } from '@/components/BusinessIncomeChart';
import { Badge, Label, SectionHead } from '@/components/terminal';
import { Rise } from '@/components/motion';
import { CountUp } from '@/components/CountUp';

export const dynamic = 'force-dynamic';

const usd = (n: number, cents = false) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents ? 2 : 0 });

function ago(unix: number): string {
  const mins = Math.round((Date.now() - unix * 1000) / 60_000);
  if (mins < 60) return `${Math.max(0, mins)}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default async function FinancesPage() {
  const stripeKeyed = configuredProcessors(process.env).some((p) => p.id === 'stripe' && p.configured);

  // Stripe is only "live" when the API actually answers — a present-but-invalid
  // key (or a server env missing it) stays honest pending, never a fake live.
  let stripeLive = false;
  let mtdUsd: number | null = null;
  let available = 0;
  let pending = 0;
  let recent: { amount: number; currency: string; description: string; created: number }[] = [];
  if (stripeKeyed) {
    const [mtd, snap] = await Promise.all([
      monthToDateIncome().catch(() => null),
      stripeSnapshot().catch(() => null),
    ]);
    if (snap) {
      stripeLive = true;
      available = (snap.available[0]?.amount ?? 0) / 100;
      pending = (snap.pending[0]?.amount ?? 0) / 100;
      recent = snap.recentCharges;
    }
    mtdUsd = mtd ? mtd.amountCents / 100 : null;
  }

  // Which processors have keys (honest config), so non-Stripe cards show
  // "key set · pull pending" vs "connect →" rather than a misleading live badge.
  const configuredMap = Object.fromEntries(configuredProcessors(process.env).map((p) => [p.id, p.configured]));
  // Live month-to-date income per account (null when unkeyed): PayKit via
  // its customers API, Vantage's own Stripe via the charges API.
  // The PayKit pull is handed a snapshot store, so this render both READS
  // /customers and keeps it. A month bracketed by two stored snapshots comes
  // back exact rather than bounded. See lib/paykit-history.ts and OS-658.
  let fbHistory: PaykitHistory | null = null;
  try {
    fbHistory = openPaykitHistory();
  } catch {
    fbHistory = null; // No writable data dir — the band below still renders.
  }
  let fbAa: Awaited<ReturnType<typeof paykitMonthToDateIncome>> = null;
  let stripeMer: Awaited<ReturnType<typeof stripeMtdForKey>> = null;
  try {
    [fbAa, stripeMer] = await Promise.all([
      paykitMonthToDateIncome(process.env.PAYKIT_LC_KEY, undefined, fbHistory ?? undefined).catch(() => null),
      stripeMtdForKey(process.env.STRIPE_VANTAGE_KEY).catch(() => null),
    ]);
  } finally {
    fbHistory?.close();
  }
  // A PayKit month the snapshots do not reach back before stays a BAND, not a
  // number: the API alone cannot split a repeat buyer's lifetime spend across
  // months, so the card shows "floor – ceiling" rather than the old confident
  // (and, for six months, inflated) single figure. See OS-655.
  const liveIncomeUsd: Record<string, number | IncomeBand> = {};
  if (fbAa != null) liveIncomeUsd['paykit-lc'] = fbAa;
  if (stripeMer != null) liveIncomeUsd['stripe-vantage'] = stripeMer.amountCents / 100;
  const accounts = incomeAccounts({ connected: stripeLive, mtdUsd }, configuredMap, liveIncomeUsd);
  // Outgoing Wise transfers — null (no Wise key) hides the section entirely.
  const wiseOut = await wiseOutgoing(process.env).catch(() => null);
  const incomeMtd = totalIncome(accounts);
  // Expenses from the uploaded statement ledger when present; the DECLARED set
  // fees otherwise (Marco CSM — subscriptions arrive via statement upload).
  // Every out-row goes to the client so the pie and the full expenditure
  // statement can be recomputed per month without another round trip.
  let ledgerRows: SpendRow[] = [];
  let ledgerMonths: string[] = [];
  let ledgerSpend: { category: string; total: number }[] = [];
  let ledgerMonth: string | null = null;
  try {
    const ledger = openLedger();
    ledgerRows = ledger.allRows();
    ledgerMonths = ledger.monthsAscending();
    ledgerSpend = ledger.monthly();
    ledgerMonth = ledger.latestMonth();
    ledger.close();
  } catch {
    ledgerRows = [];
    ledgerMonths = [];
    ledgerSpend = [];
  }
  const expensesLive = ledgerSpend.length > 0;
  // Per-business income from uploaded bank statements (Vantage, General Ops…).
  let bankSeries: ReturnType<typeof businessSeries> = [];
  try {
    const bank = openBankStore();
    bankSeries = businessSeries(bank.all());
    bank.close();
  } catch {
    bankSeries = [];
  }
  // "2026-06" → "Jun 2026" for an honest period label on the uploaded figures.
  const monthLabel = ledgerMonth
    ? new Date(`${ledgerMonth}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    : null;
  const expenses = expensesLive ? ledgerSpend.reduce((s, c) => s + c.total, 0) : totalExpenses(DECLARED_EXPENSES);
  const netMonthly = net(incomeMtd, expenses);
  const liveCount = accounts.filter((a) => a.live).length;
  // Scale bars by the ceiling so a bounded account is not drawn as if its floor
  // were the whole story; the printed figure still leads with the floor.
  const maxAccount = Math.max(...accounts.map((a) => a.incomeUpper ?? a.income ?? 0), 1);
  const incomeMtdUpper = totalIncomeUpper(accounts);

  return (
    <div>
      <PageHeader
        eyebrow="every processor, one view"
        title="Finances"
        right={
          <Badge tone={netMonthly >= 0 ? 'ok' : 'err'}>
            {netMonthly >= 0 ? '+' : '−'}
            {usd(Math.abs(netMonthly))} net /mo
          </Badge>
        }
      />

      {/* Summary tiles — slim single-line rows so the page opens condensed */}
      <section className="mb-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Rise i={0} className="rise-card flex flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Income · MTD</Label>
            <ArrowDownLeft className="h-3 w-3 text-os-ok" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[16px] font-semibold leading-none tracking-[-0.02em] text-os-ok">
              <CountUp value={incomeMtd} kind="usd" />
              {/* The headline leads with the proven floor. When a source could
                  only bound its month, the ceiling rides alongside instead of
                  being quietly folded in. */}
              {incomeMtdUpper > incomeMtd ? (
                <span className="text-os-dim"> – {usd(incomeMtdUpper)}</span>
              ) : null}
            </span>
            <span className="min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-os-dim">
              {liveCount}/{accounts.length} live
            </span>
          </div>
        </Rise>

        <Rise i={1} className="rise-card flex flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Expenses · /mo</Label>
            <ArrowUpRight className="h-3 w-3 text-os-err" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[16px] font-semibold leading-none tracking-[-0.02em]"><CountUp value={expenses} kind="usd" /></span>
            <span
              className={`min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] ${expensesLive ? 'text-os-ok' : 'text-os-warn'}`}
            >
              {expensesLive ? `uploaded · ${monthLabel}` : 'set fees · card subs via statement'}
            </span>
          </div>
        </Rise>

        <Rise i={2} className="rise-card flex flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Net · /mo</Label>
            <Scale className="h-3 w-3 text-os-accent" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`font-mono text-[16px] font-semibold leading-none tracking-[-0.02em] ${netMonthly >= 0 ? 'text-os-ok' : 'text-os-err'}`}
            >
              {netMonthly >= 0 ? '' : '−'}
              <CountUp value={Math.abs(netMonthly)} kind="usd" />
            </span>
            <span className="min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-os-dim">in − out</span>
          </div>
        </Rise>

        <Rise i={3} className="rise-card flex flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Stripe balance</Label>
            <Landmark className="h-3 w-3 text-os-accent" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[16px] font-semibold leading-none tracking-[-0.02em]">
              {stripeLive ? <CountUp value={available} kind="usdCents" /> : '—'}
            </span>
            <span className="min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-os-dim">
              {stripeLive ? `${usd(pending, true)} pending` : 'connect Stripe'}
            </span>
          </div>
        </Rise>
      </section>

      {/* Income by processor */}
      {/* Income by business — from uploaded bank statements, with a range dropdown */}
      {bankSeries.length > 0 && (
        <Rise as="section" i={4} className="mb-5">
          <SectionHead label="Income · by business" count="bank deposits" />
          <div className="grid gap-3.5 lg:grid-cols-2">
            {bankSeries.map((s) => (
              <BusinessIncomeChart key={s.business} series={s} />
            ))}
          </div>
        </Rise>
      )}

      {/* Monthly expenses by category, month by month (client-side) */}
      <Rise i={5}>
      <MonthlyExpenses
        rows={ledgerRows}
        months={ledgerMonths}
        fallback={expensesByCategory(DECLARED_EXPENSES).map((c) => ({
          category: c.category,
          totalCents: Math.round(c.total * 100),
        }))}
      >
        {/* Statement ingestion: pick a card lane, drop a CSV or PDF */}
        <StatementUploader />
      </MonthlyExpenses>
      </Rise>

      <Rise as="section" i={6} className="mb-5">
        <SectionHead label="Income · by processor" count={`${liveCount}/${accounts.length} live`} />
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => (
            <div key={a.id} data-lens="r" className="pressable is-row rounded-lg-t border border-os-border bg-os-surface px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[13px] font-semibold">{a.label}</div>
                  <div className="mt-0.5 font-mono text-[9.5px] text-os-dim">{a.processor}</div>
                </div>
                {a.live ? (
                  <Badge tone="ok">
                    <span className="dot ok pulse mr-1 inline-block" /> live
                  </Badge>
                ) : a.configured ? (
                  <Badge tone="warn">key set</Badge>
                ) : (
                  <Badge ghost>connect →</Badge>
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="font-mono text-[18px] font-semibold tracking-[-0.02em]">
                  {a.income != null ? usd(a.income) : '—'}
                  {a.incomeUpper != null ? (
                    <span className="text-os-dim"> – {usd(a.incomeUpper)}</span>
                  ) : null}
                </span>
                <span className="font-mono text-[9.5px] text-os-dim">
                  {a.live ? 'this month' : a.configured ? 'pull pending' : 'awaiting key'}
                </span>
              </div>
              {/* A bounded month says so out loud rather than printing one
                  confident number the source cannot actually support. */}
              {a.unsplittableCustomers > 0 ? (
                <div className="mt-1 font-mono text-[9.5px] text-os-dim">
                  {a.unsplittableCustomers} repeat {a.unsplittableCustomers === 1 ? 'customer' : 'customers'} · split unavailable
                </div>
              ) : null}
              <div className="mt-2 h-1 overflow-hidden rounded-sm-t bg-os-surface2">
                {/* Floor solid, the unprovable remainder faint on top. */}
                <div className="flex h-full">
                  <div
                    className="h-full bg-os-accent opacity-60"
                    style={{ width: `${a.income != null ? (a.income / maxAccount) * 100 : 0}%` }}
                  />
                  <div
                    className="h-full bg-os-accent opacity-20"
                    style={{
                      width: `${a.incomeUpper != null ? ((a.incomeUpper - (a.income ?? 0)) / maxAccount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Rise>

      {/* Recent income — real Stripe charges */}
      {stripeLive && recent.length > 0 && (
        <Rise as="section" i={7} className="mb-5">
          <SectionHead label="Recent income" count="Stripe · live" />
          <ul className="space-y-1.5">
            {recent.map((c, i) => (
              <li
                key={`${c.created}-${i}`}
                data-lens="r" className="pressable is-row flex items-center gap-3.5 rounded-lg-t border border-os-border bg-os-surface px-4 py-3"
              >
                <span className="font-mono text-[15px] font-semibold text-os-ok">+{usd(c.amount / 100, true)}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-os-muted">{c.description}</span>
                <span className="shrink-0 font-mono text-[11px] text-os-dim">{ago(c.created)}</span>
              </li>
            ))}
          </ul>
      </Rise>
      )}
      {/* Outgoing transfers — Wise (hidden entirely until a Wise key lands) */}
      {wiseOut && (
        <Rise as="section" i={8}>
          <SectionHead label="Outgoing · Wise" count={`${wiseOut.length} transfer${wiseOut.length === 1 ? '' : 's'}`} />
          {wiseOut.length === 0 ? (
            <div className="rounded-lg-t border border-os-border bg-os-surface px-4 py-3 font-mono text-[11px] text-os-dim">
              Wise connected · no recent outgoing transfers
            </div>
          ) : (
            <ul className="space-y-1.5">
              {wiseOut.map((t, i) => (
                <li
                  key={`${t.created}-${i}`}
                  data-lens="r" className="pressable is-row flex items-center gap-3.5 rounded-lg-t border border-os-border bg-os-surface px-4 py-3"
                >
                  <Send className="h-[15px] w-[15px] shrink-0 text-os-err" strokeWidth={1.8} />
                  <span className="font-mono text-[15px] font-semibold text-os-err">
                    −{(t.amountCents / 100).toLocaleString('en-US', { style: 'currency', currency: t.currency })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-os-muted">{t.reference ?? t.status}</span>
                  <span className="shrink-0 font-mono text-[11px] text-os-dim">{t.status}</span>
                </li>
              ))}
            </ul>
          )}
      </Rise>
      )}

    </div>
  );
}
