import { describe, expect, test } from 'vitest';
import { TradingLimitsSchema } from '@/lib/schemas';
import { DEFAULT_LIMITS, LIMIT_BOUNDS, clampLimits } from '@/lib/trading-guardrails';

/**
 * The limits become editable from the OS behind the app's access gate,
 * so these two layers are the whole safety story: the schema rejects nonsense,
 * and the clamp keeps a valid-but-greedy value inside what the code allows.
 * Widening past LIMIT_BOUNDS has to require a code edit, or the editor would
 * quietly become a way to raise the blast radius.
 */

const valid = { ...DEFAULT_LIMITS };
delete (valid as Record<string, unknown>).allowedSymbols;
delete (valid as Record<string, unknown>).blockedSymbols;

describe('TradingLimitsSchema', () => {
  test('accepts the shipped defaults', () => {
    expect(TradingLimitsSchema.safeParse(valid).success).toBe(true);
  });

  test.each([
    'maxNotionalPerTradeUsd',
    'maxPositionPctOfSleeve',
    'maxRiskPctPerTrade',
    'maxConcurrentPositions',
    'maxTradesPerDay',
    'minSleeveValueUsd',
    'maxDeployedCapitalUsd',
  ])('%s is required', (field) => {
    const body: Record<string, unknown> = { ...valid };
    delete body[field];
    expect(TradingLimitsSchema.safeParse(body).success).toBe(false);
  });

  test('rejects negative, zero, and non-finite money', () => {
    for (const bad of [-1, 0, NaN, Infinity]) {
      const r = TradingLimitsSchema.safeParse({ ...valid, maxNotionalPerTradeUsd: bad });
      expect(r.success, `${bad} should be rejected`).toBe(false);
    }
  });

  test('percentages cannot exceed 100', () => {
    expect(TradingLimitsSchema.safeParse({ ...valid, maxPositionPctOfSleeve: 101 }).success).toBe(false);
    expect(TradingLimitsSchema.safeParse({ ...valid, maxRiskPctPerTrade: 101 }).success).toBe(false);
    expect(TradingLimitsSchema.safeParse({ ...valid, maxPositionPctOfSleeve: 100 }).success).toBe(true);
  });

  test('counts must be whole numbers', () => {
    expect(TradingLimitsSchema.safeParse({ ...valid, maxConcurrentPositions: 2.5 }).success).toBe(false);
    expect(TradingLimitsSchema.safeParse({ ...valid, maxTradesPerDay: 1.5 }).success).toBe(false);
  });

  test('a string that looks like a number is not coerced', () => {
    expect(TradingLimitsSchema.safeParse({ ...valid, maxTradesPerDay: '5' }).success).toBe(false);
  });
});

describe('clampLimits', () => {
  test('the shipped defaults sit inside the bounds and are untouched', () => {
    const { limits, clamped } = clampLimits(valid);
    expect(clamped).toEqual([]);
    expect(limits).toEqual(valid);
  });

  test('the autonomy budget cannot be raised past the funded sleeve', () => {
    const { limits, clamped } = clampLimits({ ...valid, maxDeployedCapitalUsd: 10_000 });
    expect(limits.maxDeployedCapitalUsd).toBe(LIMIT_BOUNDS.maxDeployedCapitalUsd.max);
    expect(limits.maxDeployedCapitalUsd).toBe(600);
    expect(clamped).toContain('maxDeployedCapitalUsd');
  });

  test('each ceiling field is clamped independently', () => {
    const greedy = {
      ...valid,
      maxNotionalPerTradeUsd: 9_999,
      maxPositionPctOfSleeve: 99,
      maxRiskPctPerTrade: 50,
      maxConcurrentPositions: 200,
      maxTradesPerDay: 500,
    };
    const { limits, clamped } = clampLimits(greedy);
    expect(limits.maxNotionalPerTradeUsd).toBe(LIMIT_BOUNDS.maxNotionalPerTradeUsd.max);
    expect(limits.maxPositionPctOfSleeve).toBe(LIMIT_BOUNDS.maxPositionPctOfSleeve.max);
    expect(limits.maxRiskPctPerTrade).toBe(LIMIT_BOUNDS.maxRiskPctPerTrade.max);
    expect(limits.maxConcurrentPositions).toBe(LIMIT_BOUNDS.maxConcurrentPositions.max);
    expect(limits.maxTradesPerDay).toBe(LIMIT_BOUNDS.maxTradesPerDay.max);
    expect(clamped).toHaveLength(5);
  });

  /**
   * The kill switch is the one field where DOWN is the dangerous direction: a
   * lower floor means the agent keeps trading through a deeper drawdown. So it
   * is bounded from below, and a ceiling-shaped clamp would have been a bug.
   */
  test('the kill-switch floor cannot be lowered past its bound', () => {
    const { limits, clamped } = clampLimits({ ...valid, minSleeveValueUsd: 0 });
    expect(limits.minSleeveValueUsd).toBe(LIMIT_BOUNDS.minSleeveValueUsd.min);
    expect(clamped).toContain('minSleeveValueUsd');
  });

  test('raising the kill-switch floor is allowed — that direction is safer', () => {
    const { limits, clamped } = clampLimits({ ...valid, minSleeveValueUsd: 580 });
    expect(limits.minSleeveValueUsd).toBe(580);
    expect(clamped).not.toContain('minSleeveValueUsd');
  });

  test('tightening any limit is always allowed', () => {
    const tight = {
      ...valid,
      maxNotionalPerTradeUsd: 10,
      maxDeployedCapitalUsd: 50,
      maxTradesPerDay: 1,
    };
    const { limits, clamped } = clampLimits(tight);
    expect(clamped).toEqual([]);
    expect(limits).toEqual(tight);
  });
});
