import { AGENTIC_ACCOUNT_NUMBER, type Limits, type ProposedOrder, type SleeveState } from '@/lib/trading-guardrails';

/**
 * Index core — the Markets Agent's default decide path.
 *
 * The brief was a strategy that does not have to be fast, just net positive
 * over time. The OS's own walk-forward backtests make the case: every active
 * system tested lost to simply holding SPY/QQQ, the crypto lane
 * had no edge net of Robinhood spreads, and the one thing that was real on
 * index dailies was a slow trend filter. So the sleeve sits in the two broad
 * indexes and the agent's job is discipline, not prediction:
 *
 * - hold each core at a fixed share of the sleeve (39.5% QQQ, 39.5% SPY,
 * just under the 40% concentration cap; the rest is cash)
 * - buy the gap toward target once it is worth a trade (2.5% of equity);
 * on a dip (close 5% under the 20-session high) buy any gap at all
 * - when the close is under its 200-day average, halve that core's target
 * and trim the excess; restore it when the close is back above
 * - never buy through the kill-switch floor; sells are never blocked
 *
 * Buys are dollar-based MARKET orders (the only order type Robinhood fills
 * fractionally, and on SPY/QQQ in regular hours the spread is a cent). Every
 * order still passes lib/trading-guardrails.ts before the broker sees it.
 * Pure: closes in, orders and an auditable analysis out, pinned by
 * tests/trading-strategy.test.ts.
 */

export type StrategyInput = {
  sleeve: SleeveState;
  limits: Limits;
  /** Daily closes, oldest → newest, per symbol. 200+ for a regime read. */
  closes: Record<string, number[]>;
  /** Last trade per symbol; falls back to the last close. */
  quotes: Record<string, number>;
  today: string;
};

export type StrategySignal = {
  ticker: string;
  direction: 'long' | 'trim';
  entry: number;
  shares: number;
  notionalUsd?: number;
  zone_score: number;
  confirmation_type: string[];
  thesis: string;
};

export type ExaminedRow = { ticker: string; best_zone_score: number; verdict: 'signal' | 'trim' | 'no-signal'; reason: string };

export type StrategyAnalysis = { examined: ExaminedRow[]; signals: StrategySignal[]; notes: string };

export type StrategyResult = { orders: ProposedOrder[]; signals: StrategySignal[]; analysis: StrategyAnalysis };

/** The universe and its targets. Just under the 40% concentration cap so a
 *  buy that lands exactly on target cannot trip the guardrail on rounding. */
export const CORE: Array<{ symbol: string; targetPct: number }> = [
  { symbol: 'QQQ', targetPct: 39.5 },
  { symbol: 'SPY', targetPct: 39.5 },
];

const GAP_PCT = 2.5; // of equity: the smallest gap worth a trade
const DIP_PCT = 5; // under the 20-session high: buy any gap
const REGIME_LEN = 200;
const HIGH_LEN = 20;
const TRIM_SLACK = 1.05; // trim only when 5% over the halved target
const MIN_ORDER_USD = 5;
const MAX_CLOSE_QUOTE_GAP = 0.15; // a close this far from the live quote is bad data, not a signal

const round2 = (n: number) => Math.round(n * 100) / 100;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const money = (n: number) => `$${n.toFixed(2)}`;

export function sma(xs: number[], n: number): number | null {
  if (xs.length < n) return null;
  const tail = xs.slice(-n);
  return tail.reduce((t, x) => t + x, 0) / n;
}

export function sessionHigh(xs: number[], n: number): number | null {
  if (xs.length === 0) return null;
  return Math.max(...xs.slice(-n));
}

type Regime = 'risk-on' | 'risk-off' | 'unknown';

export function decideIndexCore(input: StrategyInput): StrategyResult {
  const { sleeve, limits, closes, quotes } = input;
  const equity = sleeve.accountValueUsd;
  const floor = equity < limits.minSleeveValueUsd;
  let cash = sleeve.cashUsd;
  const examined: ExaminedRow[] = [];
  const signals: StrategySignal[] = [];
  const orders: ProposedOrder[] = [];
  const regimeNotes: string[] = [];
  const refused: string[] = [];

  for (const core of CORE) {
    const series = closes[core.symbol] ?? [];
    const last = series[series.length - 1] ?? quotes[core.symbol] ?? 0;
    const price = quotes[core.symbol] ?? last;
    const s200 = sma(series, REGIME_LEN);
    const regime: Regime = s200 === null ? 'unknown' : last >= s200 ? 'risk-on' : 'risk-off';
    const high = sessionHigh(series, HIGH_LEN);
    const dip = high !== null && last <= high * (1 - DIP_PCT / 100);
    const targetPct = regime === 'risk-off' ? core.targetPct / 2 : core.targetPct;
    const target = equity * (targetPct / 100);
    const held = sleeve.positions.find((p) => p.symbol.toUpperCase() === core.symbol);
    const mv = held?.marketValueUsd ?? 0;
    const gap = target - mv;
    const threshold = dip ? 0 : equity * (GAP_PCT / 100);
    const regimeText =
      regime === 'unknown'
        ? `regime unknown (${series.length} closes, need ${REGIME_LEN})`
        : `${regime} (close ${last.toFixed(2)} vs 200d ${s200!.toFixed(2)})`;
    regimeNotes.push(`${core.symbol} ${regimeText}`);
    const dipText = dip && high !== null ? `, dip: ${((1 - last / high) * 100).toFixed(1)}% under the 20-session high ${high.toFixed(2)}` : '';
    const whereText = `${money(mv)} held vs ${money(target)} target (${targetPct}%)`;

    if (!(price > 0)) {
      examined.push({ ticker: core.symbol, best_zone_score: 0, verdict: 'no-signal', reason: `no price for ${core.symbol}; nothing done` });
      continue;
    }
    // A relayed close series once read QQQ at 1304 against a live 716
    //. A regime read off numbers like that is worse than none.
    if (series.length > 0 && Math.abs(last - price) / price > MAX_CLOSE_QUOTE_GAP) {
      refused.push(core.symbol);
      examined.push({
        ticker: core.symbol,
        best_zone_score: 0,
        verdict: 'no-signal',
        reason: `bad data: last close ${last.toFixed(2)} is ${((Math.abs(last - price) / price) * 100).toFixed(0)}% off the live quote ${price.toFixed(2)}; no order on ${core.symbol} until the series agrees with the tape`,
      });
      continue;
    }

    if (gap > 0) {
      if (floor) {
        examined.push({ ticker: core.symbol, best_zone_score: 10, verdict: 'no-signal', reason: `${whereText}, but the sleeve is under the ${money(limits.minSleeveValueUsd)} floor: no buys` });
        continue;
      }
      if (gap < Math.max(threshold, 1)) {
        examined.push({ ticker: core.symbol, best_zone_score: 30, verdict: 'no-signal', reason: `${whereText}: within ${money(gap)} of target, under the ${money(threshold)} trade threshold${dipText}` });
        continue;
      }
      const notional = round2(Math.min(gap, limits.maxNotionalPerTradeUsd, cash));
      if (notional < MIN_ORDER_USD) {
        examined.push({ ticker: core.symbol, best_zone_score: 40, verdict: 'no-signal', reason: `${whereText}, gap ${money(gap)}, but only ${money(cash)} cash left this run` });
        continue;
      }
      cash = round2(cash - notional);
      const shares = round6(notional / price);
      const score = Math.min(100, 60 + (dip ? 20 : 0) + (regime === 'risk-on' ? 15 : 0));
      const thesis = `${dip ? 'Dip rung: ' : ''}buying ${money(notional)} of ${core.symbol} toward the ${targetPct}% target (${whereText}); ${regimeText}${dipText}. Dollar-based market order, regular hours.`;
      signals.push({ ticker: core.symbol, direction: 'long', entry: price, shares, notionalUsd: notional, zone_score: score, confirmation_type: [regime, dip ? 'dip-rung' : 'gap-to-target'], thesis });
      orders.push({ symbol: core.symbol, side: 'buy', orderType: 'market', notionalUsd: notional, quantity: shares, accountNumber: AGENTIC_ACCOUNT_NUMBER });
      examined.push({ ticker: core.symbol, best_zone_score: score, verdict: 'signal', reason: thesis });
      continue;
    }

    if (regime === 'risk-off' && held && mv > target * TRIM_SLACK) {
      const excess = mv - target;
      const qty = round6(Math.min(held.quantity, excess / price));
      const thesis = `Trimming ${qty} ${core.symbol} (${money(excess)}) to the halved ${targetPct}% target: ${regimeText}. Market sell, regular hours; buys resume at the full target once the close is back above the 200-day.`;
      signals.push({ ticker: core.symbol, direction: 'trim', entry: price, shares: qty, zone_score: 70, confirmation_type: ['risk-off', 'regime-trim'], thesis });
      orders.push({ symbol: core.symbol, side: 'sell', orderType: 'market', quantity: qty, accountNumber: AGENTIC_ACCOUNT_NUMBER });
      examined.push({ ticker: core.symbol, best_zone_score: 70, verdict: 'trim', reason: thesis });
      continue;
    }

    examined.push({
      ticker: core.symbol,
      best_zone_score: 20,
      verdict: 'no-signal',
      reason: `${whereText}: ${mv > target ? 'over target but the regime is on, so it is held' : 'at target'}; ${regimeText}${dipText}`,
    });
  }

  const notes = [
    `Index core. ${regimeNotes.join('; ')}.`,
    `Targets ${CORE.map((c) => `${c.symbol} ${c.targetPct}%`).join(', ')} of ${money(equity)} equity (halved for a core under its 200-day); trade threshold ${money(equity * (GAP_PCT / 100))}, dips buy any gap.`,
    floor ? `Sleeve ${money(equity)} is under the ${money(limits.minSleeveValueUsd)} kill-switch floor: no buys until it recovers or the operator raises the floor.` : '',
    refused.length ? `Refused to act on ${refused.join(', ')}: the close series disagrees with the live quote by more than ${MAX_CLOSE_QUOTE_GAP * 100}%.` : '',
    signals.length === 0 ? 'Nothing to do this session: the book is at target.' : `${signals.length} order${signals.length === 1 ? '' : 's'} proposed, each vetted by the guardrails before the broker.`,
  ]
    .filter(Boolean)
    .join(' ');

  return { orders, signals, analysis: { examined, signals, notes } };
}
