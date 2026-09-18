import { getDb } from '@/lib/data';
import { robinhoodStatus } from '@/lib/connectors/robinhood';
import { phantomBalance } from '@/lib/connectors/phantom';
import { AGENTIC_ID, type TradingPayload } from '@/lib/trading-view';

export { AGENTIC_ID, type TradingPayload };

/**
 * One builder for the /trading payload, used by both the server page and
 * GET /api/trading, so the board's refresh can never show a different picture
 * from first paint. The shape lives in lib/trading-view.ts (pure) because the
 * client board imports it and must never reach sqlite or the filesystem.
 */
export async function tradingPayload(): Promise<TradingPayload> {
  const db = getDb();
  const accounts = db.trading.latestSnapshots();
  const history = Object.fromEntries(accounts.map((a) => [a.accountId, db.trading.history(a.accountId)]));
  // Read-only, and a price outage must not blank the balance.
  const phantom = await phantomBalance();
  return {
    accounts,
    history,
    snapshot: accounts[0] ?? null,
    positions: db.trading.positions(),
    activity: db.trading.activity(50),
    analysis: db.trading.latestAnalysis(AGENTIC_ID),
    openOrders: db.trading.openOrders(),
    status: robinhoodStatus(accounts),
    source: accounts[0]?.source ?? null,
    phantom,
    at: new Date().toISOString(),
  };
}
