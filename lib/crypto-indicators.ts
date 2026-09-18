/**
 * Textbook indicators for the crypto strategy. Every function returns a series
 * index-aligned with its input, NaN until warmed up, so a consumer can never
 * accidentally read a value that has not been computed yet.
 */
import type { Candle } from './crypto-candles';

const nan = (n: number) => new Array<number>(n).fill(NaN);

export function sma(values: number[], n: number): number[] {
  const out = nan(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(values: number[], n: number): number[] {
  const out = nan(values.length);
  const k = 2 / (n + 1);
  let seed = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < n - 1) { seed += values[i]; continue; }
    if (i === n - 1) { out[i] = (seed + values[i]) / n; continue; }
    out[i] = out[i - 1] + (values[i] - out[i - 1]) * k;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(values: number[], n: number): number[] {
  const out = nan(values.length);
  let gain = 0, loss = 0;
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = Math.max(d, 0), l = Math.max(-d, 0);
    if (i <= n) {
      gain += g; loss += l;
      if (i === n) { gain /= n; loss /= n; out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss); }
      continue;
    }
    gain = (gain * (n - 1) + g) / n;
    loss = (loss * (n - 1) + l) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function trueRange(candles: Candle[]): number[] {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
}

/** Wilder ATR: simple mean of the first n true ranges, then smoothed. */
export function atr(candles: Candle[], n: number): number[] {
  const tr = trueRange(candles);
  const out = nan(candles.length);
  let acc = 0;
  for (let i = 0; i < tr.length; i++) {
    if (i < n - 1) { acc += tr[i]; continue; }
    if (i === n - 1) { out[i] = (acc + tr[i]) / n; continue; }
    out[i] = (out[i - 1] * (n - 1) + tr[i]) / n;
  }
  return out;
}

export function bollinger(values: number[], n: number, k: number) {
  const mid = sma(values, n);
  const upper = nan(values.length), lower = nan(values.length), width = nan(values.length);
  for (let i = n - 1; i < values.length; i++) {
    let ss = 0;
    for (let j = i - n + 1; j <= i; j++) ss += (values[j] - mid[i]) ** 2;
    const sd = Math.sqrt(ss / n);
    upper[i] = mid[i] + k * sd;
    lower[i] = mid[i] - k * sd;
    width[i] = mid[i] === 0 ? NaN : (upper[i] - lower[i]) / mid[i];
  }
  return { mid, upper, lower, width };
}

/** Prior-N-bar channel, excluding the current bar (so a breakout is visible). */
export function donchian(candles: Candle[], n: number) {
  const upper = nan(candles.length), lower = nan(candles.length);
  for (let i = n; i < candles.length; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - n; j < i; j++) { hi = Math.max(hi, candles[j].high); lo = Math.min(lo, candles[j].low); }
    upper[i] = hi; lower[i] = lo;
  }
  return { upper, lower };
}

/** Wilder ADX with +DI / -DI. */
export function adx(candles: Candle[], n: number) {
  const len = candles.length;
  const tr = trueRange(candles);
  const plusDm = nan(len), minusDm = nan(len);
  for (let i = 0; i < len; i++) {
    if (i === 0) { plusDm[i] = 0; minusDm[i] = 0; continue; }
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
  }
  const smooth = (s: number[]) => {
    const out = nan(len);
    let acc = 0;
    for (let i = 0; i < len; i++) {
      if (i < n - 1) { acc += s[i]; continue; }
      if (i === n - 1) { out[i] = acc + s[i]; continue; }
      out[i] = out[i - 1] - out[i - 1] / n + s[i];
    }
    return out;
  };
  const trS = smooth(tr), pS = smooth(plusDm), mS = smooth(minusDm);
  const plusDi = nan(len), minusDi = nan(len), dx = nan(len), out = nan(len);
  for (let i = n - 1; i < len; i++) {
    plusDi[i] = trS[i] === 0 ? 0 : (100 * pS[i]) / trS[i];
    minusDi[i] = trS[i] === 0 ? 0 : (100 * mS[i]) / trS[i];
    const sum = plusDi[i] + minusDi[i];
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(plusDi[i] - minusDi[i])) / sum;
  }
  let acc = 0;
  for (let i = n - 1; i < len; i++) {
    const j = i - (n - 1);
    if (j < n - 1) { acc += dx[i]; continue; }
    if (j === n - 1) { out[i] = (acc + dx[i]) / n; continue; }
    out[i] = (out[i - 1] * (n - 1) + dx[i]) / n;
  }
  return { adx: out, plusDi, minusDi };
}

export function macd(values: number[], fast: number, slow: number, signalN: number) {
  const f = ema(values, fast), s = ema(values, slow);
  const line = values.map((_, i) => f[i] - s[i]);
  // Signal EMA over the valid part of the line only.
  const first = line.findIndex((v) => !Number.isNaN(v));
  const signal = nan(values.length);
  if (first >= 0) {
    const sig = ema(line.slice(first), signalN);
    for (let i = 0; i < sig.length; i++) signal[first + i] = sig[i];
  }
  const hist = line.map((v, i) => v - signal[i]);
  return { line, signal, hist };
}

/** Volume-weighted average of the typical price over the trailing window. */
export function rollingVwap(candles: Candle[], n: number): number[] {
  const out = nan(candles.length);
  let pv = 0, vol = 0;
  const tp = (c: Candle) => (c.high + c.low + c.close) / 3;
  for (let i = 0; i < candles.length; i++) {
    pv += tp(candles[i]) * candles[i].volume;
    vol += candles[i].volume;
    if (i >= n) { pv -= tp(candles[i - n]) * candles[i - n].volume; vol -= candles[i - n].volume; }
    if (i >= n - 1) out[i] = vol === 0 ? NaN : pv / vol;
  }
  return out;
}

/** Fractional change over n bars. */
export function slope(values: number[], n: number): number[] {
  return values.map((v, i) => (i < n || !values[i - n] ? NaN : (v - values[i - n]) / values[i - n]));
}
