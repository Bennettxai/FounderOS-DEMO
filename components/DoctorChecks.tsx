'use client';

import type { DoctorCheck } from '@/lib/connectors/gbrain';
import { useDoctorRun } from '@/components/DoctorRun';

const CHECK_DOT: Record<string, string> = {
  ok: 'ok',
  warn: 'warn',
  error: 'err',
};

/** The artboard's five shimmer bars, at the artboard's widths. */
const SKELETON_WIDTHS = [180, 210, 160, 200, 170];

/**
 * Mock 3b: the health ring and the checks, as one thing that reruns.
 *
 * While the doctor is reading, the checks are replaced by shimmer rows rather
 * than left standing: a check that says "ok" during a run he just started is a
 * lie for as long as the read takes. When the answer lands the ring re-fills to
 * the new score over 900ms and each check enters with om-in, so the order they
 * come back in reads as the doctor working down its list.
 *
 * The ring transitions its conic gradient, never its radius. Nothing here
 * animates border-radius; that is the one property the rebrand forbids.
 */
export function DoctorChecks({
  checks: serverChecks,
  healthScore: serverScore,
  connected,
  detail,
}: {
  checks: DoctorCheck[];
  healthScore: number | null;
  connected: boolean;
  detail: string;
}) {
  const { busy, checks: liveChecks, healthScore: liveScore, ran } = useDoctorRun();
  const checks = liveChecks ?? serverChecks;
  const healthScore = ran ? liveScore : serverScore;
  const arc = `${((healthScore ?? 0) / 100) * 360}deg`;
  const mask = 'radial-gradient(farthest-side,transparent calc(100% - 5px),#000 calc(100% - 5px))';

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="relative h-[84px] w-[84px] shrink-0">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(var(--text) ${arc}, var(--hairline, var(--border)) 0)`,
              WebkitMaskImage: mask,
              maskImage: mask,
              transition: 'background 900ms cubic-bezier(.22,.61,.36,1)',
            }}
          />
          {busy && (
            <div
              className="absolute inset-0 animate-[om-spin_1.1s_linear_infinite] rounded-full"
              style={{
                background: 'conic-gradient(var(--text) 30deg, transparent 0)',
                WebkitMaskImage: 'radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 3px))',
                maskImage: 'radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 3px))',
              }}
            />
          )}
          <div className="absolute inset-0 grid place-items-center">
            <span className="font-mono text-[19px] font-bold tabular-nums">{healthScore ?? '—'}</span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[11px] text-os-dim">
            / 100 health{connected ? '' : ' · CLI unreachable'}
          </div>
          <div className="mt-1 font-mono text-[10.5px] text-os-muted">
            {busy ? 'reading the engine…' : `${checks.length} checks`}
          </div>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {busy
          ? SKELETON_WIDTHS.map((w, i) => (
              <li key={i} className="py-1">
                <span className="skeleton block" style={{ width: w, maxWidth: '100%' }} />
              </li>
            ))
          : checks.map((check, i) => (
              <li
                key={check.name}
                className="animate-enter flex items-start gap-2 text-[11px]"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span className={`dot mt-1 ${CHECK_DOT[check.status] ?? 'err'}`} />
                <span className="text-os-muted">
                  <span className="font-semibold text-os-text">{check.name}</span> · {check.message}
                </span>
              </li>
            ))}
        {!busy && checks.length === 0 && (
          <li className="rounded-panel border border-dashed border-os-border px-3 py-2 font-mono text-[11px] text-os-dim">
            doctor offline · {detail}
          </li>
        )}
      </ul>
    </div>
  );
}
