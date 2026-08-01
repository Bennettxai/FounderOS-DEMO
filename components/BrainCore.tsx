'use client';

import { useEffect, useState } from 'react';
import { Search, X, Zap } from 'lucide-react';
import Link from 'next/link';
import type { BrainCluster } from '@/lib/brain-viz';
import { BrainViz } from '@/components/BrainViz';
import { BrainQuery } from '@/components/BrainQuery';

type DoctorCheck = { name: string; status: string; message: string };
type Doctor = {
  connected: boolean;
  healthScore: number | null;
  detail: string;
  checks: DoctorCheck[];
};

const CHECK_DOT: Record<string, string> = { ok: 'ok', warn: 'warn', error: 'err' };

/**
 * The knowledge-core radar, made interactive: its central health gauge is a
 * button. Clicking it opens a pop-out with doctor health/warnings and the
 * hybrid-search prompt. (Brain-dump capture is its own section on the page,
 * between the core and the life map.) The SVG itself is unchanged.
 */
export function BrainCore({
  clusters,
  health,
  doctor,
  fallbackActive,
}: {
  clusters: BrainCluster[];
  health: number | null;
  doctor: Doctor;
  fallbackActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const warnings = doctor.checks.filter((c) => c.status !== 'ok');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <div className="relative">
        <BrainViz clusters={clusters} health={health} />
        {/* Hotspot over the central health gauge (~50%/50% of the SVG box). */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open G-Brain doctor and search"
          className="group absolute left-1/2 top-1/2 grid h-[27%] w-[27%] -translate-x-1/2 -translate-y-1/2 place-items-end justify-center rounded-full pb-[6%] outline-none ring-os-accent/50 transition-[box-shadow] hover:shadow-[var(--glow)] focus-visible:ring-2"
        >
          <span className="pointer-events-none flex translate-y-3 items-center gap-1 rounded-full border border-os-accent/40 bg-os-bg/80 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-os-accent opacity-0 backdrop-blur transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
            <Search className="h-2.5 w-2.5" /> doctor · search
          </span>
        </button>
      </div>

      {open && (
        <div
          className="overlay-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
          onClick={() => setOpen(false)}
        >
          <div
            className="panel-in mb-[6vh] mt-[5vh] w-full max-w-2xl rounded-lg-t border border-os-border bg-os-bg2 shadow-[var(--glow)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-os-border bg-os-bg2 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-os-dim">G-Brain</span>
                <span className="text-sm font-semibold">Doctor · Search</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-sm-t border border-os-border text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-6 px-5 py-5">
              {/* Doctor — gbrain doctor --json --fast */}
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-os-dim">
                    Doctor — warnings
                  </span>
                  <span className="font-mono text-[10px] text-os-dim">
                    {doctor.connected ? `${warnings.length} of ${doctor.checks.length} checks` : 'offline'}
                  </span>
                </div>
                <div className="rounded-md-t border border-os-border bg-os-surface px-3.5 py-3">
                  {doctor.connected && warnings.length === 0 && doctor.checks.length > 0 && (
                    <div className="font-mono text-[11px] text-os-muted">
                      all {doctor.checks.length} checks green · health {doctor.healthScore ?? '—'}/100
                    </div>
                  )}
                  {!doctor.connected && (
                    <div className="font-mono text-[11px] text-os-err">doctor offline — {doctor.detail}</div>
                  )}
                  {warnings.length > 0 && (
                    <ul className="space-y-2">
                      {warnings.map((check) => (
                        <li key={check.name} className="flex items-start gap-2.5 text-[11px]">
                          <span className={`dot mt-1 ${CHECK_DOT[check.status] ?? 'err'}`} />
                          <span className="text-os-muted">
                            <span className="font-mono font-semibold text-os-text">{check.name}</span> — {check.message}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Hybrid search */}
              <div className="border-t border-os-border pt-5">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-os-dim">
                  Hybrid search
                </div>
                <BrainQuery fallbackActive={fallbackActive} />
                {fallbackActive && (
                  <div className="mt-2.5 flex items-center gap-2.5 rounded-md-t border border-os-border bg-os-surface px-3 py-2.5">
                    <Zap className="h-3.5 w-3.5 shrink-0 text-os-warn" strokeWidth={1.7} />
                    <div className="flex-1 text-[11.5px] text-os-muted">
                      Supabase free tier is paused — hybrid queries fall back to local grep until revived.
                    </div>
                    <Link
                      href="/roadmap"
                      className="shrink-0 rounded-sm-t border border-os-border-strong bg-os-surface2 px-2.5 py-1 text-[11px] font-semibold transition-colors hover:border-os-dim"
                    >
                      Roadmap →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
