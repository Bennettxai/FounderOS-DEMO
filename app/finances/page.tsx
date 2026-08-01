import { ArrowDownLeft, ArrowUpRight, Scale, Landmark, Send } from 'lucide-react';
import { configuredProcessors, monthToDateIncome, stripeSnapshot, wiseOutgoing, fanbasisMonthToDateIncome } from '@/lib/connectors/payments';
import {
  incomeAccounts,
  totalIncome,
  totalExpenses,
  expensesByCategory,
  net,
  SAMPLE_EXPENSES,
} from '@/lib/finances';
import { openLedger } from '@/lib/ledger';
import { openBankStore } from '@/lib/bank';
import { businessSeries } from '@/lib/bank-statements';
import { PageHeader } from '@/components/PageHeader';
import { SharePie } from '@/components/SharePie';
import { StatementUploader } from '@/components/StatementUploader';
import { BusinessIncomeChart } from '@/components/BusinessIncomeChart';
import { Badge, Label, SectionHead } from '@/components/terminal';

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
  // Live FanBasis month-to-date income per account (null when unkeyed).
  const [fbAa, fbMer] = await Promise.all([
    fanbasisMonthToDateIncome(process.env.FANBASIS_LC_KEY).catch(() => null),
    fanbasisMonthToDateIncome(process.env.FANBASIS_VANTAGE_KEY).catch(() => null),
  ]);
  const liveIncomeUsd: Record<string, number> = {};
  if (fbAa != null) liveIncomeUsd['fanbasis-lc'] = fbAa;
  if (fbMer != null) liveIncomeUsd['fanbasis-vantage'] = fbMer;
  const accounts = incomeAccounts({ connected: stripeLive, mtdUsd }, configuredMap, liveIncomeUsd);
  // Outgoing Wise transfers — null (no Wise key) hides the section entirely.
  const wiseOut = await wiseOutgoing(process.env).catch(() => null);
  const incomeMtd = totalIncome(accounts);
  // Expenses from the uploaded statement ledger when present; seeded SAMPLE
  // otherwise (honest "sample" vs "uploaded" label below).
  let ledgerSpend: { category: string; total: number }[] = [];
  let ledgerMonth: string | null = null;
  try {
    const ledger = openLedger();
    ledgerSpend = ledger.monthly();
    ledgerMonth = ledger.latestMonth();
    ledger.close();
  } catch {
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
  const byCategory = expensesLive ? ledgerSpend : expensesByCategory(SAMPLE_EXPENSES);
  const expenses = expensesLive ? ledgerSpend.reduce((s, c) => s + c.total, 0) : totalExpenses(SAMPLE_EXPENSES);
  const netMonthly = net(incomeMtd, expenses);
  const liveCount = accounts.filter((a) => a.live).length;
  const maxAccount = Math.max(...accounts.map((a) => a.income ?? 0), 1);
  const maxCategory = Math.max(...byCategory.map((c) => c.total), 1);

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
        <div className="flex flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Income · MTD</Label>
            <ArrowDownLeft className="h-3 w-3 text-os-ok" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[16px] font-semibold leading-none tracking-[-0.02em] text-os-ok">
              {usd(incomeMtd)}
            </span>
            <span className="min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-os-dim">
              {liveCount}/{accounts.length} live
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Expenses · /mo</Label>
            <ArrowUpRight className="h-3 w-3 text-os-err" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[16px] font-semibold leading-none tracking-[-0.02em]">{usd(expenses)}</span>
            <span
              className={`min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] ${expensesLive ? 'text-os-ok' : 'text-os-warn'}`}
            >
              {expensesLive ? `uploaded · ${monthLabel}` : 'sample'}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Net · /mo</Label>
            <Scale className="h-3 w-3 text-os-accent" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`font-mono text-[16px] font-semibold leading-none tracking-[-0.02em] ${netMonthly >= 0 ? 'text-os-ok' : 'text-os-err'}`}
            >
              {netMonthly >= 0 ? '' : '−'}
              {usd(Math.abs(netMonthly))}
            </span>
            <span className="min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-os-dim">in − out</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-lg-t border border-os-border bg-os-surface px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Stripe balance</Label>
            <Landmark className="h-3 w-3 text-os-accent" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[16px] font-semibold leading-none tracking-[-0.02em]">
              {stripeLive ? usd(available, true) : '—'}
            </span>
            <span className="min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-os-dim">
              {stripeLive ? `${usd(pending, true)} pending` : 'connect Stripe'}
            </span>
          </div>
        </div>
      </section>

      {/* Income by processor */}
      {/* Income by business — from uploaded bank statements, with a range dropdown */}
      {bankSeries.length > 0 && (
        <section className="mb-5">
          <SectionHead label="Income · by business" count="bank deposits" />
          <div className="grid gap-3.5 lg:grid-cols-2">
            {bankSeries.map((s) => (
              <BusinessIncomeChart key={s.business} series={s} />
            ))}
          </div>
        </section>
      )}

      {/* Monthly expenses by category */}
      <section className="mb-5">
        <SectionHead
          label="Monthly expenses · by category"
          count={expensesLive && monthLabel ? `${usd(expenses)} · ${monthLabel}` : `${usd(expenses)} /mo`}
        />
        <div className="grid items-stretch gap-3.5 lg:grid-cols-[1.15fr_1fr_0.85fr]">
          {/* where the money goes — share per category */}
          <SharePie
            items={byCategory.map((c) => ({ key: c.category, label: c.category, value: Math.round(c.total * 100) }))}
            total={Math.round(expenses * 100)}
            centerLabel={expensesLive && monthLabel ? monthLabel : 'per month'}
            format={(cents) => usd(cents / 100)}
            donutPx={190}
            ariaLabel="Monthly expenses by category"
          />

          <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
            <div className="flex flex-col gap-2.5">
              {byCategory.map((c) => (
                <div key={c.category}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 font-mono text-[11px]">
                    <span className="text-os-muted">{c.category}</span>
                    <span className="text-os-text">{usd(c.total)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-sm-t bg-os-surface2">
                    <div className="h-full bg-os-accent opacity-60" style={{ width: `${(c.total / maxCategory) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Statement ingestion — upload a CSV to replace the sample figures */}
          <StatementUploader />
        </div>
      </section>

      <section className="mb-5">
        <SectionHead label="Income · by processor" count={`${liveCount}/${accounts.length} live`} />
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => (
            <div key={a.id} className="hoverable rounded-lg-t border border-os-border bg-os-surface px-4 py-3">
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
                </span>
                <span className="font-mono text-[9.5px] text-os-dim">
                  {a.live ? 'this month' : a.configured ? 'pull pending' : 'awaiting key'}
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-sm-t bg-os-surface2">
                <div
                  className="h-full bg-os-accent opacity-60"
                  style={{ width: `${a.income != null ? (a.income / maxAccount) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Outgoing transfers — Wise (hidden entirely until a Wise key lands) */}
      {wiseOut && (
        <section className="mb-5">
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
                  className="hoverable flex items-center gap-3.5 rounded-lg-t border border-os-border bg-os-surface px-4 py-3"
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
        </section>
      )}

      {/* Recent income — real Stripe charges */}
      {stripeLive && recent.length > 0 && (
        <section>
          <SectionHead label="Recent income" count="Stripe · live" />
          <ul className="space-y-1.5">
            {recent.map((c, i) => (
              <li
                key={`${c.created}-${i}`}
                className="hoverable flex items-center gap-3.5 rounded-lg-t border border-os-border bg-os-surface px-4 py-3"
              >
                <span className="font-mono text-[15px] font-semibold text-os-ok">+{usd(c.amount / 100, true)}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-os-muted">{c.description}</span>
                <span className="shrink-0 font-mono text-[11px] text-os-dim">{ago(c.created)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
