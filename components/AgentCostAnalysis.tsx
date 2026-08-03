import type { Agent, AgentRun } from '@/lib/schemas';
import { agentCostRows, costTotals, spendPerDay } from '@/lib/agent-costs';
import { Label, SectionHead, Spark } from '@/components/terminal';

const money = (n: number): string => (n >= 1 ? `$${n.toFixed(2)}` : n > 0 ? `$${n.toFixed(4)}` : '$0');
const dur = (ms: number): string =>
  ms >= 3_600_000 ? `${(ms / 3_600_000).toFixed(1)}h` : ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
const tok = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
const pct = (r: number): string => `${Math.round(r * 100)}%`;

function rel(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * Agents cost & runtime: per-agent runtimes and estimated LLM spend, plus
 * totals and a daily-spend trend. Cost is estimated (token counts times model
 * list price), not a billed number, and is labeled as such.
 */
export function AgentCostAnalysis({ runs, agents }: { runs: AgentRun[]; agents: Pick<Agent, 'id' | 'name'>[] }) {
  const rows = agentCostRows(runs, agents);
  const totals = costTotals(runs);
  const spend = spendPerDay(runs, 14);

  const tiles: [string, string][] = [
    ['Est. spend', money(totals.totalCost)],
    ['Runs', String(totals.totalRuns)],
    ['Runtime', dur(totals.totalMs)],
    ['Avg / run', money(totals.avgCostPerRun)],
  ];

  return (
    <section>
      <SectionHead label="Cost & runtime" count={`${money(totals.totalCost)} estimated`} />

      <div className="mb-4 grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
        {tiles.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1.5 rounded-lg-t border border-os-border bg-os-surface px-4 py-3">
            <Label>{label}</Label>
            <div className="font-mono text-[22px] font-semibold tracking-[-0.02em]">{value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg-t border border-os-border bg-os-surface">
        <div className="flex items-center justify-between gap-3 border-b border-os-border px-4 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-os-dim">
            Per agent · sorted by spend
          </span>
          <span className="flex items-center gap-2 font-mono text-[10px] text-os-dim">
            14d spend <Spark data={spend} w={90} h={18} />
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse font-mono text-[11.5px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-os-dim">
                <th className="px-4 py-2 font-medium">Agent</th>
                <th className="px-3 py-2 text-right font-medium">Runs</th>
                <th className="px-3 py-2 text-right font-medium">OK</th>
                <th className="px-3 py-2 text-right font-medium">Avg time</th>
                <th className="px-3 py-2 text-right font-medium">Total time</th>
                <th className="px-3 py-2 text-right font-medium">Tokens</th>
                <th className="px-3 py-2 text-right font-medium">Avg cost</th>
                <th className="px-4 py-2 text-right font-medium">Total cost</th>
                <th className="px-4 py-2 text-right font-medium">Last run</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.agentId} className="border-t border-os-border hover:bg-os-surface-2">
                  <td className="px-4 py-2.5 font-sans font-semibold text-os-text">{r.name}</td>
                  <td className="px-3 py-2.5 text-right text-os-muted">{r.runs}</td>
                  <td className={`px-3 py-2.5 text-right ${r.successRate >= 0.9 ? 'text-os-ok' : r.successRate >= 0.6 ? 'text-os-warn' : 'text-os-err'}`}>
                    {pct(r.successRate)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-os-muted">{dur(r.avgMs)}</td>
                  <td className="px-3 py-2.5 text-right text-os-muted">{dur(r.totalMs)}</td>
                  <td className="px-3 py-2.5 text-right text-os-dim">{tok(r.tokensIn + r.tokensOut)}</td>
                  <td className="px-3 py-2.5 text-right text-os-muted">{money(r.avgCost)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-os-accent">{money(r.totalCost)}</td>
                  <td className="px-4 py-2.5 text-right text-os-dim">{rel(r.lastRunAt)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-os-dim">
                    No runs yet. Run an agent, or seed the demo data, to see costs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-os-border px-4 py-2 font-mono text-[9.5px] leading-relaxed text-os-dim">
          Estimated · token counts times model list price (Sonnet $3 / $15, Haiku $0.80 / $4 per 1M in / out). Not a billed figure.
        </div>
      </div>
    </section>
  );
}
