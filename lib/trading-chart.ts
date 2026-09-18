import type { TradeActivity, TradingAccountSnapshot, TradingPosition } from '@/lib/schemas';

/**
 * Geometry for the agent graph on /trading: one account's value over time with
 * the agent's trades marked on the line. Pure — no DOM, no React — so the shape
 * of the chart is pinned by tests and the component only draws the result.
 *
 * x is spread evenly across the samples rather than by wall-clock time: the
 * agent feeds snapshots on its own cadence, and even spacing keeps a sparse
 * early series readable instead of bunching every point against one edge.
 */

export type AgentSummary = {
  /** False until the agent has actually filled a trade — an empty, funded
   *  sleeve must read as idle, never as activity. */
  hasActed: boolean;
  tradeCount: number;
  lastTrade: TradeActivity | null;
  lastTradeAt: string | null;
  deployedUsd: number;
  idleCashUsd: number;
  unrealizedPnlUsd: number;
};

/** What the agent has actually done in its sleeve, from the fed rows only. */
export function agentSummary(
  snapshot: TradingAccountSnapshot | null,
  positions: TradingPosition[],
  trades: TradeActivity[],
): AgentSummary {
  const filled = trades
    .filter((t) => t.status === 'filled')
    .sort((a, b) => b.at.localeCompare(a.at));
  const sum = (ns: number[]) => round(ns.reduce((t, n) => t + n, 0));
  return {
    hasActed: filled.length > 0,
    tradeCount: filled.length,
    lastTrade: filled[0] ?? null,
    lastTradeAt: filled[0]?.at ?? null,
    deployedUsd: sum(positions.map((p) => p.marketValueUsd)),
    idleCashUsd: snapshot?.cashUsd ?? 0,
    unrealizedPnlUsd: sum(positions.map((p) => p.unrealizedPnlUsd)),
  };
}

export type ChartPoint = { x: number; y: number; at: string; valueUsd: number };
export type ChartMarker = { x: number; y: number; trade: TradeActivity };

export type ChartGeometry = {
  points: ChartPoint[];
  markers: ChartMarker[];
  /** `d` for the line and for the same line closed into the area beneath it. */
  line: string;
  area: string;
  firstUsd: number;
  lastUsd: number;
  changeUsd: number;
  changePct: number;
  minUsd: number;
  maxUsd: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

export function chartGeometry(
  history: TradingAccountSnapshot[],
  trades: TradeActivity[],
  { w, h, pad = 4 }: { w: number; h: number; pad?: number },
): ChartGeometry | null {
  // Two points are the minimum that can describe a move.
  if (history.length < 2) return null;

  const series = [...history].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const values = series.map((s) => s.accountValueUsd);
  const minUsd = Math.min(...values);
  const maxUsd = Math.max(...values);
  const span = maxUsd - minUsd;
  const top = pad;
  const usable = Math.max(0, h - pad * 2);

  const points: ChartPoint[] = series.map((s, i) => ({
    x: round((i / (series.length - 1)) * w),
    // A flat series has no range to scale against — park it on the centre line
    // rather than dividing by zero.
    y: round(span === 0 ? h / 2 : top + (1 - (s.accountValueUsd - minUsd) / span) * usable),
    at: s.capturedAt,
    valueUsd: s.accountValueUsd,
  }));

  const firstUsd = values[0];
  const lastUsd = values[values.length - 1];
  const changeUsd = round(lastUsd - firstUsd);

  const from = series[0].capturedAt;
  const to = series[series.length - 1].capturedAt;
  const markers: ChartMarker[] = trades
    .filter((t) => t.at >= from && t.at <= to)
    .map((t) => {
      // Snap to the sample nearest in time; the line only exists at samples.
      const nearest = points.reduce((best, p) =>
        Math.abs(Date.parse(p.at) - Date.parse(t.at)) < Math.abs(Date.parse(best.at) - Date.parse(t.at)) ? p : best,
      );
      return { x: nearest.x, y: nearest.y, trade: t };
    });

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  return {
    points,
    markers,
    line,
    area: `${line} L${w},${h} L0,${h} Z`,
    firstUsd,
    lastUsd,
    changeUsd,
    changePct: firstUsd === 0 ? 0 : round((changeUsd / firstUsd) * 100),
    minUsd,
    maxUsd,
  };
}
