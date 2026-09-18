import type { Candle } from './crypto-candles';

/**
 * ETF candle sources for the Markets Agent's equity lane.
 *
 * Daily history comes from Stooq's free CSV endpoint (decades of SPY/QQQ, and
 * IBIT since its Jan 2024 listing); hourly history comes from Yahoo's chart
 * API (about two years). Both are converted to the same Candle shape the
 * crypto lane's backtester consumes, so one walk-forward engine covers both
 * asset classes.
 */

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Stooq daily CSV: `Date,Open,High,Low,Close,Volume` with ISO dates. */
export function parseStooqCsv(csv: string): Candle[] {
  const out: Candle[] = [];
  for (const line of csv.split('\n')) {
    const cells = line.trim().split(',');
    if (cells.length < 6) continue;
    const time = Date.parse(`${cells[0]}T00:00:00Z`) / 1000;
    const [open, high, low, close, volume] = cells.slice(1, 6).map(Number);
    if (!Number.isFinite(time) || ![open, high, low, close, volume].every(Number.isFinite)) continue;
    out.push({ time, open, high, low, close, volume });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Yahoo v8 chart payload: timestamps plus parallel quote arrays, nulls for missing bars. */
export function parseYahooChart(payload: unknown): Candle[] {
  const result = (payload as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as
    | { timestamp?: unknown[]; indicators?: { quote?: { open?: unknown[]; high?: unknown[]; low?: unknown[]; close?: unknown[]; volume?: unknown[] }[] } }
    | undefined;
  const ts = result?.timestamp;
  const q = result?.indicators?.quote?.[0];
  if (!Array.isArray(ts) || !q) return [];
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const time = ts[i];
    const open = q.open?.[i], high = q.high?.[i], low = q.low?.[i], close = q.close?.[i], volume = q.volume?.[i];
    if (!finite(time) || !finite(open) || !finite(high) || !finite(low) || !finite(close) || !finite(volume)) continue;
    out.push({ time, open, high, low, close, volume });
  }
  return out.sort((a, b) => a.time - b.time);
}

/**
 * Calendar-bucket resample for session-based markets. The crypto `resample`
 * demands a full count of sub-bars per bucket, which is right for a 24/7 feed
 * but drops every equity week (5 sessions, not 7 days) and every session
 * (6.5 hours, not 24). Here a bucket is emitted whenever it has at least one
 * bar; causality is enforced downstream by alignHtf, which only consults a
 * higher-timeframe bar once the bucket's full window has elapsed.
 */
/**
 * Unix epoch day 0 was a Thursday, so naive weekly buckets run Thu-Wed and
 * split a Mon-Fri trading week in two. Pass this as anchorOffsetSec when
 * resampling to weeks so buckets start on Monday (1970-01-05 UTC).
 */
export const MONDAY_OFFSET_SEC = 4 * 86400;

export function resampleCalendar(candles: Candle[], granularitySec: number, anchorOffsetSec = 0): Candle[] {
  const buckets = new Map<number, Candle[]>();
  for (const c of candles) {
    const key = Math.floor((c.time - anchorOffsetSec) / granularitySec) * granularitySec + anchorOffsetSec;
    const list = buckets.get(key) ?? [];
    list.push(c);
    buckets.set(key, list);
  }
  const out: Candle[] = [];
  for (const [time, list] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    out.push({
      time,
      open: list[0].open,
      high: Math.max(...list.map((c) => c.high)),
      low: Math.min(...list.map((c) => c.low)),
      close: list[list.length - 1].close,
      volume: list.reduce((t, c) => t + c.volume, 0),
    });
  }
  return out;
}
