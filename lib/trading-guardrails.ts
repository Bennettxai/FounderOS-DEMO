/**
 * The trading agent's hard limits.
 *
 * The agent runs as a headless Claude session holding the Robinhood MCP, so its
 * prompt is guidance, not control — a model can always talk itself into a bad
 * trade. Every order it proposes is therefore validated here, in ordinary code,
 * before anything reaches the broker. Deny is the default: an order is allowed
 * only by satisfying every rule, and all breached rules are reported at once so
 * the agent gets one honest answer instead of a guessing game.
 *
 * Two things are enforced structurally, not by this file: the sleeve itself
 * (Robinhood reports the individual account as agentic_allowed:false, so an
 * agent physically cannot trade it) and options (the runner's tool allow-list
 * omits every option tool). This file is the third layer.
 */

/** The only account any agent may ever trade. */
export const AGENTIC_ACCOUNT_NUMBER = '700200002';

export type AssetClass = 'equity' | 'crypto';

export type ProposedOrder = {
  /** Equity ticker (IBIT) or crypto pair (BTC-USD). */
  symbol: string;
  side: 'buy' | 'sell';
  /** Default equity. Crypto orders skip the market-hours gate, use the pair
   *  allow-list and may carry a broker-side protective stop on the sell. */
  assetClass?: AssetClass;
  /** Buys are sized in dollars; sells in shares (or coins). */
  notionalUsd?: number;
  quantity?: number;
  /** stop_loss / stop_limit are crypto sells only: the protective stop the
   *  runner parks at the broker right after an entry fills. */
  orderType: 'market' | 'limit' | 'stop_loss' | 'stop_limit';
  limitPriceUsd?: number;
  /** Trigger price for stop_loss / stop_limit. */
  stopPriceUsd?: number;
  /** Intended entry and protective stop; required to check the 1% risk rule. */
  entryUsd?: number;
  stopUsd?: number;
  /** Optional; when present it must be the agentic sleeve. */
  accountNumber?: string;
};

export type SleeveState = {
  accountValueUsd: number;
  cashUsd: number;
  positions: { symbol: string; quantity: number; marketValueUsd: number }[];
};

export type Limits = {
  maxNotionalPerTradeUsd: number;
  maxPositionPctOfSleeve: number;
  maxTradesPerDay: number;
  /** Trading stops (buys only) if the sleeve falls through this value. */
  minSleeveValueUsd: number;
  /** Max % of equity that may be lost if a trade stops out. */
  maxRiskPctPerTrade: number;
  maxConcurrentPositions: number;
  /**
   * The autonomy budget: the most capital the agent may have deployed at once
   * without a human in the loop. Caps money going IN; sells are never blocked.
   */
  maxDeployedCapitalUsd: number;
  allowedSymbols?: string[];
  blockedSymbols?: string[];
  /** Spot crypto pairs the agent may BUY. Sells are exempt, as for equities. */
  allowedCryptoPairs?: string[];
};

export type OrderContext = { tradesToday: number; marketOpen: boolean };

export type GuardrailVerdict = { allowed: boolean; reasons: string[] };

/**
 * The default sleeve posture: an index core plus crypto exposure through spot
 * ETPs, deliberately aggressive — full-sleeve autonomy, dip-buys, trims and
 * rotations most days, and a deeper 20% kill switch because crypto vol would
 * trip a 10% floor in the first week. The allowlist is the blast-radius
 * control: a short list of vehicles, nothing else, and widening it takes a code
 * change plus a deploy.
 */
export const DEFAULT_LIMITS: Limits = {
  maxNotionalPerTradeUsd: 150,
  maxPositionPctOfSleeve: 40,
  maxRiskPctPerTrade: 2.5,
  maxConcurrentPositions: 6,
  maxTradesPerDay: 12,
  // 20% drawdown from the sleeve's funded value, then buys stop until a human
  // restarts them.
  minSleeveValueUsd: 480,
  // Full-sleeve autonomy: roughly the sleeve's cash balance, rounded up.
  maxDeployedCapitalUsd: 560,
  // Core 1x: BSOL (SOL), IBIT (BTC), XRP (Bitwise XRP), CLNK (LINK).
  // Boost 2x: SOLT (2x SOL), BITX (2x BTC) — capped by strategy, allowed here.
  // Index core (the default decide path): QQQ and SPY.
  allowedSymbols: ['QQQ', 'SPY', 'BSOL', 'IBIT', 'XRP', 'CLNK', 'SOLT', 'BITX'],
  // Spot crypto lane: only the pairs the 4h confluence strategy was backtested
  // on — the list is deliberately narrower than the ETP allowlist.
  allowedCryptoPairs: ['BTC-USD', 'SOL-USD', 'XRP-USD'],
};

/** The 7 numeric fields — everything the OS editor is allowed to set. The
 *  symbol allow/block lists stay code-only. */
export type EditableLimits = Omit<Limits, 'allowedSymbols' | 'blockedSymbols' | 'allowedCryptoPairs'>;

/**
 * The outer bounds the OS may never cross. Limits are editable from /trading
 * over an unauthenticated private network route, so without this the editor would be a
 * way to raise the blast radius from a browser. Widening these requires a code
 * edit and a deploy, which is the point.
 *
 * NOTE the asymmetry. Six fields are ceilings, because bigger is riskier. But
 * `minSleeveValueUsd` is the kill switch, where the dangerous direction is DOWN
 * — a lower floor lets the agent keep trading through a deeper drawdown — so it
 * is bounded from below. Tightening any limit is always allowed.
 */
export const LIMIT_BOUNDS = {
  // Widened for the crypto posture — the earlier equities-only ceilings would
  // clamp the crypto defaults at fetch time.
  maxNotionalPerTradeUsd: { max: 300 },
  maxPositionPctOfSleeve: { max: 50 },
  maxRiskPctPerTrade: { max: 4 },
  maxConcurrentPositions: { max: 16 },
  maxTradesPerDay: { max: 16 },
  // The ceiling on the autonomy budget; the agent may never be authorised for
  // more than the sleeve's funded value.
  maxDeployedCapitalUsd: { max: 600 },
  minSleeveValueUsd: { min: 450 },
} as const satisfies Record<keyof EditableLimits, { max?: number; min?: number }>;

export type LimitBounds = Record<string, { max?: number; min?: number }>;

/** Hold stored limits inside LIMIT_BOUNDS, reporting which fields were moved so
 *  the UI can say a value did not take rather than lying about it. */
export function clampLimits(
  stored: EditableLimits,
  bounds: LimitBounds = LIMIT_BOUNDS,
): { limits: EditableLimits; clamped: string[] } {
  const limits = { ...stored };
  const clamped: string[] = [];
  for (const [field, bound] of Object.entries(bounds)) {
    const key = field as keyof EditableLimits;
    const value = limits[key];
    if (typeof value !== 'number') continue;
    if (bound.max !== undefined && value > bound.max) {
      limits[key] = bound.max;
      clamped.push(field);
    } else if (bound.min !== undefined && value < bound.min) {
      limits[key] = bound.min;
      clamped.push(field);
    }
  }
  return { limits, clamped };
}

const money = (n: number) => `$${n.toFixed(2)}`;

export function checkOrder(
  order: ProposedOrder,
  sleeve: SleeveState,
  limits: Limits,
  ctx: OrderContext,
): GuardrailVerdict {
  const reasons: string[] = [];
  const crypto = order.assetClass === 'crypto';
  const isStopType = order.orderType === 'stop_loss' || order.orderType === 'stop_limit';

  if (order.accountNumber && order.accountNumber !== AGENTIC_ACCOUNT_NUMBER) {
    reasons.push(`account ${order.accountNumber} is not the agentic sleeve — agents may only trade ${AGENTIC_ACCOUNT_NUMBER}`);
  }
  if (order.side !== 'buy' && order.side !== 'sell') {
    reasons.push(`side "${order.side}" is not permitted — plain buy or sell only`);
  }
  if (order.orderType !== 'market' && order.orderType !== 'limit' && !(crypto && isStopType)) {
    reasons.push(`order type "${order.orderType}" is not permitted`);
  }
  if (crypto && isStopType && order.side !== 'sell') {
    reasons.push(`${order.orderType} is a protective sell, not an entry`);
  }
  if (crypto && isStopType && !(order.stopPriceUsd && order.stopPriceUsd > 0)) {
    reasons.push(`a ${order.orderType} order needs a positive stop price`);
  }
  // Crypto never closes; the regular-hours gate is an equity rule.
  if (!crypto && !ctx.marketOpen) {
    reasons.push('market is closed — the agent trades regular hours only');
  }
  if (ctx.tradesToday >= limits.maxTradesPerDay) {
    reasons.push(`daily trade cap reached (${ctx.tradesToday}/${limits.maxTradesPerDay})`);
  }

  const symbol = order.symbol?.toUpperCase() ?? '';
  if (!symbol) reasons.push('no symbol given');
  if (limits.blockedSymbols?.map((s) => s.toUpperCase()).includes(symbol)) {
    reasons.push(`${symbol} is on the blocked list`);
  }
  // The allow-list caps what the agent can BUY. Selling is exempt: a legacy
  // holding from an earlier strategy must always be exitable, or a change of
  // posture strands it.
  if (crypto) {
    if (!/^[A-Z0-9]+-USD$/.test(symbol)) reasons.push(`${symbol} is not a USD crypto pair`);
    if (order.side === 'buy' && limits.allowedCryptoPairs && !limits.allowedCryptoPairs.map((s) => s.toUpperCase()).includes(symbol)) {
      reasons.push(`${symbol} is not on the crypto allow-list`);
    }
  } else {
    if (symbol.includes('-')) reasons.push(`${symbol} looks like a crypto pair; send it as assetClass crypto`);
    if (order.side === 'buy' && limits.allowedSymbols && !limits.allowedSymbols.map((s) => s.toUpperCase()).includes(symbol)) {
      reasons.push(`${symbol} is not on the allow-list`);
    }
  }

  const held = sleeve.positions.find((p) => p.symbol.toUpperCase() === symbol);

  if (order.side === 'buy') {
    const notional = order.notionalUsd ?? 0;
    if (!(notional > 0)) {
      reasons.push('buy notional must be greater than zero');
    } else {
      if (notional > limits.maxNotionalPerTradeUsd) {
        reasons.push(`${money(notional)} exceeds the per-trade cap of ${money(limits.maxNotionalPerTradeUsd)}`);
      }
      if (notional > sleeve.cashUsd) {
        reasons.push(`${money(notional)} exceeds available cash of ${money(sleeve.cashUsd)}`);
      }
      const after = (held?.marketValueUsd ?? 0) + notional;
      const cap = (limits.maxPositionPctOfSleeve / 100) * sleeve.accountValueUsd;
      if (after > cap) {
        reasons.push(
          `${symbol} would reach ${money(after)}, over the ${limits.maxPositionPctOfSleeve}% concentration cap of ${money(cap)}`,
        );
      }
    }
    const deployed = sleeve.positions.reduce((t, p) => t + p.marketValueUsd, 0);
    if (deployed + notional > limits.maxDeployedCapitalUsd + 1e-9) {
      reasons.push(
        `${money(deployed)} already deployed plus ${money(notional)} would exceed the ` +
          `${money(limits.maxDeployedCapitalUsd)} autonomy budget`,
      );
    }

    // A new name cannot be opened once the book is full; adding to an existing
    // position is not a new position.
    if (!held && sleeve.positions.length >= limits.maxConcurrentPositions) {
      reasons.push(
        `already holding ${sleeve.positions.length} positions, at the cap of ${limits.maxConcurrentPositions} — no new names`,
      );
    }

    // Buying adds risk, so the drawdown floor blocks it; selling is exempt below.
    if (sleeve.accountValueUsd < limits.minSleeveValueUsd) {
      reasons.push(
        `sleeve is ${money(sleeve.accountValueUsd)}, through the drawdown floor of ${money(limits.minSleeveValueUsd)} — no new buys`,
      );
    }
  }

  if (order.side === 'sell') {
    const qty = order.quantity ?? 0;
    if (!(qty > 0)) {
      reasons.push('sell quantity must be greater than zero');
    } else if (!held) {
      reasons.push(`no position held in ${symbol} — the agent does not short`);
    } else if (qty > held.quantity) {
      reasons.push(`cannot sell ${qty} ${symbol}; only ${held.quantity} held — the agent does not short`);
    }
  }

  if (order.orderType === 'limit' && !(order.limitPriceUsd && order.limitPriceUsd > 0)) {
    reasons.push('a limit order needs a positive limit price');
  }

  // Size from the stop distance, not a fixed dollar amount: shares x (entry -
  // stop) is what actually goes on the table if the trade is wrong.
  if (order.side === 'buy' && order.entryUsd !== undefined && order.stopUsd !== undefined) {
    const shares = order.quantity ?? (order.notionalUsd && order.entryUsd ? order.notionalUsd / order.entryUsd : 0);
    if (!(order.stopUsd < order.entryUsd)) {
      reasons.push(`stop ${money(order.stopUsd)} must sit below the entry ${money(order.entryUsd)} on a long`);
    } else {
      const risk = shares * (order.entryUsd - order.stopUsd);
      const budget = (limits.maxRiskPctPerTrade / 100) * sleeve.accountValueUsd;
      if (risk > budget + 1e-9) {
        reasons.push(
          `risks ${money(risk)} to the stop, over the ${limits.maxRiskPctPerTrade}% budget of ${money(budget)}`,
        );
      }
    }
  }

  return { allowed: reasons.length === 0, reasons };
}
