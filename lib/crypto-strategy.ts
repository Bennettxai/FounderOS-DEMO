import type { Candle } from './crypto-candles';
import type { Plan } from './crypto-backtest';
import { adx, atr, donchian, ema, macd, rollingVwap, rsi, sma } from './crypto-indicators';

/**
 * Deterministic signal engine for the crypto lane. The same code produces the
 * plans the backtester consumes and the plans the live runner acts on, so a
 * backtest number describes exactly the rules that will trade. No LLM sits in
 * the decision. Everything here is causal: the plan for bar i is a function of
 * bars 0..i only (pinned by tests/crypto-strategy.test.ts), and the backtester
 * fills it at the open of bar i+1.
 *
 * Research basis (scratchpad/strategy-research.md): at a 50-190bp round trip,
 * only trend/breakout systems with a hard cost-aware frequency filter have a
 * survival path, so the engine scores a confluence of trend, higher-timeframe
 * agreement, strength (ADX), momentum (MACD), volume and VWAP, and only fires on
 * a Donchian breakout or an EMA pullback when at least `minScore` agree. Exits
 * are an ATR stop, an ATR trailing stop and a trend-flip signal. The
 * mean-reversion variant (short RSI washout, time-boxed) exists so its
 * cost-adjusted numbers can be shown next to the trend numbers, not because the
 * research expects it to survive the spread.
 */

/** Indicator lengths shared by both strategies. */
export type FeatureParams = {
  emaFastLen: number;
  emaSlowLen: number;
  atrLen: number;
  rsiLen: number;
  adxLen: number;
  donLen: number;
  volLen: number;
  vwapLen: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  /** Higher-timeframe regime: bull when the HTF close sits above this EMA. */
  htfEmaLen: number;
  /** Bar sizes in seconds; inferred from the candles when omitted. */
  ltfGranSec?: number;
  htfGranSec?: number;
};

export type ConfluenceParams = FeatureParams & {
  /** Minimum number of agreeing signals (out of 7) before an entry fires. */
  minScore: number;
  mode: 'breakout' | 'pullback' | 'both';
  /** When set, no entry without a closed, bullish higher-timeframe bar. */
  requireHtf: boolean;
  /** RSI above this is a chase; the entry is vetoed. */
  rsiMax: number;
  adxMin: number;
  /** Volume must exceed volMult × its moving average to count. */
  volMult: number;
  stopAtrMult: number;
  trailAtrMult: number;
  /**
   * Cost-aware filter: ATR as a fraction of price must be at least this, so
   * the expected move is large relative to the round-trip cost. 0 disables.
   */
  minAtrPct: number;
  maxBars?: number;
};

export type MeanRevParams = FeatureParams & {
  requireHtf: boolean;
  rsiOversold: number;
  /** Exit signal once the short RSI has recovered above this. */
  rsiExit: number;
  maxBars: number;
  stopAtrMult: number;
  targetAtrMult: number;
  /** 0 disables the "close above the slow EMA" regime filter. */
  trendLen: number;
  minAtrPct: number;
};

const FEATURE_DEFAULTS: FeatureParams = {
  emaFastLen: 20,
  emaSlowLen: 50,
  atrLen: 14,
  rsiLen: 14,
  adxLen: 14,
  donLen: 20,
  volLen: 20,
  vwapLen: 20,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  htfEmaLen: 50,
};

export const DEFAULT_CONFLUENCE: ConfluenceParams = {
  ...FEATURE_DEFAULTS,
  minScore: 5,
  mode: 'breakout',
  requireHtf: true,
  rsiMax: 75,
  adxMin: 20,
  volMult: 1.2,
  stopAtrMult: 2,
  trailAtrMult: 3,
  minAtrPct: 0,
};

export const DEFAULT_MEANREV: MeanRevParams = {
  ...FEATURE_DEFAULTS,
  rsiLen: 3,
  requireHtf: true,
  rsiOversold: 20,
  rsiExit: 60,
  maxBars: 8,
  stopAtrMult: 2,
  targetAtrMult: 2,
  trendLen: 200,
  minAtrPct: 0,
};

export type Features = {
  close: number[];
  high: number[];
  low: number[];
  volume: number[];
  emaFast: number[];
  emaSlow: number[];
  atr: number[];
  rsi: number[];
  adx: number[];
  plusDi: number[];
  minusDi: number[];
  macdHist: number[];
  donUpper: number[];
  donLower: number[];
  volSma: number[];
  vwap: number[];
  htfBull: boolean[];
};

/**
 * For each trade-timeframe bar, the index of the last higher-timeframe bar
 * that had CLOSED by the end of that trade bar (-1 before any had). A bar that
 * opened at t on the higher timeframe closes at t + htfGranSec; the trade bar
 * ends at its own time + ltfGranSec. Using the still-open HTF bar would leak
 * the future into the signal.
 */
export function alignHtf(ltf: Candle[], htf: Candle[], htfGranSec: number, ltfGranSec: number): number[] {
  const out = new Array<number>(ltf.length);
  let j = -1;
  for (let i = 0; i < ltf.length; i++) {
    const endsAt = ltf[i].time + ltfGranSec;
    while (j + 1 < htf.length && htf[j + 1].time + htfGranSec <= endsAt) j++;
    out[i] = j;
  }
  return out;
}

function inferGranularity(candles: Candle[], fallback: number): number {
  if (candles.length < 2) return fallback;
  const diffs: number[] = [];
  for (let i = 1; i < Math.min(candles.length, 50); i++) diffs.push(candles[i].time - candles[i - 1].time);
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

export function buildFeatures(ltf: Candle[], htf: Candle[], params: FeatureParams): Features {
  const close = ltf.map((c) => c.close);
  const ltfGran = params.ltfGranSec ?? inferGranularity(ltf, 900);
  const htfGran = params.htfGranSec ?? inferGranularity(htf, ltfGran * 4);
  const idx = alignHtf(ltf, htf, htfGran, ltfGran);
  const htfClose = htf.map((c) => c.close);
  const htfEma = ema(htfClose, params.htfEmaLen);
  const htfBull = idx.map((j) => j >= 0 && Number.isFinite(htfEma[j]) && htfClose[j] > htfEma[j]);
  const d = donchian(ltf, params.donLen);
  const a = adx(ltf, params.adxLen);
  const m = macd(close, params.macdFast, params.macdSlow, params.macdSignal);
  return {
    close,
    high: ltf.map((c) => c.high),
    low: ltf.map((c) => c.low),
    volume: ltf.map((c) => c.volume),
    emaFast: ema(close, params.emaFastLen),
    emaSlow: ema(close, params.emaSlowLen),
    atr: atr(ltf, params.atrLen),
    rsi: rsi(close, params.rsiLen),
    adx: a.adx,
    plusDi: a.plusDi,
    minusDi: a.minusDi,
    macdHist: m.hist,
    donUpper: d.upper,
    donLower: d.lower,
    volSma: sma(ltf.map((c) => c.volume), params.volLen),
    vwap: rollingVwap(ltf, params.vwapLen),
    htfBull,
  };
}

export type BarScore = { score: number; signals: string[]; trigger: boolean; veto: string[] };

/** Count the agreeing signals at bar i. The trigger is one of the seven. */
export function scoreBar(f: Features, i: number, p: ConfluenceParams): BarScore {
  const signals: string[] = [];
  const veto: string[] = [];
  const uptrend = f.emaFast[i] > f.emaSlow[i];
  if (uptrend) signals.push('trend');
  if (f.htfBull[i]) signals.push('htf');
  if (f.adx[i] > p.adxMin && f.plusDi[i] > f.minusDi[i]) signals.push('strength');
  if (f.macdHist[i] > 0 && i > 0 && f.macdHist[i] > f.macdHist[i - 1]) signals.push('momentum');
  if (f.volume[i] > f.volSma[i] * p.volMult) signals.push('volume');
  if (f.close[i] > f.vwap[i]) signals.push('vwap');

  const breakout = f.close[i] > f.donUpper[i];
  const pullback = i > 0 && uptrend && f.close[i - 1] < f.emaFast[i - 1] && f.close[i] > f.emaFast[i];
  let triggered = false;
  if ((p.mode === 'breakout' || p.mode === 'both') && breakout) { signals.push('breakout'); triggered = true; }
  if ((p.mode === 'pullback' || p.mode === 'both') && pullback && !triggered) { signals.push('pullback'); triggered = true; }

  if (f.rsi[i] > p.rsiMax) veto.push('rsi');
  if (p.requireHtf && !f.htfBull[i]) veto.push('htf');
  if (!(f.atr[i] > 0)) veto.push('atr');
  if (p.minAtrPct > 0 && f.atr[i] / f.close[i] < p.minAtrPct) veto.push('cost');

  return { score: signals.length, signals, trigger: triggered && veto.length === 0, veto };
}

/** Trend/breakout confluence plans, one per bar, index-aligned with `ltf`. */
export function confluencePlans(ltf: Candle[], htf: Candle[], p: ConfluenceParams): Plan[] {
  const f = buildFeatures(ltf, htf, p);
  const plans: Plan[] = new Array(ltf.length);
  for (let i = 0; i < ltf.length; i++) {
    const plan: Plan = {};
    const s = scoreBar(f, i, p);
    if (s.trigger && s.score >= p.minScore) {
      const stopUsd = f.close[i] - p.stopAtrMult * f.atr[i];
      plan.enter = {
        stopUsd,
        trailUsd: p.trailAtrMult * f.atr[i],
        maxBars: p.maxBars,
        note: `score=${s.score} ${s.signals.join('+')}`,
      };
    }
    // Trend flip closes the position at the next open.
    if (Number.isFinite(f.emaSlow[i]) && f.emaFast[i] < f.emaSlow[i]) plan.exit = true;
    plans[i] = plan;
  }
  return plans;
}

/** Short-RSI washout plans: buy the flush in an uptrend, time-boxed. */
export function meanReversionPlans(ltf: Candle[], htf: Candle[], p: MeanRevParams): Plan[] {
  const f = buildFeatures(ltf, htf, p);
  const trendEma = p.trendLen > 0 ? ema(f.close, p.trendLen) : null;
  const plans: Plan[] = new Array(ltf.length);
  for (let i = 0; i < ltf.length; i++) {
    const plan: Plan = {};
    const washed = f.rsi[i] < p.rsiOversold;
    const regime = trendEma ? f.close[i] > trendEma[i] : true;
    const htfOk = p.requireHtf ? f.htfBull[i] : true;
    const costOk = p.minAtrPct <= 0 || f.atr[i] / f.close[i] >= p.minAtrPct;
    if (washed && regime && htfOk && costOk && f.atr[i] > 0) {
      plan.enter = {
        stopUsd: f.close[i] - p.stopAtrMult * f.atr[i],
        targetUsd: f.close[i] + p.targetAtrMult * f.atr[i],
        maxBars: p.maxBars,
        note: `rsi${p.rsiLen}=${f.rsi[i].toFixed(1)}`,
      };
    }
    if (f.rsi[i] > p.rsiExit) plan.exit = true;
    plans[i] = plan;
  }
  return plans;
}
