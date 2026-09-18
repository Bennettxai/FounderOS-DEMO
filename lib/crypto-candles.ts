/**
 * Candles for the crypto lane of the Markets Agent.
 *
 * The Robinhood MCP has no crypto historicals, so both the backtest and the
 * live signal engine read Coinbase Exchange candles (public, keyless, 300 bars
 * per request). Live and backtest share this one loader on purpose: the
 * strategy is only "backtested" if the bars it trades on are the bars it was
 * tested on.
 */

export type Candle = {
  /** Unix seconds, bar open. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Coinbase rows arrive as [time, low, high, open, close, volume], newest first. */
export function parseCoinbaseRows(rows: unknown[][]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 6 || !row.every(finite)) continue;
    const [time, low, high, open, close, volume] = row as number[];
    if (!byTime.has(time)) byTime.set(time, { time, open, high, low, close, volume });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export function toCsv(candles: Candle[]): string {
  return candles.map((c) => [c.time, c.open, c.high, c.low, c.close, c.volume].join(',')).join('\n') + '\n';
}

export function parseCandleCsv(csv: string): Candle[] {
  const out: Candle[] = [];
  for (const line of csv.split('\n')) {
    const cells = line.trim().split(',');
    if (cells.length !== 6) continue;
    const nums = cells.map(Number);
    if (!nums.every(Number.isFinite)) continue; // header row
    const [time, open, high, low, close, volume] = nums;
    out.push({ time, open, high, low, close, volume });
  }
  return out.sort((a, b) => a.time - b.time);
}

/**
 * Fold bars into a coarser granularity. A bucket is emitted only when every
 * sub-bar is present, so a gap in the feed (or the still-forming current bar)
 * can never produce a half-formed candle that looks like a real one.
 */
export function resample(candles: Candle[], granularitySec: number): Candle[] {
  if (candles.length < 2) return [];
  const step = candles[1].time - candles[0].time;
  const per = Math.round(granularitySec / step);
  if (per < 1) return [];
  const buckets = new Map<number, Candle[]>();
  for (const c of candles) {
    const key = Math.floor(c.time / granularitySec) * granularitySec;
    const list = buckets.get(key) ?? [];
    list.push(c);
    buckets.set(key, list);
  }
  const out: Candle[] = [];
  for (const [time, list] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    if (list.length !== per) continue;
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

export const COINBASE_BASE = 'https://api.exchange.coinbase.com';
const PAGE = 300;

/**
 * Fetch [startSec, endSec] as ascending candles, paging backwards 300 bars at
 * a time. Any page that fails after retries throws: a series with a hole in it
 * would silently shift every indicator, which is worse than no series.
 */
export async function fetchCoinbaseCandles(
  pair: string,
  granularitySec: number,
  startSec: number,
  endSec: number,
  doFetch: typeof fetch = fetch,
  opts: { retries?: number; pauseMs?: number; base?: string } = {},
): Promise<Candle[]> {
  const retries = opts.retries ?? 4;
  const pauseMs = opts.pauseMs ?? 120;
  const base = opts.base ?? COINBASE_BASE;
  const rows: unknown[][] = [];
  let end = endSec;
  while (end > startSec) {
    const start = Math.max(startSec, end - PAGE * granularitySec);
    const url =
      `${base}/products/${pair}/candles?granularity=${granularitySec}` +
      `&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`;
    let lastStatus = 0;
    let page: unknown[][] | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const res = await doFetch(url);
      if (res.ok) { page = (await res.json()) as unknown[][]; break; }
      lastStatus = res.status;
      await new Promise((r) => setTimeout(r, pauseMs * 5 * (attempt + 1)));
    }
    if (!page) throw new Error(`Coinbase candles ${pair} ${granularitySec}s: HTTP ${lastStatus} after ${retries + 1} attempts`);
    rows.push(...page);
    // The page covers (start, end]; step past `start` so the boundary bar is not re-fetched.
    end = start - granularitySec;
    if (end > startSec) await new Promise((r) => setTimeout(r, pauseMs));
  }
  return parseCoinbaseRows(rows).filter((c) => c.time >= startSec && c.time <= endSec);
}
