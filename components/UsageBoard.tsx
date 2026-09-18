'use client';

/**
 * The live token-burn board. Polls /api/usage every 10s -- the refresh path
 * is pure file parsing on the server, so polling costs nothing billable.
 *
 * Layout: rotation verdict strip, then one card per Claude seat, then the
 * Codex plan card (official gauge) and the Ollama status card. Bars follow
 * the house rule: a percentage bar only ever renders an OFFICIAL number;
 * local estimates render as day columns and totals, labeled as estimates.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Dot, Label } from '@/components/terminal';
import { burnOf, fmtTokens, totalBurn, type SeatUsage, type Verdict } from '@/lib/usage';
import type { OllamaLane } from '@/lib/connectors/ollama-usage';

const POLL_MS = 10_000;

type Board = {
  generatedAt: string;
  seats: SeatUsage[];
  codex: SeatUsage | null;
  ollama: OllamaLane;
  verdict: Verdict;
  errors?: Record<string, string>;
};

function age(iso: string | null, now: number): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 90000) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function pctTone(p: number): 'ok' | 'warn' | 'err' {
  return p >= 90 ? 'err' : p >= 70 ? 'warn' : 'ok';
}

function OfficialBar({ title, pct, resetsAt, now }: { title: string; pct: number; resetsAt: string | null; now: number }) {
  const tone = pctTone(pct);
  const toneText = tone === 'err' ? 'text-os-err' : tone === 'warn' ? 'text-os-warn' : 'text-os-text';
  const toneBg = tone === 'err' ? 'bg-os-err' : tone === 'warn' ? 'bg-os-warn' : 'bg-os-text';
  const reset = resetsAt && new Date(resetsAt).getTime() < now ? ' · window has reset since' : '';
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-os-dim">{title}</span>
        <span className={`font-mono text-sm font-bold ${toneText}`}>{pct.toFixed(0)}%{reset && <span className="text-[10px] font-normal text-os-dim">{reset}</span>}</span>
      </div>
      <div className="mt-1 h-2 rounded-full border border-os-border bg-os-surface2">
        <div className={`h-full ${toneBg}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function DayColumns({ seat }: { seat: SeatUsage }) {
  const max = Math.max(1, ...seat.days.map((d) => burnOf(d)));
  return (
    <div className="flex h-16 items-end gap-1">
      {seat.days.map((d) => {
        const burn = burnOf(d);
        const h = burn === 0 ? 2 : Math.max(3, Math.round((burn / max) * 60));
        const today = d === seat.days[seat.days.length - 1];
        return (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${fmtTokens(burn)} burn · ${fmtTokens(d.cacheRead)} cache-read`}>
            <div className={`w-full ${today ? 'bg-os-text' : 'bg-os-dim'}`} style={{ height: h }} />
            <span className="font-mono text-[8px] text-os-dim">{'SMTWTFS'[new Date(d.day + 'T12:00:00').getDay()]}</span>
          </div>
        );
      })}
    </div>
  );
}

function SeatCard({ seat, recommended, now }: { seat: SeatUsage; recommended: boolean; now: number }) {
  const weekBurn = totalBurn(seat.days);
  const today = seat.days[seat.days.length - 1];
  const cacheRead7d = seat.days.reduce((s, d) => s + d.cacheRead, 0);
  const hasData = weekBurn > 0 || seat.lastActivity !== null;
  const models = Object.entries(seat.byModel).sort((a, b) => burnOf(b[1]) - burnOf(a[1]));
  const modelBurnTotal = models.reduce((s, [, t]) => s + burnOf(t), 0);
  return (
    <div data-lens="r" className={`pressable is-row rounded-md-t border bg-os-surface p-4 ${recommended ? 'border-os-text' : 'border-os-border'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Dot state={hasData ? 'ok' : 'off'} />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]">{seat.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {recommended && <Badge tone="accent">use this seat</Badge>}
          <Badge tone="default">{seat.source === 'local' ? 'local' : `pushed ${age(seat.capturedAt, now)}`}</Badge>
        </div>
      </div>

      {seat.official?.weekly || seat.official?.session ? (
        <div className="mt-3 space-y-2">
          {seat.official.session && <OfficialBar title="session window" pct={seat.official.session.usedPercent} resetsAt={seat.official.session.resetsAt} now={now} />}
          {seat.official.weekly && <OfficialBar title="weekly window" pct={seat.official.weekly.usedPercent} resetsAt={seat.official.weekly.resetsAt} now={now} />}
        </div>
      ) : null}

      <div className="mt-3">
        <Label>7-day burn · by day</Label>
        <div className="mt-1">
          <DayColumns seat={seat} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-os-border pt-2">
        <div>
          <div className="font-mono text-base font-bold">{fmtTokens(today ? burnOf(today) : 0)}</div>
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-os-dim">today</div>
        </div>
        <div>
          <div className="font-mono text-base font-bold">{fmtTokens(weekBurn)}</div>
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-os-dim">7 days</div>
        </div>
        <div>
          <div className="font-mono text-base font-bold text-os-muted">{fmtTokens(cacheRead7d)}</div>
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-os-dim">ctx re-read</div>
        </div>
      </div>

      {models.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-os-border pt-2">
          {models.slice(0, 4).map(([m, t]) => (
            <div key={m} className="flex items-center justify-between font-mono text-[10px]">
              <span className="text-os-muted">{m.replace(/^claude-/, '')}</span>
              <span>
                {fmtTokens(burnOf(t))}
                <span className="text-os-dim"> · {modelBurnTotal ? Math.round((burnOf(t) / modelBurnTotal) * 100) : 0}%</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-os-border pt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-os-dim">
        <span>last activity {age(seat.lastActivity, now)}</span>
      </div>
      {seat.note && <p className="mt-2 font-mono text-[9px] leading-relaxed text-os-dim">{seat.note}</p>}
    </div>
  );
}

export default function UsageBoard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/usage', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBoard((await res.json()) as Board);
      setError(null);
      setFetchedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
    timer.current = setInterval(() => void load(), POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  if (!board) {
    return (
      <div className="rounded-lg-t border border-os-border bg-os-surface p-6 font-mono text-[11px] text-os-dim">
        {error ? `usage read failed: ${error}` : 'reading local transcripts…'}
      </div>
    );
  }

  const now = fetchedAt || Date.now();
  const claudeSeats = board.seats.filter((s) => s.kind === 'claude');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md-t border border-os-border bg-os-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-os-dim">rotate</span>
          {board.verdict.recommend ? (
            <span className="font-mono text-sm font-bold uppercase tracking-[0.1em]">
              → {claudeSeats.find((s) => s.id === board.verdict.recommend)?.label ?? board.verdict.recommend}
            </span>
          ) : (
            <span className="font-mono text-sm text-os-muted">no recommendation</span>
          )}
        </div>
        <span className="font-mono text-[10px] text-os-dim">{board.verdict.reason}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {claudeSeats.map((s) => (
          <SeatCard key={s.id} seat={s} recommended={board.verdict.recommend === s.id} now={now} />
        ))}
        {claudeSeats.length < 2 && (
          <div className="flex flex-col justify-center rounded-md-t border border-dashed border-os-border p-4 font-mono text-[10px] leading-relaxed text-os-dim">
            <span className="font-bold uppercase tracking-[0.2em]">second seat not reporting</span>
            <span className="mt-2">
              run `node scripts/push-usage.mjs` pointed at this host on the other machine (cron it for a live
              second bar); the board compares seats only on data it actually has.
            </span>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {board.codex ? (
          <SeatCard seat={board.codex} recommended={false} now={now} />
        ) : (
          <div className="rounded-md-t border border-dashed border-os-border p-4 font-mono text-[10px] text-os-dim">
            no codex sessions found on this box
          </div>
        )}

        <div data-lens="r" className="pressable is-row rounded-md-t border border-os-border bg-os-surface p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Dot state={board.ollama.state === 'up' ? 'ok' : 'err'} />
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]">Ollama</span>
            </div>
            <Badge tone={board.ollama.state === 'up' ? 'ok' : 'err'}>{board.ollama.state}</Badge>
          </div>
          <div className="mt-3 space-y-1">
            {board.ollama.models.map((m) => (
              <div key={m.name} className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-os-muted">{m.name}</span>
                <Badge tone={m.cloud ? 'warn' : 'default'}>{m.cloud ? 'cloud · bills plan' : 'local · free'}</Badge>
              </div>
            ))}
            {board.ollama.models.length === 0 && <p className="font-mono text-[10px] text-os-dim">no models listed</p>}
          </div>
          <p className="mt-3 border-t border-os-border pt-2 font-mono text-[9px] leading-relaxed text-os-dim">{board.ollama.note}</p>
        </div>
      </div>

      <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.16em] text-os-dim">
        <span>refreshes every {POLL_MS / 1000}s · local file parsing only · no paid calls</span>
        <span>{error ? `stale — last poll failed (${error})` : `updated ${age(board.generatedAt, Date.now())}`}</span>
      </div>
    </div>
  );
}
