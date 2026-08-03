import { describe, expect, test } from 'vitest';
import type { AgentRun } from '@/lib/schemas';
import {
  agentCostRows,
  costOf,
  costTotals,
  pricingFor,
  runCostUsd,
  runtimeMs,
  spendPerDay,
} from '@/lib/agent-costs';

const run = (p: Partial<AgentRun> & { agentId: string }): AgentRun => ({
  id: p.id ?? `${p.agentId}-${p.startedAt ?? 'x'}`,
  agentId: p.agentId,
  startedAt: p.startedAt ?? '2026-08-01T00:00:00.000Z',
  finishedAt: p.finishedAt ?? '2026-08-01T00:00:02.000Z',
  ok: p.ok ?? true,
  summary: p.summary ?? '',
  model: p.model,
  tokensIn: p.tokensIn,
  tokensOut: p.tokensOut,
  costUsd: p.costUsd,
});

const day = (n: number, base = Date.UTC(2026, 7, 20, 12, 0, 0)) => new Date(base - n * 86_400_000).toISOString();

describe('runCostUsd + pricingFor', () => {
  test('1M in + 1M out on Sonnet is $18', () => {
    expect(runCostUsd(1_000_000, 1_000_000, 'sonnet-5')).toBeCloseTo(18, 6);
  });
  test('haiku is cheaper than sonnet', () => {
    expect(runCostUsd(1_000_000, 1_000_000, 'haiku-4.5')).toBeCloseTo(4.8, 6);
  });
  test('anthropic/ prefix prices the same as bare', () => {
    expect(pricingFor('anthropic/claude-sonnet-5')).toEqual(pricingFor('claude-sonnet-5'));
  });
  test('unknown / null model falls back to Sonnet pricing', () => {
    expect(pricingFor('who-knows')).toEqual({ inputPerM: 3, outputPerM: 15 });
    expect(pricingFor(null)).toEqual({ inputPerM: 3, outputPerM: 15 });
  });
  test('zero or negative tokens cost nothing', () => {
    expect(runCostUsd(0, 0, 'sonnet-5')).toBe(0);
    expect(runCostUsd(-5, -5, 'sonnet-5')).toBe(0);
  });
});

describe('runtimeMs', () => {
  test('5s apart is 5000ms', () => {
    expect(runtimeMs(run({ agentId: 'a', startedAt: '2026-08-01T00:00:00Z', finishedAt: '2026-08-01T00:00:05Z' }))).toBe(5000);
  });
  test('negative / bad spans clamp to 0', () => {
    expect(runtimeMs(run({ agentId: 'a', startedAt: '2026-08-01T00:00:05Z', finishedAt: '2026-08-01T00:00:00Z' }))).toBe(0);
    expect(runtimeMs(run({ agentId: 'a', startedAt: 'nope', finishedAt: 'nope' }))).toBe(0);
  });
});

describe('costOf', () => {
  test('stored costUsd wins', () => {
    expect(costOf(run({ agentId: 'a', costUsd: 0.42, tokensIn: 999, tokensOut: 999, model: 'sonnet-5' }))).toBe(0.42);
  });
  test('derives from tokens + model when costUsd is absent', () => {
    expect(costOf(run({ agentId: 'a', tokensIn: 1_000_000, tokensOut: 0, model: 'sonnet-5' }))).toBeCloseTo(3, 6);
  });
  test('no cost and no tokens is 0', () => {
    expect(costOf(run({ agentId: 'a' }))).toBe(0);
  });
});

describe('agentCostRows', () => {
  const agents = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Bravo' },
  ];
  const runs = [
    run({ agentId: 'a', startedAt: day(1), finishedAt: new Date(Date.parse(day(1)) + 2000).toISOString(), ok: true, costUsd: 0.10 }),
    run({ agentId: 'a', startedAt: day(2), finishedAt: new Date(Date.parse(day(2)) + 4000).toISOString(), ok: false, costUsd: 0.30 }),
    run({ agentId: 'b', startedAt: day(1), finishedAt: new Date(Date.parse(day(1)) + 1000).toISOString(), ok: true, costUsd: 0.05 }),
  ];

  test('rolls up per agent and sorts by spend desc', () => {
    const rows = agentCostRows(runs, agents);
    expect(rows.map((r) => r.agentId)).toEqual(['a', 'b']); // a total 0.40 > b 0.05
    const a = rows[0];
    expect(a.name).toBe('Alpha');
    expect(a.runs).toBe(2);
    expect(a.okRuns).toBe(1);
    expect(a.successRate).toBe(0.5);
    expect(a.totalCost).toBeCloseTo(0.40, 6);
    expect(a.avgCost).toBeCloseTo(0.20, 6);
    expect(a.totalMs).toBe(6000);
    expect(a.avgMs).toBe(3000);
    expect(a.lastRunAt).toBe(day(1)); // newest of a's runs
  });

  test('resolves names, unknown agent id falls back to the id', () => {
    const rows = agentCostRows([run({ agentId: 'ghost', costUsd: 1 })], agents);
    expect(rows[0].name).toBe('ghost');
  });
});

describe('costTotals', () => {
  test('sums cost, runs, ms, tokens and averages', () => {
    const runs = [
      run({ agentId: 'a', startedAt: '2026-08-01T00:00:00Z', finishedAt: '2026-08-01T00:00:02Z', costUsd: 0.2, tokensIn: 100, tokensOut: 50 }),
      run({ agentId: 'b', startedAt: '2026-08-01T00:00:00Z', finishedAt: '2026-08-01T00:00:04Z', costUsd: 0.6, tokensIn: 300, tokensOut: 150 }),
    ];
    const t = costTotals(runs);
    expect(t.totalCost).toBeCloseTo(0.8, 6);
    expect(t.totalRuns).toBe(2);
    expect(t.totalMs).toBe(6000);
    expect(t.avgCostPerRun).toBeCloseTo(0.4, 6);
    expect(t.tokensIn).toBe(400);
    expect(t.tokensOut).toBe(200);
  });
});

describe('spendPerDay', () => {
  test('buckets by day, oldest to newest, ignores out-of-range', () => {
    const now = new Date(Date.UTC(2026, 7, 20, 12, 0, 0));
    const runs = [
      run({ agentId: 'a', startedAt: day(0, now.getTime()), costUsd: 1 }), // today
      run({ agentId: 'a', startedAt: day(3, now.getTime()), costUsd: 2 }), // 3 days ago
      run({ agentId: 'a', startedAt: day(30, now.getTime()), costUsd: 9 }), // out of a 7-day window
    ];
    const series = spendPerDay(runs, 7, now);
    expect(series).toHaveLength(7);
    expect(series[6]).toBeCloseTo(1, 6); // newest bucket = today
    expect(series[3]).toBeCloseTo(2, 6); // 3 days ago
    expect(series.reduce((s, n) => s + n, 0)).toBeCloseTo(3, 6); // the 30-day-old run is excluded
  });
});
