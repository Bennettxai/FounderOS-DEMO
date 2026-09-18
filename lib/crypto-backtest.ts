/**
 * Long-only bar simulator for the crypto lane. The same `Plan[]` a strategy
 * emits here is what the live runner acts on, so a backtest number is a
 * statement about the code that will trade, not about an idea of it.
 *
 * Fill rules (all pinned by tests/crypto-backtest.test.ts):
 * - a signal on bar i fills at bar i+1's open: no look-ahead
 * - stop and target are checked against each bar's low/high; a bar that
 *   touches both counts as a stop (the pessimistic reading)
 * - a gap through the stop or target fills at the open
 * - the round-trip cost is charged half on entry and half on exit
 * - one position per symbol at a time; entries while long are ignored
 */
import type { Candle } from './crypto-candles';

export type EntryPlan = {
  /** Hard stop, absolute price. Required: no naked entries. */
  stopUsd: number;
  targetUsd?: number;
  /** Trailing distance in dollars, ratcheted from each completed bar's high. */
  trailUsd?: number;
  /** Close at the close of the bar where the hold reaches this many bars. */
  maxBars?: number;
  /** Free text for the journal (which signals fired). */
  note?: string;
};

export type Plan = { enter?: EntryPlan; exit?: boolean };

export type ExitReason = 'stop' | 'trail' | 'target' | 'time' | 'signal' | 'end';

export type Trade = {
  symbol: string;
  entryIdx: number;
  exitIdx: number;
  entryTime: number;
  exitTime: number;
  entryPx: number;
  exitPx: number;
  qty: number;
  notionalUsd: number;
  pnlUsd: number;
  pnlPct: number;
  reason: ExitReason;
  bars: number;
  note?: string;
};

export type BacktestOptions = {
  costRoundTripPct: number;
  startEquityUsd: number;
  /** Fixed dollars per trade. */
  notionalUsd?: number;
  /** Or a percentage of current equity per trade. */
  sizePct?: number;
  symbol?: string;
  /** Only take entries with fill index in [from, to); force-close at to-1. */
  range?: { from: number; to: number };
};

export type BacktestResult = { trades: Trade[]; equityCurve: number[]; endEquityUsd: number };

type Open = {
  entryIdx: number;
  entryPx: number;
  qty: number;
  notionalUsd: number;
  stop: number;
  initialStop: number;
  target?: number;
  trailUsd?: number;
  maxBars?: number;
  note?: string;
};

export function backtest(candles: Candle[], plans: Plan[], opts: BacktestOptions): BacktestResult {
  const n = candles.length;
  const from = opts.range?.from ?? 0;
  const to = Math.min(opts.range?.to ?? n, n);
  const half = opts.costRoundTripPct / 200;
  const symbol = opts.symbol ?? 'UNKNOWN';
  const trades: Trade[] = [];
  const equityCurve: number[] = new Array(n).fill(opts.startEquityUsd);
  let equity = opts.startEquityUsd;
  let open: Open | null = null;

  const close = (i: number, rawPx: number, reason: ExitReason) => {
    if (!open) return;
    const exitPx = rawPx * (1 - half);
    const pnlUsd = (exitPx - open.entryPx) * open.qty;
    equity += pnlUsd;
    trades.push({
      symbol,
      entryIdx: open.entryIdx,
      exitIdx: i,
      entryTime: candles[open.entryIdx].time,
      exitTime: candles[i].time,
      entryPx: open.entryPx,
      exitPx,
      qty: open.qty,
      notionalUsd: open.notionalUsd,
      pnlUsd,
      pnlPct: exitPx / open.entryPx - 1,
      reason,
      bars: i - open.entryIdx,
      note: open.note,
    });
    open = null;
  };

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const prev = i > 0 ? plans[i - 1] : undefined;

    // 1. Pending exit signal fills at this open.
    if (open && prev?.exit) close(i, c.open, 'signal');

    // 2. Pending entry fills at this open (inside the allowed range only).
    if (!open && prev?.enter && i >= from && i < to) {
      const e = prev.enter;
      const entryPx = c.open * (1 + half);
      const notionalUsd = opts.sizePct != null ? (equity * opts.sizePct) / 100 : (opts.notionalUsd ?? equity);
      if (e.stopUsd < c.open && notionalUsd > 0) {
        open = {
          entryIdx: i,
          entryPx,
          qty: notionalUsd / entryPx,
          notionalUsd,
          stop: e.stopUsd,
          initialStop: e.stopUsd,
          target: e.targetUsd,
          trailUsd: e.trailUsd,
          maxBars: e.maxBars,
          note: e.note,
        };
      }
    }

    // 3. Stop / target against this bar's range (stop wins ties).
    if (open) {
      const o = open as Open;
      const stopReason: ExitReason = o.stop > o.initialStop ? 'trail' : 'stop';
      if (c.open <= o.stop) close(i, c.open, stopReason);
      else if (c.low <= o.stop) close(i, o.stop, stopReason);
      else if (o.target != null && c.open >= o.target) close(i, c.open, 'target');
      else if (o.target != null && c.high >= o.target) close(i, o.target, 'target');
    }

    // 4. Time stop at this bar's close.
    if (open) {
      const o = open as Open;
      if (o.maxBars != null && i - o.entryIdx >= o.maxBars) close(i, c.close, 'time');
    }

    // 5. Range end or data end closes at this bar's close.
    if (open && (i === n - 1 || i === to - 1)) close(i, c.close, 'end');

    // 6. Ratchet the trail from this completed bar's high.
    if (open) {
      const o = open as Open;
      if (o.trailUsd != null) o.stop = Math.max(o.stop, c.high - o.trailUsd);
    }

    const o = open as Open | null;
    equityCurve[i] = equity + (o ? (c.close * (1 - half) - o.entryPx) * o.qty : 0);
  }

  return { trades, equityCurve, endEquityUsd: equity };
}

export type Metrics = {
  trades: number;
  winRate: number;
  profitFactor: number;
  netPnlUsd: number;
  netReturnPct: number;
  avgTradePct: number;
  avgWinPct: number;
  avgLossPct: number;
  expectancyUsd: number;
  maxDrawdownPct: number;
  tradesPerDay: number;
  avgBars: number;
  grossWinUsd: number;
  grossLossUsd: number;
  days: number;
};

const PF_CAP = 999;

export function computeMetrics(trades: Trade[], startEquityUsd: number, days: number): Metrics {
  const sorted = [...trades].sort((a, b) => a.exitTime - b.exitTime || a.exitIdx - b.exitIdx);
  const wins = sorted.filter((t) => t.pnlUsd > 0);
  const losses = sorted.filter((t) => t.pnlUsd <= 0);
  const grossWinUsd = wins.reduce((s, t) => s + t.pnlUsd, 0);
  const grossLossUsd = -losses.reduce((s, t) => s + t.pnlUsd, 0);
  const netPnlUsd = grossWinUsd - grossLossUsd;
  let equity = startEquityUsd, peak = startEquityUsd, maxDd = 0;
  for (const t of sorted) {
    equity += t.pnlUsd;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak > 0 ? (peak - equity) / peak : 0);
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  return {
    trades: sorted.length,
    winRate: sorted.length ? wins.length / sorted.length : 0,
    profitFactor: sorted.length === 0 ? 0 : grossLossUsd === 0 ? (grossWinUsd > 0 ? PF_CAP : 0) : Math.min(PF_CAP, grossWinUsd / grossLossUsd),
    netPnlUsd,
    netReturnPct: startEquityUsd > 0 ? (netPnlUsd / startEquityUsd) * 100 : 0,
    avgTradePct: mean(sorted.map((t) => t.pnlPct)) * 100,
    avgWinPct: mean(wins.map((t) => t.pnlPct)) * 100,
    avgLossPct: mean(losses.map((t) => t.pnlPct)) * 100,
    expectancyUsd: mean(sorted.map((t) => t.pnlUsd)),
    maxDrawdownPct: maxDd * 100,
    tradesPerDay: days > 0 ? sorted.length / days : 0,
    avgBars: mean(sorted.map((t) => t.bars)),
    grossWinUsd,
    grossLossUsd,
    days,
  };
}

export type WalkForwardOptions = {
  trainBars: number;
  testBars: number;
  /** A parameter set must produce at least this many in-sample trades to be eligible. */
  minTrainTrades?: number;
  /** ...and at least this in-sample profit factor. */
  minTrainProfitFactor?: number;
  /** Score used to rank eligible parameter sets in-sample. Default: net P&L. */
  objective?: (m: Metrics) => number;
};

export type WalkForwardWindow<P> = {
  trainStartIdx: number;
  testStartIdx: number;
  testEndIdx: number;
  params: P | null;
  trainMetrics: Metrics | null;
  testMetrics: Metrics;
};

export type WalkForwardResult<P> = {
  windows: WalkForwardWindow<P>[];
  trades: Trade[];
  metrics: Metrics;
  endEquityUsd: number;
};

const spanDays = (candles: Candle[], from: number, to: number) =>
  to > from ? (candles[to - 1].time - candles[from].time + (candles[1]?.time - candles[0]?.time || 0)) / 86400 : 0;

/**
 * Rolling walk-forward: fit on `trainBars`, trade the next `testBars` with the
 * winner, roll forward, and report only the out-of-sample trades. Plans are
 * computed over the full history up to each window's end so indicator warm-up
 * matches what the live runner sees.
 */
export function walkForward<P>(
  candles: Candle[],
  grid: P[],
  makePlans: (candles: Candle[], params: P) => Plan[],
  opts: BacktestOptions,
  wf: WalkForwardOptions,
): WalkForwardResult<P> {
  const n = candles.length;
  const minTrades = wf.minTrainTrades ?? 1;
  const minPf = wf.minTrainProfitFactor ?? 1;
  const objective = wf.objective ?? ((m: Metrics) => m.netPnlUsd);
  const windows: WalkForwardWindow<P>[] = [];
  const trades: Trade[] = [];
  let equity = opts.startEquityUsd;

  for (let testStart = wf.trainBars; testStart < n; testStart += wf.testBars) {
    const testEnd = Math.min(n, testStart + wf.testBars);
    const trainStart = testStart - wf.trainBars;
    const history = candles.slice(0, testEnd);
    let best: { params: P; metrics: Metrics; plans: Plan[] } | null = null;
    for (const params of grid) {
      const plans = makePlans(history, params);
      const r = backtest(history, plans, { ...opts, range: { from: trainStart, to: testStart } });
      const m = computeMetrics(r.trades, opts.startEquityUsd, spanDays(candles, trainStart, testStart));
      if (m.trades < minTrades || m.profitFactor < minPf) continue;
      if (!best || objective(m) > objective(best.metrics)) best = { params, metrics: m, plans };
    }
    const testDays = spanDays(candles, testStart, testEnd);
    if (!best) {
      windows.push({ trainStartIdx: trainStart, testStartIdx: testStart, testEndIdx: testEnd, params: null, trainMetrics: null, testMetrics: computeMetrics([], equity, testDays) });
      continue;
    }
    const r = backtest(history, best.plans, { ...opts, startEquityUsd: equity, range: { from: testStart, to: testEnd } });
    trades.push(...r.trades);
    windows.push({
      trainStartIdx: trainStart,
      testStartIdx: testStart,
      testEndIdx: testEnd,
      params: best.params,
      trainMetrics: best.metrics,
      testMetrics: computeMetrics(r.trades, equity, testDays),
    });
    equity = r.endEquityUsd;
  }

  const firstTest = windows[0]?.testStartIdx ?? n;
  return {
    windows,
    trades,
    metrics: computeMetrics(trades, opts.startEquityUsd, spanDays(candles, firstTest, n)),
    endEquityUsd: equity,
  };
}
