import { describe, expect, test } from 'vitest';
import { checkOrder, DEFAULT_LIMITS, type ProposedOrder, type SleeveState } from '@/lib/trading-guardrails';

/**
 * The agent decides, this decides whether it is allowed to happen. The trading
 * agent runs as a headless Claude with the Robinhood MCP, so the prompt alone
 * cannot be the control — every order it proposes is validated HERE, in code,
 * before anything is placed. Deny is the default: an order passes only by
 * satisfying every rule.
 */

const sleeve: SleeveState = {
  accountValueUsd: 600,
  cashUsd: 600,
  positions: [],
};

const buy = (over: Partial<ProposedOrder> = {}): ProposedOrder => ({
  symbol: 'IBIT',
  side: 'buy',
  notionalUsd: 50,
  orderType: 'market',
  ...over,
});

const ctx = { tradesToday: 0, marketOpen: true };

const allowed = (r: { allowed: boolean; reasons: string[] }) => r.allowed;

describe('checkOrder — a clean order', () => {
  test('passes when every rule is satisfied', () => {
    const r = checkOrder(buy(), sleeve, DEFAULT_LIMITS, ctx);
    expect(r.allowed).toBe(true);
    expect(r.reasons).toEqual([]);
  });
});

describe('checkOrder — hard stops', () => {
  test('refuses to trade outside market hours', () => {
    const r = checkOrder(buy(), sleeve, DEFAULT_LIMITS, { ...ctx, marketOpen: false });
    expect(allowed(r)).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/market/i);
  });

  test('refuses once the daily trade cap is spent', () => {
    const limits = { ...DEFAULT_LIMITS, maxTradesPerDay: 3 };
    expect(allowed(checkOrder(buy(), sleeve, limits, { ...ctx, tradesToday: 2 }))).toBe(true);
    const r = checkOrder(buy(), sleeve, limits, { ...ctx, tradesToday: 3 });
    expect(allowed(r)).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/cap|limit/i);
  });

  test('refuses any order for an account that is not the agentic sleeve', () => {
    const r = checkOrder({ ...buy(), accountNumber: '700100001' }, sleeve, DEFAULT_LIMITS, ctx);
    expect(allowed(r)).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/account/i);
  });

  test('refuses anything that is not a plain equity buy or sell', () => {
    // options, shorts and exotic types never reach the broker
    const r = checkOrder({ ...buy(), side: 'short' as unknown as 'buy' }, sleeve, DEFAULT_LIMITS, ctx);
    expect(allowed(r)).toBe(false);
  });
});

describe('checkOrder — drawdown floor', () => {
  const drained: SleeveState = { accountValueUsd: 400, cashUsd: 50, positions: [{ symbol: 'IBIT', quantity: 1, marketValueUsd: 350 }] };
  const limits = { ...DEFAULT_LIMITS, minSleeveValueUsd: 450 };

  test('blocks buying once the sleeve falls through the floor', () => {
    const r = checkOrder(buy({ notionalUsd: 40 }), drained, limits, ctx);
    expect(allowed(r)).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/floor|drawdown/i);
  });

  test('still allows selling below the floor, because selling reduces risk', () => {
    const r = checkOrder({ symbol: 'IBIT', side: 'sell', quantity: 1, orderType: 'market' }, drained, limits, ctx);
    expect(r.allowed).toBe(true);
  });
});

describe('checkOrder — sizing', () => {
  test('refuses a trade larger than the per-trade cap', () => {
    const limits = { ...DEFAULT_LIMITS, maxNotionalPerTradeUsd: 100, maxPositionPctOfSleeve: 100 };
    expect(allowed(checkOrder(buy({ notionalUsd: 100 }), sleeve, limits, ctx))).toBe(true);
    expect(allowed(checkOrder(buy({ notionalUsd: 100.01 }), sleeve, limits, ctx))).toBe(false);
  });

  test('refuses to spend cash the sleeve does not have', () => {
    const broke: SleeveState = { ...sleeve, cashUsd: 30 };
    const r = checkOrder(buy({ notionalUsd: 50 }), broke, DEFAULT_LIMITS, ctx);
    expect(allowed(r)).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/cash/i);
  });

  test('refuses to concentrate more than the cap into one symbol', () => {
    const limits = { ...DEFAULT_LIMITS, maxPositionPctOfSleeve: 25, maxNotionalPerTradeUsd: 600 };
    const held: SleeveState = {
      accountValueUsd: 600,
      cashUsd: 500,
      positions: [{ symbol: 'IBIT', quantity: 1, marketValueUsd: 100 }],
    };
    // 100 held + 50 = 150 = 25% of 600 -> at the cap, allowed
    expect(allowed(checkOrder(buy({ notionalUsd: 50 }), held, limits, ctx))).toBe(true);
    // one dollar more breaches it
    expect(allowed(checkOrder(buy({ notionalUsd: 51 }), held, limits, ctx))).toBe(false);
  });

  test('refuses a zero or negative order', () => {
    expect(allowed(checkOrder(buy({ notionalUsd: 0 }), sleeve, DEFAULT_LIMITS, ctx))).toBe(false);
    expect(allowed(checkOrder(buy({ notionalUsd: -25 }), sleeve, DEFAULT_LIMITS, ctx))).toBe(false);
  });
});

describe('checkOrder — selling', () => {
  const held: SleeveState = {
    accountValueUsd: 600,
    cashUsd: 100,
    positions: [{ symbol: 'IBIT', quantity: 2, marketValueUsd: 500 }],
  };

  test('refuses to sell a symbol the sleeve does not hold', () => {
    const r = checkOrder({ symbol: 'XRP', side: 'sell', quantity: 1, orderType: 'market' }, held, DEFAULT_LIMITS, ctx);
    expect(allowed(r)).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/hold|position/i);
  });

  test('refuses to sell more shares than are held — no shorting by accident', () => {
    expect(allowed(checkOrder({ symbol: 'IBIT', side: 'sell', quantity: 2, orderType: 'market' }, held, DEFAULT_LIMITS, ctx))).toBe(true);
    expect(allowed(checkOrder({ symbol: 'IBIT', side: 'sell', quantity: 2.5, orderType: 'market' }, held, DEFAULT_LIMITS, ctx))).toBe(false);
  });
});

/**
 * the operator's spec sizes every position from the stop distance, not a fixed
 * dollar amount: risk <= 1% of equity per trade. That is checkable in code the
 * moment the agent hands over an entry and a stop.
 */
describe('checkOrder — 1% risk sizing', () => {
  // 1% of $600 = $6 of risk. A $2 stop distance therefore allows 3 shares.
  const sized = (shares: number): ProposedOrder => ({
    symbol: 'IBIT',
    side: 'buy',
    quantity: shares,
    entryUsd: 50,
    stopUsd: 48,
    notionalUsd: shares * 50,
    orderType: 'limit',
    limitPriceUsd: 50,
  });

  test('allows a position sized exactly to the 1% risk budget', () => {
    const limits = { ...DEFAULT_LIMITS, maxRiskPctPerTrade: 1, maxNotionalPerTradeUsd: 1000, maxPositionPctOfSleeve: 100 };
    expect(checkOrder(sized(3), sleeve, limits, ctx).allowed).toBe(true);
  });

  test('refuses a position whose stop distance risks more than 1% of equity', () => {
    const limits = { ...DEFAULT_LIMITS, maxRiskPctPerTrade: 1, maxNotionalPerTradeUsd: 1000, maxPositionPctOfSleeve: 100 };
    const r = checkOrder(sized(4), sleeve, limits, ctx);
    expect(r.allowed).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/risk/i);
  });

  test('refuses a long whose stop is not below the entry', () => {
    const limits = { ...DEFAULT_LIMITS, maxNotionalPerTradeUsd: 1000, maxPositionPctOfSleeve: 100 };
    const r = checkOrder({ ...sized(1), stopUsd: 51 }, sleeve, limits, ctx);
    expect(r.allowed).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/stop/i);
  });
});

/**
 * The autonomy budget is the slice of the sleeve the agent may trade without
 * per-signal approval. Deployed capital may never exceed it, so the remaining
 * balance is unreachable no matter what the agent decides.
 */
describe('checkOrder — the $300 autonomy budget', () => {
  const limits = { ...DEFAULT_LIMITS, allowedSymbols: undefined, maxDeployedCapitalUsd: 300, maxPositionPctOfSleeve: 100, maxNotionalPerTradeUsd: 1000 };

  test('allows buying right up to the budget', () => {
    const half: SleeveState = {
      accountValueUsd: 600,
      cashUsd: 400,
      positions: [{ symbol: 'AAA', quantity: 1, marketValueUsd: 260 }],
    };
    expect(checkOrder(buy({ symbol: 'BBB', notionalUsd: 40 }), half, limits, ctx).allowed).toBe(true);
  });

  test('refuses the dollar that would breach it', () => {
    const half: SleeveState = {
      accountValueUsd: 600,
      cashUsd: 400,
      positions: [{ symbol: 'AAA', quantity: 1, marketValueUsd: 260 }],
    };
    const r = checkOrder(buy({ symbol: 'BBB', notionalUsd: 41 }), half, limits, ctx);
    expect(r.allowed).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/budget|deployed/i);
  });

  test('counts every open position toward the budget, not just this trade', () => {
    const spread: SleeveState = {
      accountValueUsd: 600,
      cashUsd: 300,
      positions: [
        { symbol: 'AAA', quantity: 1, marketValueUsd: 150 },
        { symbol: 'BBB', quantity: 1, marketValueUsd: 150 },
      ],
    };
    const r = checkOrder(buy({ symbol: 'CCC', notionalUsd: 10 }), spread, limits, ctx);
    expect(r.allowed).toBe(false);
  });

  test('never blocks a sell — the budget caps what goes in, not what comes out', () => {
    const over: SleeveState = {
      accountValueUsd: 600,
      cashUsd: 0,
      positions: [{ symbol: 'AAA', quantity: 5, marketValueUsd: 400 }],
    };
    expect(checkOrder({ symbol: 'AAA', side: 'sell', quantity: 5, orderType: 'market' }, over, limits, ctx).allowed).toBe(true);
  });
});

describe('checkOrder — concurrent position cap', () => {
  test('refuses a new name once the sleeve is at the position cap', () => {
    const limits = { ...DEFAULT_LIMITS, allowedSymbols: undefined, maxConcurrentPositions: 2, maxPositionPctOfSleeve: 100 };
    const full: SleeveState = {
      accountValueUsd: 600,
      cashUsd: 400,
      positions: [
        { symbol: 'AAA', quantity: 1, marketValueUsd: 100 },
        { symbol: 'BBB', quantity: 1, marketValueUsd: 100 },
      ],
    };
    const r = checkOrder(buy({ symbol: 'CCC', notionalUsd: 40 }), full, limits, ctx);
    expect(r.allowed).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/position/i);

    // adding to a name it already holds is still fine
    expect(checkOrder(buy({ symbol: 'AAA', notionalUsd: 40 }), full, limits, ctx).allowed).toBe(true);
  });
});

describe('checkOrder — the ticker whitelist', () => {
  test('honours an allow-list when one is set', () => {
    const limits = { ...DEFAULT_LIMITS, allowedSymbols: ['SPY', 'QQQ'] };
    expect(allowed(checkOrder(buy({ symbol: 'QQQ' }), sleeve, limits, ctx))).toBe(true);
    const r = checkOrder(buy({ symbol: 'GME' }), sleeve, limits, ctx);
    expect(allowed(r)).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/allow|permitted/i);
  });

  test('collects every breached rule, not just the first', () => {
    const limits = { ...DEFAULT_LIMITS, maxNotionalPerTradeUsd: 10, allowedSymbols: ['SPY'] };
    const r = checkOrder(buy({ symbol: 'GME', notionalUsd: 5000 }), sleeve, limits, { ...ctx, marketOpen: false });
    expect(r.allowed).toBe(false);
    expect(r.reasons.length).toBeGreaterThanOrEqual(3);
  });
});

/**
 * Crypto sleeve: the agent trades SOL/BTC/XRP/LINK through their spot ETPs,
 * aggressively — full-sleeve autonomy, wider risk, higher cadence. The
 * allowlist is the blast-radius control: six vehicles, nothing else, and
 * widening it is a code change plus a deploy by design.
 */
describe('the crypto sleeve defaults', () => {
  test('DEFAULT_LIMITS carry the aggressive crypto posture', () => {
    expect(DEFAULT_LIMITS).toMatchObject({
      maxNotionalPerTradeUsd: 150,
      maxPositionPctOfSleeve: 40,
      maxRiskPctPerTrade: 2.5,
      maxConcurrentPositions: 6,
      maxTradesPerDay: 12,
      minSleeveValueUsd: 480,
      maxDeployedCapitalUsd: 560,
    });
  });

  test('a legacy holding outside the allow-list can still be SOLD', () => {
    // A sleeve can carry a position from an earlier strategy that the current
    // allow-list no longer covers. The allow-list caps what goes IN; selling
    // out of a legacy position reduces risk and must never be blocked.
    const legacy: SleeveState = {
      accountValueUsd: 600,
      cashUsd: 550,
      positions: [{ symbol: 'LGCY', quantity: 1, marketValueUsd: 40 }],
    };
    const r = checkOrder(
      { symbol: 'LGCY', side: 'sell', quantity: 1, orderType: 'limit', limitPriceUsd: 50 },
      legacy,
      DEFAULT_LIMITS,
      ctx,
    );
    expect(r.allowed).toBe(true);
    // buying it back is still refused
    expect(allowed(checkOrder(buy({ symbol: 'LGCY' }), legacy, DEFAULT_LIMITS, ctx))).toBe(false);
  });

  test('only the index core and the six crypto vehicles are tradeable by default', () => {
    // QQQ/SPY come from the index-core decide path (lib/trading-strategy.ts)
    expect(DEFAULT_LIMITS.allowedSymbols).toEqual(['QQQ', 'SPY', 'BSOL', 'IBIT', 'XRP', 'CLNK', 'SOLT', 'BITX']);
    const r = checkOrder(buy({ symbol: 'AAPL' }), sleeve, DEFAULT_LIMITS, ctx);
    expect(allowed(r)).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/allow/i);
  });

  test('the editor bounds do not clamp the crypto defaults back down', async () => {
    const { clampLimits } = await import('@/lib/trading-guardrails');
    const { clamped } = clampLimits({ ...DEFAULT_LIMITS });
    expect(clamped).toEqual([]);
  });
});

/**
 * Spot crypto: the same sleeve, traded through the MCP's crypto
 * order tools. Robinhood crypto never closes, pairs are named BTC-USD style,
 * buys are sized in dollars and the protective stop goes to the broker as a
 * stop_loss sell. Everything else (per-trade cap, autonomy budget, drawdown
 * floor, risk rule) applies unchanged.
 */
describe('checkOrder — spot crypto', () => {
  const cbuy = (over: Partial<ProposedOrder> = {}): ProposedOrder => ({
    symbol: 'BTC-USD',
    side: 'buy',
    assetClass: 'crypto',
    notionalUsd: 50,
    orderType: 'limit',
    limitPriceUsd: 80000,
    entryUsd: 80000,
    stopUsd: 79000,
    ...over,
  });
  const closed = { tradesToday: 0, marketOpen: false };

  test('a crypto buy passes when the equity market is closed', () => {
    const r = checkOrder(cbuy(), sleeve, DEFAULT_LIMITS, closed);
    expect(r.reasons).toEqual([]);
    expect(r.allowed).toBe(true);
  });

  test('an equity buy is still refused when the market is closed', () => {
    expect(allowed(checkOrder(buy(), sleeve, DEFAULT_LIMITS, closed))).toBe(false);
  });

  test('only the three backtested pairs are buyable', () => {
    expect(DEFAULT_LIMITS.allowedCryptoPairs).toEqual(['BTC-USD', 'SOL-USD', 'XRP-USD']);
    const r = checkOrder(cbuy({ symbol: 'ETH-USD' }), sleeve, DEFAULT_LIMITS, closed);
    expect(allowed(r)).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/ETH-USD is not on the crypto allow-list/);
  });

  test('a crypto pair is not accepted as an equity symbol and vice versa', () => {
    expect(allowed(checkOrder(buy({ symbol: 'BTC-USD' }), sleeve, DEFAULT_LIMITS, ctx))).toBe(false);
    expect(allowed(checkOrder(cbuy({ symbol: 'IBIT' }), sleeve, DEFAULT_LIMITS, closed))).toBe(false);
  });

  test('a protective stop_loss sell of a held coin is allowed', () => {
    const holding: SleeveState = {
      accountValueUsd: 600,
      cashUsd: 550,
      positions: [{ symbol: 'BTC-USD', quantity: 0.000625, marketValueUsd: 50 }],
    };
    const r = checkOrder(
      { symbol: 'BTC-USD', side: 'sell', assetClass: 'crypto', quantity: 0.000625, orderType: 'stop_loss', stopPriceUsd: 79000 },
      holding, DEFAULT_LIMITS, closed,
    );
    expect(r.reasons).toEqual([]);
    expect(r.allowed).toBe(true);
  });

  test('a stop order without a stop price is refused', () => {
    const holding: SleeveState = {
      accountValueUsd: 600,
      cashUsd: 550,
      positions: [{ symbol: 'BTC-USD', quantity: 0.000625, marketValueUsd: 50 }],
    };
    const r = checkOrder(
      { symbol: 'BTC-USD', side: 'sell', assetClass: 'crypto', quantity: 0.000625, orderType: 'stop_loss' },
      holding, DEFAULT_LIMITS, closed,
    );
    expect(allowed(r)).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/stop price/);
  });

  test('stop orders stay a sell-side tool: a stop_loss buy is refused', () => {
    const r = checkOrder(cbuy({ orderType: 'stop_loss', stopPriceUsd: 81000 }), sleeve, DEFAULT_LIMITS, closed);
    expect(allowed(r)).toBe(false);
  });

  test('equity orders cannot use the crypto stop types', () => {
    const holding: SleeveState = {
      accountValueUsd: 600, cashUsd: 550,
      positions: [{ symbol: 'IBIT', quantity: 1, marketValueUsd: 50 }],
    };
    const r = checkOrder(
      { symbol: 'IBIT', side: 'sell', quantity: 1, orderType: 'stop_loss', stopPriceUsd: 40 },
      holding, DEFAULT_LIMITS, ctx,
    );
    expect(allowed(r)).toBe(false);
  });

  test('the shared caps still bind: per-trade cap, budget, floor, risk', () => {
    expect(allowed(checkOrder(cbuy({ notionalUsd: 151 }), sleeve, DEFAULT_LIMITS, closed))).toBe(false);
    const drawn = { ...sleeve, accountValueUsd: 470 };
    expect(allowed(checkOrder(cbuy(), drawn, DEFAULT_LIMITS, closed))).toBe(false);
    // $150 at 80000 with a stop 16% away risks $24, over 2.5% of $600 = $15.
    expect(allowed(checkOrder(cbuy({ notionalUsd: 150, limitPriceUsd: 80000, stopUsd: 67200 }), sleeve, DEFAULT_LIMITS, closed))).toBe(false);
  });
});
