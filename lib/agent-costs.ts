/**
 * Agent runtime + expense analysis. Runtime comes from each run's start/finish
 * timestamps (real). Expense is estimated from the LLM token usage recorded on
 * the run, priced against a per-model list-price table. "Estimated" is the
 * honest word: this is tokens times published price, not a billed invoice.
 *
 * Pure and deterministic (spendPerDay takes `now`), so the page just feeds it
 * the runs it already reads through the repo layer.
 */
import type { Agent, AgentRun } from '@/lib/schemas';

/** USD per 1,000,000 tokens. Approximate Claude list prices; treat as estimates. */
export const MODEL_PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  'claude-sonnet-5': { inputPerM: 3, outputPerM: 15 },
  'sonnet-5': { inputPerM: 3, outputPerM: 15 },
  'sonnet-4.5': { inputPerM: 3, outputPerM: 15 },
  'claude-haiku-4.5': { inputPerM: 0.8, outputPerM: 4 },
  'haiku-4.5': { inputPerM: 0.8, outputPerM: 4 },
  'claude-opus-4.8': { inputPerM: 15, outputPerM: 75 },
  'opus-4.8': { inputPerM: 15, outputPerM: 75 },
};

const DEFAULT_PRICING = { inputPerM: 3, outputPerM: 15 };

/** Price row for a model. Strips an `anthropic/` provider prefix; unknown or
    null models fall back to Sonnet pricing. */
export function pricingFor(model: string | null | undefined): { inputPerM: number; outputPerM: number } {
  if (!model) return DEFAULT_PRICING;
  const bare = model.replace(/^anthropic\//, '');
  return MODEL_PRICING[bare] ?? MODEL_PRICING[model] ?? DEFAULT_PRICING;
}

/** Estimated USD for a run's token usage at list price. */
export function runCostUsd(tokensIn: number, tokensOut: number, model?: string | null): number {
  const p = pricingFor(model);
  const ti = Number.isFinite(tokensIn) && tokensIn > 0 ? tokensIn : 0;
  const to = Number.isFinite(tokensOut) && tokensOut > 0 ? tokensOut : 0;
  return (ti / 1_000_000) * p.inputPerM + (to / 1_000_000) * p.outputPerM;
}

/** A run's cost: the stored costUsd wins; else derive from tokens + model; else 0. */
export function costOf(run: AgentRun): number {
  if (run.costUsd != null && Number.isFinite(run.costUsd)) return run.costUsd;
  if (run.tokensIn != null || run.tokensOut != null) {
    return runCostUsd(run.tokensIn ?? 0, run.tokensOut ?? 0, run.model);
  }
  return 0;
}

/** Wall-clock duration of a run in ms; 0 for missing or negative spans. */
export function runtimeMs(run: AgentRun): number {
  const s = new Date(run.startedAt).getTime();
  const f = new Date(run.finishedAt).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(f)) return 0;
  const d = f - s;
  return d > 0 ? d : 0;
}

export type AgentCostRow = {
  agentId: string;
  name: string;
  runs: number;
  okRuns: number;
  successRate: number; // 0..1
  totalMs: number;
  avgMs: number;
  tokensIn: number;
  tokensOut: number;
  totalCost: number;
  avgCost: number;
  lastRunAt: string | null;
};

/** Per-agent rollup, sorted by spend (desc), then run count, then name. */
export function agentCostRows(runs: AgentRun[], agents: Pick<Agent, 'id' | 'name'>[]): AgentCostRow[] {
  const nameById = new Map(agents.map((a) => [a.id, a.name]));
  const byAgent = new Map<string, AgentRun[]>();
  for (const r of runs) {
    (byAgent.get(r.agentId) ?? byAgent.set(r.agentId, []).get(r.agentId)!).push(r);
  }
  const rows: AgentCostRow[] = [];
  for (const [agentId, list] of byAgent) {
    const okRuns = list.filter((r) => r.ok).length;
    const totalMs = list.reduce((s, r) => s + runtimeMs(r), 0);
    const tokensIn = list.reduce((s, r) => s + (r.tokensIn ?? 0), 0);
    const tokensOut = list.reduce((s, r) => s + (r.tokensOut ?? 0), 0);
    const totalCost = list.reduce((s, r) => s + costOf(r), 0);
    const lastRunAt = list.reduce<string | null>(
      (latest, r) => (latest == null || r.startedAt > latest ? r.startedAt : latest),
      null,
    );
    rows.push({
      agentId,
      name: nameById.get(agentId) ?? agentId,
      runs: list.length,
      okRuns,
      successRate: list.length ? okRuns / list.length : 0,
      totalMs,
      avgMs: list.length ? totalMs / list.length : 0,
      tokensIn,
      tokensOut,
      totalCost,
      avgCost: list.length ? totalCost / list.length : 0,
      lastRunAt,
    });
  }
  rows.sort((a, b) => b.totalCost - a.totalCost || b.runs - a.runs || a.name.localeCompare(b.name));
  return rows;
}

export type CostTotals = {
  totalCost: number;
  totalRuns: number;
  totalMs: number;
  avgCostPerRun: number;
  tokensIn: number;
  tokensOut: number;
};

export function costTotals(runs: AgentRun[]): CostTotals {
  const totalCost = runs.reduce((s, r) => s + costOf(r), 0);
  const totalMs = runs.reduce((s, r) => s + runtimeMs(r), 0);
  const tokensIn = runs.reduce((s, r) => s + (r.tokensIn ?? 0), 0);
  const tokensOut = runs.reduce((s, r) => s + (r.tokensOut ?? 0), 0);
  return {
    totalCost,
    totalRuns: runs.length,
    totalMs,
    avgCostPerRun: runs.length ? totalCost / runs.length : 0,
    tokensIn,
    tokensOut,
  };
}

/** Daily spend for the last `days` days, oldest to newest, bucketed by startedAt. */
export function spendPerDay(runs: AgentRun[], days: number, now: Date = new Date()): number[] {
  const out: number[] = new Array(Math.max(0, days)).fill(0);
  if (days <= 0) return out;
  const end = now.getTime();
  const dayMs = 86_400_000;
  for (const r of runs) {
    const t = new Date(r.startedAt).getTime();
    if (!Number.isFinite(t)) continue;
    const daysAgo = Math.floor((end - t) / dayMs);
    if (daysAgo < 0 || daysAgo >= days) continue;
    out[days - 1 - daysAgo] += costOf(r);
  }
  return out;
}
