'use client';

/**
 * Trading: the Robinhood accounts and the Phantom wallet as one slab in the
 * Brand Deals mould, big and boxy with the same tab as its model. The page floats as one surface, numerals rule, data owns
 * the chroma (one hue per account), the sleeve's value line is the hero with
 * the agent's reasoning beside it, hatched meters for the accounts, a
 * dot-matrix of position sizes, exactly ONE gradient insight card (the agent's
 * next move), open orders, a filterable trade log with a detail drawer, and
 * the limits editor at the foot.
 *
 * Monitor-only by design: the broker numbers arrive by push from the Markets
 * Agent runner (`agents/markets/run.ts --feed`), so the board re-reads the OS
 * every 60s and on demand and never calls Robinhood itself. Freshness is
 * shown honestly: live, stale, seeded or none, from lib/trading-view.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, RefreshCw, ExternalLink, Lightbulb, Bot } from 'lucide-react';
import { Badge, Label } from '@/components/terminal';
import { Chip } from '@/components/Pressable';
import { AgentTradeChart } from '@/components/AgentTradeChart';
import { AgentReasoning } from '@/components/AgentReasoning';
import { TradingLimits } from '@/components/TradingLimits';
import { useCountUp } from '@/components/CountUp';
import { agentSummary } from '@/lib/trading-chart';
import { AGENTIC_ID, activityCounts, filterActivity, freshness, positionSizes, shortAddress, type ActivityFilter, type TradingPayload } from '@/lib/trading-view';
import type { TradeActivity, TradingAccountSnapshot, TradingOrder } from '@/lib/schemas';

const EASE = 'cubic-bezier(.2,.7,.2,1)';

// One hue per account (anti-drift rule). All of them ride the colorway.
const HUE = {
  agentic: 'var(--accent)', // the sleeve the agent trades
  individual: 'var(--ramp-1)', // the account that holds the money
  phantom: 'var(--ramp-4)', // the wallet, read-only to everyone
};

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const usd0 = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** Signed money with a +/- and a status tint class. */
function pnl(n: number): { text: string; cls: string } {
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return { text: `${sign}${usd(Math.abs(n))}`, cls: n > 0 ? 'text-os-ok' : n < 0 ? 'text-os-err' : 'text-os-muted' };
}

const timeAgo = (iso: string, now: number) => {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
};

const clock = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Card shell: near-bg surface, stagger-in, 1px hover lift. */
function Card({ children, delay = 0, className = '', style }: { children: React.ReactNode; delay?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`tb-card relative min-w-0 rounded-[12px] border border-os-border bg-os-surface ${className}`} style={{ animation: `tb-rise .6s ${EASE} ${delay}ms both`, ...style }}>
      {children}
    </div>
  );
}

/** Card header with a REAL kebab: refresh the feed or open the broker. */
function CardHead({ title, meta, onRefresh }: { title: string; meta?: React.ReactNode; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-start justify-between gap-3 px-6 pt-5">
      <div className="min-w-0">
        <h2 className="text-[19px] font-semibold tracking-[-0.01em]">{title}</h2>
        {meta && <div className="mt-0.5 truncate font-mono text-[10.5px] text-os-dim">{meta}</div>}
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`${title} menu`}
        className="pressable grid h-8 w-8 shrink-0 place-items-center rounded-full border border-os-border text-[13px] leading-none text-os-dim hover:border-os-border-strong hover:text-os-text"
      >
        ···
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[30]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-5 top-14 z-[40] w-[220px] overflow-hidden rounded-md-t border border-os-border bg-os-bg2/95 py-1 backdrop-blur">
            <button
              onClick={() => {
                setOpen(false);
                onRefresh();
              }}
              className="pressable flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[12.5px] text-os-muted hover:bg-[color-mix(in_oklab,var(--text)_6%,transparent)] hover:text-os-text"
            >
              <RefreshCw size={13} strokeWidth={1.7} /> Refresh from the feed
            </button>
            <a
              href="https://robinhood.com/"
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[12.5px] text-os-muted hover:bg-[color-mix(in_oklab,var(--text)_6%,transparent)] hover:text-os-text"
            >
              <ExternalLink size={13} strokeWidth={1.7} /> Open Robinhood
            </a>
          </div>
        </>
      )}
    </div>
  );
}

/** Account meter: label/display row over a static hatch fill with a hue glow. */
function Meter({ label, frac: rawFrac, display, hue, delay, tag }: { label: string; frac: number; display: string; hue: string; delay: number; tag?: React.ReactNode }) {
  const frac = Number.isFinite(rawFrac) && rawFrac > 0 ? Math.max(0.02, Math.min(1, rawFrac)) : 0.02;
  return (
    <div data-lens="r" className="min-w-0 rounded-[8px] px-1 py-0.5 -mx-1">
      <div className="flex items-baseline justify-between gap-3">
        {/* the name never truncates: the badge wraps under it when the card is narrow */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-os-muted">
          <span className="whitespace-nowrap">{label}</span>
          {tag}
        </span>
        <span className="shrink-0 text-[14px] font-semibold tabular-nums">{display}</span>
      </div>
      <div className="mt-2 h-[10px] overflow-hidden rounded-full" style={{ background: 'color-mix(in oklab, var(--text) 8%, transparent)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${frac * 100}%`,
            background: `linear-gradient(90deg, transparent 72%, color-mix(in oklab, ${hue} 60%, white) 100%), repeating-linear-gradient(45deg, ${hue}, ${hue} 6px, color-mix(in oklab, ${hue} 45%, transparent) 6px, color-mix(in oklab, ${hue} 45%, transparent) 12px)`,
            boxShadow: `0 0 14px color-mix(in oklab, ${hue} 45%, transparent), inset 0 0 5px color-mix(in oklab, ${hue} 55%, transparent)`,
            animation: `tb-meter-in 1.2s ${EASE} ${delay}ms both`,
          }}
        />
      </div>
    </div>
  );
}

function StatNumber({ value }: { value: number }) {
  const v = useCountUp(value);
  return <>{v}</>;
}

function DollarStat({ value, cents = false }: { value: number; cents?: boolean }) {
  const v = useCountUp(value);
  return <>{cents ? usd(v) : usd0(v)}</>;
}

/** Waffle dot-matrix mini: position-size distribution. */
function DotMatrix({ cols, hue }: { cols: Array<{ label: string; count: number }>; hue: string }) {
  const max = Math.max(...cols.map((c) => c.count), 1);
  return (
    <div className="flex items-end gap-3">
      {cols.map((c, ci) => {
        const dots = Math.max(c.count === 0 ? 0 : 1, Math.round((c.count / max) * 6));
        const strength = c.count === max ? 1 : c.count >= max * 0.6 ? 0.55 : 0.25;
        return (
          <div key={c.label} className="flex flex-col items-center gap-1.5">
            <div className="flex flex-col-reverse gap-[3px]">
              {Array.from({ length: dots }, (_, i) => (
                <span key={i} className="block h-[7px] w-[7px] rounded-full" style={{ background: hue, opacity: strength, animation: `tb-fadein .3s ${EASE} ${900 + ci * 90 + i * 55}ms both` }} />
              ))}
              {dots === 0 && <span className="block h-[7px] w-[7px] rounded-full" style={{ background: hue, opacity: 0.12 }} />}
            </div>
            <span className="whitespace-nowrap font-mono text-[10px] text-os-dim">{c.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ActionTag({ action }: { action: TradeActivity['action'] }) {
  const buy = action === 'buy';
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${buy ? 'bg-os-ok/15 text-os-ok' : 'bg-os-err/15 text-os-err'}`}>
      {action}
    </span>
  );
}

function Field({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-os-hairline py-2 last:border-0">
      <span className="text-[12px] text-os-dim">{k}</span>
      <span className="text-right text-[12.5px] tabular-nums text-os-text">{v ?? <span className="text-os-dim">not set</span>}</span>
    </div>
  );
}

function statusTone(status: TradeActivity['status']): 'ok' | 'warn' | 'err' | 'default' {
  if (status === 'filled') return 'ok';
  if (status === 'pending') return 'warn';
  if (status === 'rejected' || status === 'cancelled') return 'err';
  return 'default';
}

/** Orders still working at the broker. Separate from the trade log on
 *  purpose: the log is what the agent did, this is what has not happened yet. */
function OpenOrders({ orders, now }: { orders: TradingOrder[]; now: number }) {
  if (orders.length === 0) {
    return <div className="px-6 py-7 text-center font-mono text-[11.5px] text-os-dim">No live orders at the broker.</div>;
  }
  return (
    <ul className="mt-4 border-t border-os-border">
      {orders.map((o) => (
        <li key={o.id} data-lens="r" className="pressable is-row flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-os-hairline px-6 py-3 last:border-0">
          <ActionTag action={o.side} />
          <span className="font-mono text-[12.5px] font-bold">{o.symbol}</span>
          <span className="font-mono text-[11px] tabular-nums text-os-muted">
            {o.dollarAmountUsd !== null ? usd(o.dollarAmountUsd) : `${o.quantity}`}
            {o.limitPriceUsd !== null && ` limit ${usd(o.limitPriceUsd)}`}
            {o.filledQuantity > 0 && ` · ${o.filledQuantity}/${o.quantity} filled`}
          </span>
          <Badge tone="warn" ghost>
            {o.state}
          </Badge>
          {/* Who placed it, said as loudly as the state: Robinhood stamps
              placed_agent 'agentic' on anything the agent submitted. */}
          <Badge tone={o.placedAgent === 'agentic' ? 'ok' : 'default'} ghost>
            {o.placedAgent === 'agentic' ? 'agent' : 'you'}
          </Badge>
          <span className="flex-1" />
          <span className="font-mono text-[10px] text-os-dim">
            {o.type} · {timeAgo(o.createdAt, now)} ago
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TradingBoard({ initial }: { initial: TradingPayload }) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState<string>(AGENTIC_ID);
  const [logFilter, setLogFilter] = useState<ActivityFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.parse(initial.at));

  const refresh = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/trading');
      if (r.ok) {
        const next = (await r.json()) as TradingPayload;
        setData(next);
        setNow(Date.parse(next.at));
      }
    } catch {
      /* keep last good */
    } finally {
      setBusy(false);
    }
  }, [busy]);

  useEffect(() => {
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { accounts, history, positions, activity, analysis, openOrders, phantom, status } = data;
  const fresh = freshness(accounts, now);
  const seeded = fresh.state === 'seeded';
  const agentAccount = accounts.find((a) => a.accountId === AGENTIC_ID) ?? null;
  const viewAccount = accounts.find((a) => a.accountId === view) ?? agentAccount;
  const viewId = viewAccount?.accountId ?? AGENTIC_ID;
  const viewTrades = useMemo(() => activity.filter((a) => a.accountId === viewId), [activity, viewId]);
  const agent = useMemo(
    () => agentSummary(agentAccount, positions.filter((p) => p.accountId === AGENTIC_ID), activity.filter((a) => a.accountId === AGENTIC_ID)),
    [agentAccount, positions, activity],
  );
  const combined = accounts.reduce((s, a) => s + a.accountValueUsd, 0);
  const dayPnl = accounts.reduce((s, a) => s + a.dayPnlUsd, 0);
  const invested = positions.reduce((s, p) => s + p.marketValueUsd, 0);
  const sizes = useMemo(() => positionSizes(positions), [positions]);
  const counts = useMemo(() => activityCounts(activity), [activity]);
  const rows = useMemo(() => filterActivity(activity, logFilter), [activity, logFilter]);
  const selected = activity.find((a) => a.id === selectedId) ?? null;
  const day = pnl(dayPnl);
  const phantomUsd = phantom?.usdValue ?? 0;
  const total = combined + phantomUsd;
  const deployedFrac = agentAccount ? agent.deployedUsd / Math.max(agentAccount.accountValueUsd, 1) : 0;

  return (
    <div>
      <style>{`
        @keyframes tb-rise { from { opacity: 0; transform: translateY(10px) scale(.992); } to { opacity: 1; transform: none; } }
        @keyframes tb-fadein { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tb-meter-in { from { width: 0; } }
        @keyframes tb-drift { from { background-position: 0% 0%; } to { background-position: 12% 8%; } }
        .tb-card { transition: transform .15s ease, border-color .15s ease; }
        .tb-card:hover { transform: translateY(-1px); border-color: var(--border-strong); }
      `}</style>

      {/* The slab: the whole view floats as one surface. */}
      <div
        className="rounded-[28px] border border-os-border p-7"
        style={{ background: 'var(--bg-2)', boxShadow: '0 1px 2px rgba(0,0,0,.4), 0 24px 70px -18px rgba(0,0,0,.6)', animation: `tb-rise .7s ${EASE} both` }}
      >
        {/* Title row */}
        <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.32em] text-os-dim">// markets · robinhood + phantom · agent-fed</div>
            <h1 className="text-[46px] font-semibold leading-none tracking-[-0.035em]">Trading</h1>
            <div className="mt-3 font-mono text-[11px] text-os-dim">
              {usd(total)} across {accounts.length} account{accounts.length === 1 ? '' : 's'}
              {phantom ? ' + wallet' : ''} · {fresh.label}
              {fresh.state === 'stale' && ' · the feed has not pushed in a while'}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {fresh.state === 'live' ? (
              <Badge tone="ok">live · robinhood</Badge>
            ) : fresh.state === 'stale' ? (
              <Badge tone="warn">stale · {fresh.label.replace('synced ', '')}</Badge>
            ) : fresh.state === 'seeded' ? (
              <Badge tone="warn">seeded · awaiting the feed</Badge>
            ) : (
              <Badge tone="err">no feed</Badge>
            )}
            <span className="rounded-full border border-os-border px-4 py-2 text-[13px] text-os-muted">monitor-only · refreshes 60s</span>
            <button
              onClick={refresh}
              aria-label="Refresh feed"
              title="Refresh feed"
              className="pressable grid h-10 w-10 place-items-center rounded-full border border-os-border text-os-muted hover:border-os-border-strong hover:text-os-text"
            >
              <RefreshCw size={15} strokeWidth={1.7} className={busy ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {accounts.length === 0 ? (
          <Card delay={120} className="px-6 py-12 text-center">
            <div className="text-[19px] font-semibold">No account data yet</div>
            <div className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-os-dim">{status.detail}</div>
          </Card>
        ) : (
          <>
            {/* Hero row: the value line + the accounts card */}
            <div className="grid grid-cols-[2fr_1fr] gap-6 max-[1200px]:grid-cols-1">
              <Card delay={120} className="flex flex-col pb-5">
                <CardHead
                  title={view === AGENTIC_ID ? 'Agent · the sleeve' : `${viewAccount?.accountLabel ?? 'Account'} · value`}
                  meta={
                    view === AGENTIC_ID
                      ? agent.hasActed
                        ? `${agent.tradeCount} trade${agent.tradeCount === 1 ? '' : 's'} · last ${timeAgo(agent.lastTradeAt!, now)} ago`
                        : 'no trades placed yet'
                      : 'read-only to agents'
                  }
                  onRefresh={refresh}
                />
                <div className="mt-3 flex flex-wrap items-center gap-1.5 px-6">
                  {accounts.map((a) => (
                    <Chip key={a.accountId} on={viewId === a.accountId} onClick={() => setView(a.accountId)}>
                      {a.accountLabel}
                    </Chip>
                  ))}
                </div>
                <div className="px-6 pt-4">
                  <AgentTradeChart history={history[viewId] ?? []} trades={viewTrades} />
                </div>
                <div className="mx-6 mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-os-border bg-os-border sm:grid-cols-4">
                  {[
                    { label: 'Deployed', value: usd(agent.deployedUsd) },
                    { label: 'Idle cash', value: usd(agent.idleCashUsd) },
                    { label: 'Unrealized', value: pnl(agent.unrealizedPnlUsd).text, cls: pnl(agent.unrealizedPnlUsd).cls },
                    { label: 'Agent trades', value: String(agent.tradeCount) },
                  ].map((s) => (
                    <div key={s.label} className="min-w-0 bg-os-surface px-4 py-3">
                      <div className="truncate font-mono text-[9px] uppercase tracking-[0.2em] text-os-dim">{s.label}</div>
                      <div className={`mt-1 truncate font-mono text-[16px] font-bold tabular-nums ${s.cls ?? ''}`}>{s.value}</div>
                    </div>
                  ))}
                </div>
                {!agent.hasActed && (
                  <div className="mx-6 mt-3 text-[12px] leading-relaxed text-os-dim">
                    {agentAccount
                      ? `The sleeve is funded with ${usd(agentAccount.cashUsd)} and sitting in cash. Nothing here moves until the agent places a trade against it.`
                      : 'No agentic account has been fed yet.'}
                  </div>
                )}
              </Card>

              <Card delay={220} className="flex flex-col">
                <CardHead title="Accounts" meta={status.detail} onRefresh={refresh} />
                <div className="flex flex-1 flex-col px-6 pb-6">
                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    <span className="text-[44px] font-semibold leading-none tracking-[-0.035em] tabular-nums">
                      <DollarStat value={combined} cents />
                    </span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border border-os-border px-2.5 py-1 font-mono text-[11.5px] tabular-nums ${day.cls}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${dayPnl >= 0 ? 'bg-os-ok' : 'bg-os-err'}`} /> {day.text} today
                    </span>
                  </div>
                  <div className="mb-5 mt-2 text-[13px] text-os-dim">
                    brokerage, {accounts.length} account{accounts.length === 1 ? '' : 's'} · {usd0(invested)} in {positions.length} position{positions.length === 1 ? '' : 's'}
                  </div>
                  <div className="flex flex-1 flex-col justify-around gap-6 border-t border-os-border pt-5">
                    {accounts.map((a, i) => (
                      <Meter
                        key={a.accountId}
                        label={a.accountLabel}
                        tag={
                          <Badge tone={a.accountId === AGENTIC_ID ? 'ok' : 'default'} ghost>
                            {a.accountId === AGENTIC_ID ? 'agent may trade' : 'read-only to agents'}
                          </Badge>
                        }
                        frac={total > 0 ? a.accountValueUsd / total : 0}
                        display={usd(a.accountValueUsd)}
                        hue={a.accountId === AGENTIC_ID ? HUE.agentic : HUE.individual}
                        delay={500 + i * 150}
                      />
                    ))}
                    <Meter
                      label={phantom ? `Phantom · ${phantom.sol} SOL` : 'Phantom · SOL'}
                      tag={
                        <Badge tone="default" ghost>
                          {phantom ? shortAddress(phantom.address) : 'wallet not reachable'}
                        </Badge>
                      }
                      frac={total > 0 ? phantomUsd / total : 0}
                      display={phantom ? (phantom.usdValue === null ? 'price unavailable' : usd(phantom.usdValue)) : '--'}
                      hue={HUE.phantom}
                      delay={800}
                    />
                  </div>
                  <div className="mt-5 border-t border-os-border pt-3 text-center font-mono text-[10.5px] tracking-[0.1em] text-os-dim">
                    only the agentic sleeve can be traded by an agent · {phantom?.usdPerSol ? `${usd(phantom.usdPerSol)} / SOL` : 'wallet read from a public RPC'}
                  </div>
                </div>
              </Card>
            </div>

            {/* Second row: reasoning + positions + THE gradient card */}
            <div className="mt-6 grid grid-cols-[1.15fr_1fr_.85fr] gap-6 max-[1200px]:grid-cols-1">
              <Card delay={320} className="flex min-h-0 flex-col">
                <CardHead
                  title="Agent · reasoning"
                  meta={
                    analysis
                      ? `${analysis.examined} examined · ${analysis.signals} signal${analysis.signals === 1 ? '' : 's'} · ${timeAgo(analysis.at, now)} ago`
                      : 'no run recorded'
                  }
                  onRefresh={refresh}
                />
                <AgentReasoning analysis={analysis} now={now} />
              </Card>

              <Card delay={420} className="flex min-h-0 flex-col">
                <CardHead title="Positions" meta={`${usd0(invested)} invested`} onRefresh={refresh} />
                <div className="flex items-end justify-between gap-4 px-6 pt-3">
                  <div>
                    <div className="text-[30px] font-semibold tabular-nums tracking-[-0.03em]">
                      <StatNumber value={positions.length} />
                    </div>
                    <div className="mt-1 text-[13px] text-os-dim">open position{positions.length === 1 ? '' : 's'}</div>
                  </div>
                  <DotMatrix cols={sizes} hue={HUE.individual} />
                </div>
                <ul className="mt-4 max-h-[236px] flex-1 overflow-y-auto border-t border-os-border">
                  {positions.map((p) => {
                    const u = pnl(p.unrealizedPnlUsd);
                    return (
                      <li key={`${p.accountId}-${p.symbol}`} data-lens="r" className="pressable is-row grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 border-b border-os-hairline px-6 py-2.5 last:border-0">
                        <div className="min-w-0">
                          <span className="font-mono text-[12.5px] font-bold">{p.symbol}</span>
                          <span className="ml-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">{p.accountId}</span>
                          <div className="truncate font-mono text-[10.5px] tabular-nums text-os-dim">
                            {p.quantity} @ {usd(p.avgCostUsd)}
                          </div>
                        </div>
                        <span className="font-mono text-[12px] tabular-nums">{usd(p.marketValueUsd)}</span>
                        <span className={`w-[72px] text-right font-mono text-[11px] tabular-nums ${u.cls}`}>{u.text}</span>
                      </li>
                    );
                  })}
                  {positions.length === 0 && <li className="px-6 py-7 text-center font-mono text-[11.5px] text-os-dim">No open positions.</li>}
                </ul>
              </Card>

              {/* the ONE gradient insight card */}
              <Card
                delay={520}
                className="overflow-hidden !border-transparent"
                style={{
                  background: [
                    'radial-gradient(120% 90% at 85% 8%, color-mix(in oklab, var(--tile-glow-a) 55%, transparent), transparent 60%)',
                    'radial-gradient(130% 110% at 12% 92%, color-mix(in oklab, var(--tile-glow-b) 55%, transparent), transparent 62%)',
                    'radial-gradient(110% 110% at 55% 55%, color-mix(in oklab, var(--tile-glow-c) 45%, transparent), transparent 70%)',
                    'var(--surface)',
                  ].join(', '),
                  backgroundSize: '160% 160%',
                  animation: `tb-rise .6s ${EASE} 520ms both, tb-drift 14s ease-in-out 1s infinite alternate`,
                }}
              >
                <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: GRAIN, mixBlendMode: 'overlay', opacity: 0.85 }} />
                <div className="pointer-events-none absolute -right-14 -top-16 h-56 w-56 rotate-[24deg] rounded-[36px] border border-white/25 bg-white/5" style={{ backdropFilter: 'blur(3px)' }} />
                <div className="relative flex h-full flex-col px-6 py-5 text-white">
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px] backdrop-blur">
                    <Lightbulb size={13} strokeWidth={1.7} /> Agent · next move
                  </span>
                  <div className="mt-4 text-[64px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                    <StatNumber value={openOrders.length > 0 ? openOrders.length : (analysis?.signals ?? 0)} />
                  </div>
                  <div className="mt-2 text-[16px] font-semibold leading-snug">
                    {openOrders.length > 0
                      ? `order${openOrders.length === 1 ? '' : 's'} working at the broker.`
                      : analysis
                        ? `signal${analysis.signals === 1 ? '' : 's'} on the last run, ${timeAgo(analysis.at, now)} ago.`
                        : 'runs recorded. The agent has not reported in.'}
                  </div>
                  <div className="mt-1.5 line-clamp-4 text-[12.5px] leading-relaxed text-white/75">
                    {analysis?.notes || 'Index core: QQQ and SPY, bought on dips and topped up monthly, with buys stopping at the kill-switch floor. Every order is checked in code before it reaches the broker.'}
                  </div>
                  <div className="mt-auto flex gap-1.5 pt-4">
                    {Array.from({ length: 8 }, (_, i) => (
                      <span key={i} className="h-[3px] flex-1 rounded-full" style={{ background: i < Math.round(deployedFrac * 8) ? '#fff' : 'rgba(255,255,255,.25)' }} />
                    ))}
                  </div>
                  <div className="mt-1.5 font-mono text-[10px] text-white/60">{Math.round(deployedFrac * 100)}% of the sleeve deployed</div>
                </div>
              </Card>
            </div>

            {/* Open orders */}
            <Card delay={620} className="mt-6">
              <CardHead title="Open orders" meta={openOrders.length === 0 ? 'nothing working' : `${openOrders.length} working`} onRefresh={refresh} />
              <OpenOrders orders={openOrders} now={now} />
            </Card>

            {/* Trade log */}
            <Card delay={720} className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-5">
                <h2 className="text-[19px] font-semibold tracking-[-0.01em]">
                  Trade log{' '}
                  <span className="ml-1 font-mono text-[12px] font-normal tabular-nums text-os-dim">
                    {rows.length} of {activity.length}
                  </span>
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      ['all', `All ${counts.all}`],
                      ['agent', `Agent ${counts.agent}`],
                      ['you', `You ${counts.you}`],
                      ['rejected', `Rejected ${counts.rejected}`],
                    ] as Array<[ActivityFilter, string]>
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setLogFilter(key)}
                      className={`pressable rounded-full px-4 py-1.5 text-[12.5px] ${
                        logFilter === key ? 'bg-os-accent font-semibold text-os-ink' : 'border border-os-border text-os-muted hover:text-os-text'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 border-t border-os-border">
                {rows.map((a) => (
                  <button
                    key={a.id}
                    data-lens="r"
                    onClick={() => setSelectedId(a.id)}
                    className="pressable is-row grid w-full min-w-0 grid-cols-[52px_minmax(0,1fr)_auto] items-start gap-x-4 border-b border-os-hairline px-6 py-3.5 text-left last:border-0 max-[900px]:grid-cols-[52px_minmax(0,1fr)]"
                  >
                    <ActionTag action={a.action} />
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 font-mono text-[12.5px]">
                        <span className="font-bold">{a.symbol}</span>
                        <span className="tabular-nums text-os-muted">
                          {a.quantity} @ {usd(a.priceUsd)}
                        </span>
                        <Badge tone={statusTone(a.status)} ghost>
                          {a.status}
                        </Badge>
                      </div>
                      <div className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-os-dim">{a.rationale || 'no rationale recorded'}</div>
                    </div>
                    <div className="shrink-0 text-right font-mono text-[10px] text-os-dim max-[900px]:hidden">
                      <div className="truncate">
                        {a.agent} · <span className="uppercase tracking-wider">{a.accountId}</span>
                      </div>
                      <div>{timeAgo(a.at, now)} ago</div>
                    </div>
                  </button>
                ))}
                {rows.length === 0 && (
                  <div className="px-6 py-8 text-center text-[12.5px] text-os-dim">
                    {activity.length === 0 ? 'No trades logged yet.' : 'Nothing matches that filter.'}
                  </div>
                )}
              </div>
            </Card>
          </>
        )}

        {/* Settings, not state: shown even with no account data, since the
            limits govern the agent's next run either way. */}
        <div className="mt-6" style={{ animation: `tb-rise .6s ${EASE} 820ms both` }}>
          <TradingLimits />
        </div>
        {seeded && (
          <div className="mt-4 text-center font-mono text-[10.5px] text-os-dim">
            Example rows. The first real push from the Markets Agent feed replaces them.
          </div>
        )}
      </div>

      {/* Detail drawer: the full rationale, never truncated away */}
      {selected && <div className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-[2px]" onClick={() => setSelectedId(null)} aria-hidden="true" />}
      {selected && (
        <aside className="fixed right-0 top-0 z-[70] flex h-full w-[460px] max-w-[92vw] flex-col border-l border-os-border bg-os-bg2/95 backdrop-blur">
          <div className="flex items-start justify-between gap-4 border-b border-os-border px-6 py-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[17px] font-semibold">
                <ActionTag action={selected.action} /> {selected.symbol}
              </div>
              <div className="mt-0.5 truncate font-mono text-[11.5px] text-os-dim">
                {selected.quantity} @ {usd(selected.priceUsd)} · {clock(selected.at)}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
                <Badge tone={/agent/i.test(selected.agent) && !/operator/i.test(selected.agent) ? 'ok' : 'default'} ghost>
                  {selected.agent}
                </Badge>
                <Badge tone="default" ghost>
                  {selected.accountId}
                </Badge>
              </div>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              aria-label="Close"
              className="pressable grid h-[30px] w-[30px] shrink-0 place-items-center rounded-sm-t border border-os-border text-os-muted hover:border-os-border-strong hover:text-os-text"
            >
              <X size={15} strokeWidth={1.8} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <section className="mb-6">
              <Label rule>Rationale</Label>
              <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-os-text">{selected.rationale || 'No rationale was recorded with this trade.'}</p>
            </section>
            <section className="mb-6">
              <Label rule>Order</Label>
              <div className="mt-2">
                <Field k="Side" v={selected.action} />
                <Field k="Quantity" v={String(selected.quantity)} />
                <Field k="Price" v={usd(selected.priceUsd)} />
                <Field k="Notional" v={usd(selected.quantity * selected.priceUsd)} />
                <Field k="Outcome" v={selected.status} />
              </div>
            </section>
            <section>
              <Label rule>Who and where</Label>
              <div className="mt-2">
                <Field k="Placed by" v={selected.agent} />
                <Field k="Account" v={selected.accountId} />
                <Field k="When" v={`${timeAgo(selected.at, now)} ago (${selected.at.slice(0, 10)})`} />
              </div>
              <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-os-dim">
                <Bot size={12} className="mt-0.5 shrink-0" /> Rejected rows carry the exact broker or guardrail reason in the rationale; nothing is retried silently.
              </p>
            </section>
          </div>
        </aside>
      )}
    </div>
  );
}
