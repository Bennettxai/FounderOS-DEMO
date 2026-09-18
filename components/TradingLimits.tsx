'use client';

/**
 * The Markets Agent's guardrail limits, editable from /trading.
 *
 * These are the numbers `lib/trading-guardrails.ts` enforces on every order, so
 * the card shows all seven — an editor that omitted one would send the operator back
 * to the code for exactly that field. The server clamps to LIMIT_BOUNDS and
 * returns what it actually stored, which is what gets rendered back: a value
 * that was clamped must never read as a clean save.
 */
import { useEffect, useState } from 'react';
import { SlidersHorizontal, Check, TriangleAlert } from 'lucide-react';

type Limits = {
  autopilot: boolean;
  maxNotionalPerTradeUsd: number;
  maxPositionPctOfSleeve: number;
  maxRiskPctPerTrade: number;
  maxConcurrentPositions: number;
  maxTradesPerDay: number;
  minSleeveValueUsd: number;
  maxDeployedCapitalUsd: number;
};

const FIELDS: { key: keyof Limits; label: string; unit: string; hint: string }[] = [
  { key: 'maxDeployedCapitalUsd', label: 'Autonomy budget', unit: '$', hint: 'most capital deployed at once without a human' },
  { key: 'maxNotionalPerTradeUsd', label: 'Max per trade', unit: '$', hint: 'largest single position the agent may open' },
  { key: 'maxPositionPctOfSleeve', label: 'Max position', unit: '%', hint: 'of sleeve equity in any one name' },
  { key: 'maxRiskPctPerTrade', label: 'Risk per trade', unit: '%', hint: 'of equity lost if the stop is hit' },
  { key: 'maxConcurrentPositions', label: 'Max positions', unit: '', hint: 'concurrent open names' },
  { key: 'maxTradesPerDay', label: 'Trades per day', unit: '', hint: 'throttle, not a strategy rule' },
  { key: 'minSleeveValueUsd', label: 'Kill-switch floor', unit: '$', hint: 'buys stop if the sleeve falls through this' },
];

export function TradingLimits() {
  const [limits, setLimits] = useState<Limits | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [source, setSource] = useState<string>('');
  const [clamped, setClamped] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const [autopilot, setAutopilot] = useState(false);

  const apply = (l: Limits) => {
    setLimits(l);
    setAutopilot(Boolean(l.autopilot));
    setDraft(Object.fromEntries(FIELDS.map(({ key }) => [key, String(l[key])])));
  };

  useEffect(() => {
    fetch('/api/trading/limits')
      .then((r) => r.json())
      .then((b) => {
        apply(b.limits);
        setSource(b.source);
        setClamped(b.clamped ?? []);
      })
      .catch(() => setError('could not load limits'));
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    // Send numbers, never strings: the route rejects rather than coerces.
    const body: Record<string, number | boolean> = { autopilot };
    for (const { key } of FIELDS) body[key] = Number(draft[key]);
    if (FIELDS.some(({ key }) => !Number.isFinite(body[key] as number))) {
      setError('every field must be a number');
      setBusy(false);
      return;
    }
    try {
      const res = await fetch('/api/trading/limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        const first = Array.isArray(b.error) ? b.error[0] : null;
        setError(first ? `${first.path?.join('.') ?? 'field'}: ${first.message}` : 'save rejected');
        return;
      }
      // Render what was stored, not what was typed.
      apply(b.limits);
      setClamped(b.clamped ?? []);
      setSource('stored');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('could not reach the OS');
    } finally {
      setBusy(false);
    }
  };

  const dirty =
    limits !== null && (FIELDS.some(({ key }) => String(limits[key]) !== draft[key]) || Boolean(limits.autopilot) !== autopilot);

  return (
    <section className="rounded-lg border border-os-border bg-os-surface">
      <header className="flex items-center justify-between border-b border-os-border px-4 py-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={13} className="text-os-dim" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.26em] text-os-text">
            Agent limits
          </span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-os-dim">
          {source === 'stored' ? 'stored in OS' : source ? 'code defaults' : ''}
        </span>
      </header>

      {limits === null ? (
        <div className="px-4 py-6 font-mono text-[11px] text-os-dim">
          {error ?? 'loading…'}
        </div>
      ) : (
        <>
          <div className="grid gap-px bg-os-border sm:grid-cols-2">
            {FIELDS.map(({ key, label, unit, hint }) => (
              <label key={key} className="flex items-center gap-3 bg-os-surface px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-os-muted">
                    {label}
                  </span>
                  <span className="block truncate font-mono text-[9px] text-os-dim">{hint}</span>
                </span>
                <span className="flex items-center gap-1">
                  {unit === '$' && <span className="font-mono text-[11px] text-os-dim">$</span>}
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={draft[key] ?? ''}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                    className="w-20 rounded-ctl border border-os-border bg-os-bg px-2 py-1 text-right font-mono text-[12px] text-os-text focus:border-os-accent focus:outline-none"
                  />
                  {unit === '%' && <span className="font-mono text-[11px] text-os-dim">%</span>}
                </span>
              </label>
            ))}
          </div>

          {/* The one switch that arms real orders. Off by default; the daily run
              still lands on the tab as a dry run while it is off. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-os-border px-4 py-3">
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-text">Autopilot</div>
              <div className="font-mono text-[9.5px] leading-relaxed text-os-dim">
                {autopilot
                  ? 'ON: the daily strategy run places real orders in the agentic sleeve, inside every limit above.'
                  : 'OFF: the daily run proposes and logs every order as a dry run; nothing reaches the broker.'}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autopilot}
              aria-label="Autopilot"
              onClick={() => setAutopilot((v) => !v)}
              className={`pressable relative h-6 w-11 shrink-0 rounded-full border ${
                autopilot ? 'border-os-ok bg-os-ok/25' : 'border-os-border bg-os-bg'
              }`}
            >
              <span
                className={`absolute top-[3px] h-4 w-4 rounded-full transition-[left] ${autopilot ? 'left-[24px] bg-os-ok' : 'left-[3px] bg-os-dim'}`}
              />
            </button>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-os-border px-4 py-3">
            <div className="font-mono text-[10px]">
              {error && <span className="text-os-err">{error}</span>}
              {!error && clamped.length > 0 && (
                <span className="flex items-center gap-1 text-os-warn">
                  <TriangleAlert size={11} />
                  held at the code ceiling: {clamped.join(', ')}
                </span>
              )}
              {!error && clamped.length === 0 && saved && (
                <span className="animate-enter flex items-center gap-1 text-os-ok">
                  <Check size={11} /> saved, live on the agent&apos;s next run
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={save}
              disabled={busy || !dirty}
              className="pressable rounded-ctl border border-os-border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-os-text disabled:text-os-dim enabled:hover:border-os-border-strong"
            >
              {busy ? 'saving…' : 'save'}
            </button>
          </footer>
        </>
      )}
    </section>
  );
}
