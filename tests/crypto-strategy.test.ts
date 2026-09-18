import { describe, expect, test } from 'vitest';
import type { Candle } from '@/lib/crypto-candles';
import {
  alignHtf,
  buildFeatures,
  scoreBar,
  confluencePlans,
  meanReversionPlans,
  DEFAULT_CONFLUENCE,
  DEFAULT_MEANREV,
  type Features,
} from '@/lib/crypto-strategy';

const bar = (time: number, o: number, h: number, l: number, c: number, v = 1): Candle => ({ time, open: o, high: h, low: l, close: c, volume: v });

/** Deterministic random walk so the no-look-ahead tests have something to chew on. */
function walk(n: number, step = 900, seed = 7): Candle[] {
  let s = seed, px = 100;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const o = px;
    const drift = (rnd() - 0.48) * 2;
    const c = Math.max(1, o + drift);
    const h = Math.max(o, c) + rnd();
    const l = Math.min(o, c) - rnd();
    out.push(bar(i * step, o, h, l, c, 50 + rnd() * 100));
    px = c;
  }
  return out;
}

describe('alignHtf', () => {
  test('each trade bar maps to the last higher-timeframe bar that had CLOSED by the end of that trade bar', () => {
    const htf = [bar(0, 1, 1, 1, 1), bar(3600, 1, 1, 1, 1), bar(7200, 1, 1, 1, 1)];
    const ltf = [bar(2700, 1, 1, 1, 1), bar(3600, 1, 1, 1, 1), bar(5400, 1, 1, 1, 1), bar(6300, 1, 1, 1, 1), bar(7200, 1, 1, 1, 1)];
    // ltf@2700 ends at 3600 → htf@0 closed → 0; ltf@6300 ends at 7200 → htf@3600 closed → 1; ltf@7200 ends 8100 → still 1
    expect(alignHtf(ltf, htf, 3600, 900)).toEqual([0, 0, 0, 1, 1]);
  });
  test('trade bars before the first closed higher-timeframe bar map to -1', () => {
    const htf = [bar(3600, 1, 1, 1, 1)];
    const ltf = [bar(0, 1, 1, 1, 1), bar(6300, 1, 1, 1, 1)];
    expect(alignHtf(ltf, htf, 3600, 900)).toEqual([-1, 0]);
  });
});

describe('scoreBar', () => {
  const f = (over: Partial<Record<keyof Features, number[] | boolean[]>> = {}): Features => ({
    close: [100, 110], high: [101, 111], low: [99, 109], volume: [100, 200],
    emaFast: [100, 108], emaSlow: [100, 104], atr: [2, 2], rsi: [50, 62],
    adx: [30, 30], plusDi: [30, 30], minusDi: [10, 10], macdHist: [0.5, 1],
    donUpper: [NaN, 109], donLower: [NaN, 95], volSma: [100, 120], vwap: [100, 105],
    htfBull: [true, true],
    ...over,
  } as Features);

  test('every signal agreeing scores 7 and names each one', () => {
    const r = scoreBar(f(), 1, DEFAULT_CONFLUENCE);
    expect(r.score).toBe(7);
    expect(r.signals.sort()).toEqual(['breakout', 'htf', 'momentum', 'strength', 'trend', 'volume', 'vwap']);
    expect(r.trigger).toBe(true);
  });
  test('one disagreeing signal drops the score and its name', () => {
    const r = scoreBar(f({ htfBull: [true, false] }), 1, DEFAULT_CONFLUENCE);
    expect(r.score).toBe(6);
    expect(r.signals).not.toContain('htf');
  });
  test('an RSI above rsiMax is a chase and vetoes the entry regardless of score', () => {
    const r = scoreBar(f({ rsi: [50, 90] }), 1, DEFAULT_CONFLUENCE);
    expect(r.trigger).toBe(false);
    expect(r.veto).toContain('rsi');
  });
  test('without a breakout or pullback there is no trigger even with a high score', () => {
    const r = scoreBar(f({ donUpper: [NaN, 115] }), 1, { ...DEFAULT_CONFLUENCE, mode: 'breakout' });
    expect(r.trigger).toBe(false);
    expect(r.signals).not.toContain('breakout');
  });
  test('pullback mode triggers on a re-cross of the fast EMA from below in an uptrend', () => {
    const r = scoreBar(f({ close: [95, 110], emaFast: [100, 108], donUpper: [NaN, 130] }), 1, { ...DEFAULT_CONFLUENCE, mode: 'pullback' });
    expect(r.trigger).toBe(true);
    expect(r.signals).toContain('pullback');
  });
});

describe('confluencePlans', () => {
  const ltf = walk(1200);
  const htf = walk(300, 3600, 11);

  test('every entry carries a stop below the close and a note listing the signals', () => {
    const plans = confluencePlans(ltf, htf, { ...DEFAULT_CONFLUENCE, minScore: 3 });
    const entries = plans.map((p, i) => ({ p, i })).filter((x) => x.p.enter);
    expect(entries.length).toBeGreaterThan(0);
    for (const { p, i } of entries) {
      expect(p.enter!.stopUsd).toBeLessThan(ltf[i].close);
      expect(p.enter!.note).toMatch(/score=\d/);
    }
  });

  test('a stricter minScore never produces more entries than a looser one', () => {
    const loose = confluencePlans(ltf, htf, { ...DEFAULT_CONFLUENCE, minScore: 3 }).filter((p) => p.enter).length;
    const strict = confluencePlans(ltf, htf, { ...DEFAULT_CONFLUENCE, minScore: 6 }).filter((p) => p.enter).length;
    expect(strict).toBeLessThanOrEqual(loose);
  });

  test('no look-ahead: the plan for bar i is identical whether or not later bars exist', () => {
    const full = confluencePlans(ltf, htf, { ...DEFAULT_CONFLUENCE, minScore: 3 });
    const cut = 700;
    const partial = confluencePlans(ltf.slice(0, cut), htf.filter((h) => h.time + 3600 <= ltf[cut - 1].time + 900), { ...DEFAULT_CONFLUENCE, minScore: 3 });
    expect(partial).toHaveLength(cut);
    expect(partial).toEqual(full.slice(0, cut));
  });

  test('no plan is emitted for a bar the higher timeframe has not confirmed yet when requireHtf is set', () => {
    const plans = confluencePlans(ltf, [], { ...DEFAULT_CONFLUENCE, minScore: 1, requireHtf: true });
    expect(plans.filter((p) => p.enter)).toHaveLength(0);
  });
});

describe('meanReversionPlans', () => {
  const ltf = walk(1200, 900, 3);
  const htf = walk(300, 3600, 5);

  test('entries only happen when the short RSI is washed out, and each has a stop and a time limit', () => {
    const p = { ...DEFAULT_MEANREV, requireHtf: false };
    const plans = meanReversionPlans(ltf, htf, p);
    const features = buildFeatures(ltf, htf, p);
    const entries = plans.map((p, i) => ({ p, i })).filter((x) => x.p.enter);
    expect(entries.length).toBeGreaterThan(0);
    for (const { p, i } of entries) {
      expect(features.rsi[i]).toBeLessThan(DEFAULT_MEANREV.rsiOversold);
      expect(p.enter!.stopUsd).toBeLessThan(ltf[i].close);
      expect(p.enter!.maxBars).toBe(DEFAULT_MEANREV.maxBars);
    }
  });

  test('no look-ahead holds for the mean-reversion plans too', () => {
    const full = meanReversionPlans(ltf, htf, { ...DEFAULT_MEANREV, requireHtf: false });
    const cut = 650;
    const partial = meanReversionPlans(ltf.slice(0, cut), htf.filter((h) => h.time + 3600 <= ltf[cut - 1].time + 900), { ...DEFAULT_MEANREV, requireHtf: false });
    expect(partial).toEqual(full.slice(0, cut));
  });
});
