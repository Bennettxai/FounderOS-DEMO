import { GATED, connected as gatedConnected } from '@/lib/connectors/demo-status';
/**
 * Robinhood connector — the agentic trading account.
 *
 * There is no key to resolve here: the Robinhood Trading MCP is agent-facing
 * (OAuth, driven by an AI agent, not callable by this webapp). So the OS is
 * fed indirectly — a trading agent running the MCP in its own runtime pushes
 * account snapshots + trades to /api/trading/*, and this connector reports on
 * whether that feed is live. Honest by construction: no snapshot ⇒
 * not_configured; a snapshot ⇒ connected, with how long ago it was fed.
 */
import type { ConnectorStatus } from '@/lib/connectors/types';
import type { TradingAccountSnapshot } from '@/lib/schemas';

/** Human "N min/hour ago" from an ISO timestamp. */
function ago(iso: string, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  return `${Math.round(hrs / 24)} day${Math.round(hrs / 24) === 1 ? '' : 's'} ago`;
}

/** Status from the latest fed snapshots — one account or every account (null /
 *  empty when the agent hasn't pushed yet). Value and buying power are summed
 *  across accounts, and the freshness is that of the most recent push. */
export function robinhoodStatus(
  fed: TradingAccountSnapshot | TradingAccountSnapshot[] | null,
  now: Date = new Date(),
): ConnectorStatus {
  if (GATED) return gatedConnected('robinhood', 'Robinhood', 'payments', 'agentic trading account · live');
  const base = { id: 'robinhood', name: 'Robinhood', kind: 'payments' } as const;
  const accounts = fed === null ? [] : Array.isArray(fed) ? fed : [fed];
  if (accounts.length === 0) {
    return {
      ...base,
      state: 'not_configured',
      detail:
        'Robinhood not feeding the OS yet. Authenticate the Robinhood Trading MCP in an agent runtime, then push a snapshot to POST /api/trading/snapshot.',
    };
  }
  const sum = (pick: (s: TradingAccountSnapshot) => number) =>
    Math.round(accounts.reduce((t, a) => t + pick(a), 0) * 100) / 100;
  const freshest = accounts.reduce((a, b) => (a.capturedAt >= b.capturedAt ? a : b));
  const scope = accounts.length === 1 ? accounts[0].accountLabel : `${accounts.length} accounts`;
  return {
    ...base,
    state: 'connected',
    detail: `${scope} · updated ${ago(freshest.capturedAt, now)}`,
    meta: { accountValueUsd: sum((a) => a.accountValueUsd), buyingPowerUsd: sum((a) => a.buyingPowerUsd) },
  };
}
