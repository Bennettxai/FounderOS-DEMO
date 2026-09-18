import type { Candle } from './crypto-candles';
import type { Trade } from './crypto-backtest';

/**
 * Helpers for the crypto backtest report: parameter grids, the Monte Carlo
 * drawdown reshuffle the research calls for, and a buy-and-hold benchmark.
 */

/** Cartesian product of `axes` laid over `base`. */
export function expandGrid<P extends object>(base: P, axes: { [K in keyof P]?: P[K][] }): P[] {
  let out: P[] = [{ ...base }];
  for (const key of Object.keys(axes) as (keyof P)[]) {
    const values = axes[key];
    if (!values || values.length === 0) continue;
    const next: P[] = [];
    for (const p of out) for (const v of values) next.push({ ...p, [key]: v });
    out = next;
  }
  return out;
}

export type MonteCarlo = { samples: number; medianMaxDdPct: number; p95MaxDdPct: number; worstMaxDdPct: number };

function maxDrawdownPct(pnls: number[], startEquity: number): number {
  let eq = startEquity, peak = startEquity, dd = 0;
  for (const p of pnls) {
    eq += p;
    peak = Math.max(peak, eq);
    dd = Math.max(dd, peak > 0 ? (peak - eq) / peak : 0);
  }
  return dd * 100;
}

/**
 * Reshuffle the order of the realised trades many times and read the max
 * drawdown distribution: the observed path is one draw, and the 95th
 * percentile is the number to size against.
 */
export function monteCarloDrawdown(trades: Trade[], startEquity: number, samples = 2000, seed = 1): MonteCarlo {
  if (trades.length === 0) return { samples, medianMaxDdPct: 0, p95MaxDdPct: 0, worstMaxDdPct: 0 };
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pnls = trades.map((t) => t.pnlUsd);
  const dds: number[] = [];
  for (let k = 0; k < samples; k++) {
    const a = pnls.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    dds.push(maxDrawdownPct(a, startEquity));
  }
  dds.sort((x, y) => x - y);
  const at = (q: number) => dds[Math.min(dds.length - 1, Math.floor(q * dds.length))];
  return { samples, medianMaxDdPct: at(0.5), p95MaxDdPct: at(0.95), worstMaxDdPct: dds[dds.length - 1] };
}

/** Close-to-close return over candles[from..to), less one round-trip cost. */
export function buyAndHoldPct(candles: Candle[], from: number, to: number, costRoundTripPct: number): number {
  const end = Math.min(to, candles.length) - 1;
  if (end <= from) return 0;
  return (candles[end].close / candles[from].close - 1) * 100 - costRoundTripPct;
}

export const fmtPct = (x: number, d = 1) => `${x < 0 ? '-' : '+'}${Math.abs(x).toFixed(d)}%`;
