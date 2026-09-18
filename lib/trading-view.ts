import type { ConnectorStatus } from '@/lib/connectors/types';
import type { TradeActivity, TradeAnalysis, TradingAccountSnapshot, TradingOrder, TradingPosition } from '@/lib/schemas';

/** The sleeve the agent is allowed to trade; everything else is read-only to it. */
export const AGENTIC_ID = 'agentic';

/** The wallet as the board sees it: a public address read from a public RPC. */
export type PhantomView = {
  address: string;
  sol: number;
  usdPerSol: number | null;
  usdValue: number | null;
  fetchedAt: string;
};

/** "68SH…BST2" — the first and last four of a base58 address. */
export function shortAddress(address: string): string {
  return address.length <= 10 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Everything the /trading slab draws. Built once by lib/trading-payload.ts and
 * served two ways: the server page hands it to the board as `initial`, and
 * GET /api/trading returns the identical shape for the board's 60s refresh.
 */
export type TradingPayload = {
  accounts: TradingAccountSnapshot[];
  history: Record<string, TradingAccountSnapshot[]>;
  /** The largest account, kept so single-account readers still work. */
  snapshot: TradingAccountSnapshot | null;
  positions: TradingPosition[];
  activity: TradeActivity[];
  /** The agent's reasoning: the only thing on screen on a no-trade day. */
  analysis: TradeAnalysis | null;
  /** Live at the broker right now — state, not history. */
  openOrders: TradingOrder[];
  status: ConnectorStatus;
  source: string | null;
  /** null when the wallet is unreachable; the connector already fails soft. */
  phantom: PhantomView | null;
  /** When this payload was built, so the board can age it honestly. */
  at: string;
};

/**
 * Pure helpers behind the /trading slab. No DOM, no React: the board draws
 * what these return, so freshness, attribution and the size buckets are
 * pinned by tests/trading-view.test.ts rather than read off the JSX.
 */

const MIN = 60_000;

/** "synced Nm ago" in the Brand Deals voice. */
export function syncAge(iso: string, now: number = Date.now()): string {
  const m = Math.max(0, Math.floor((now - Date.parse(iso)) / MIN));
  if (m < 1) return 'synced just now';
  if (m < 60) return `synced ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `synced ${h}h ago`;
  return `synced ${Math.floor(h / 24)}d ago`;
}

export type Freshness = { state: 'none' | 'seeded' | 'live' | 'stale'; label: string };

/** Feed liveness, decided by the freshest real push. Seeded rows are never
 *  live however recent their timestamp; a real push older than 90 minutes is
 *  stale (the feed runs every 30 in market hours, so 90 is three misses). */
export function freshness(accounts: TradingAccountSnapshot[], now: number = Date.now()): Freshness {
  if (accounts.length === 0) return { state: 'none', label: 'no feed yet' };
  const real = accounts.filter((a) => a.source !== 'seed');
  if (real.length === 0) return { state: 'seeded', label: 'seeded · example rows' };
  const freshest = real.reduce((a, b) => (a.capturedAt >= b.capturedAt ? a : b));
  const label = syncAge(freshest.capturedAt, now);
  const age = now - Date.parse(freshest.capturedAt);
  return { state: age <= 90 * MIN ? 'live' : 'stale', label };
}

const SIZE_BUCKETS: Array<{ label: string; max: number }> = [
  { label: '<$50', max: 50 },
  { label: '$50-250', max: 250 },
  { label: '$250-1k', max: 1000 },
  { label: '$1k+', max: Infinity },
];

/** The book by market value, every bucket present so the dot matrix keeps
 *  its columns when the sleeve holds one thing. */
export function positionSizes(positions: TradingPosition[]): Array<{ label: string; count: number }> {
  return SIZE_BUCKETS.map((b, i) => {
    const min = i === 0 ? -Infinity : SIZE_BUCKETS[i - 1].max;
    return { label: b.label, count: positions.filter((p) => p.marketValueUsd >= min && p.marketValueUsd < b.max).length };
  });
}

export type ActivityFilter = 'all' | 'agent' | 'you' | 'rejected';

const isAgent = (a: TradeActivity) => /agent/i.test(a.agent) && !/operator/i.test(a.agent);

/** Who did it and how it ended. "you" is anything a human placed, manual or
 *  override; "agent" is the Markets Agent whatever the outcome; "rejected" is
 *  the orders that never reached a fill. */
export function filterActivity(rows: TradeActivity[], filter: ActivityFilter): TradeActivity[] {
  switch (filter) {
    case 'agent':
      return rows.filter(isAgent);
    case 'you':
      return rows.filter((a) => !isAgent(a));
    case 'rejected':
      return rows.filter((a) => a.status === 'rejected');
    default:
      return rows;
  }
}

export function activityCounts(rows: TradeActivity[]): Record<ActivityFilter, number> {
  return {
    all: rows.length,
    agent: filterActivity(rows, 'agent').length,
    you: filterActivity(rows, 'you').length,
    rejected: filterActivity(rows, 'rejected').length,
  };
}
