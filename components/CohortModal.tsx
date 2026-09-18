'use client';

/**
 * First-run welcome pop-up. The first time someone clones the demo, runs
 * `npm run dev` and lands on the home screen, this greets them and points at
 * the FounderOS cohort. Dismissal persists to localStorage, so it appears
 * once per browser and never nags again — the footer CTA (`CohortBanner`)
 * carries the same invite permanently on every view.
 */
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, X } from 'lucide-react';
import { COHORT_SEEN, COHORT_STORAGE_KEY, COHORT_URL, shouldShowCohortModal } from '@/lib/cohort';

export function CohortModal() {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);

  // Read storage after mount only — the server has no localStorage, and
  // deciding during render would desync the first client paint.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(COHORT_STORAGE_KEY);
    } catch {
      /* storage blocked (private mode) — treat as a fresh visit */
    }
    setOpen(shouldShowCohortModal({ pathname, stored }));
  }, [pathname]);

  const dismiss = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(COHORT_STORAGE_KEY, COHORT_SEEN);
    } catch {
      /* storage blocked — it will greet them again next run, no harm */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div
      className="overlay-in fixed inset-0 z-[150] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm sm:p-6"
      onClick={dismiss}
      role="presentation"
    >
      <div
        className="panel-in w-full max-w-lg rounded-lg-t border border-os-border-strong bg-os-bg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cohort-modal-title"
      >
        <div className="flex items-start justify-between border-b border-os-border px-5 py-3.5">
          <div className="page-eyebrow flex items-center gap-2 pt-1 font-mono text-[9.5px] uppercase tracking-[0.32em] text-os-dim">
            FounderOS Cohort
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="pressable grid h-7 w-7 shrink-0 place-items-center rounded-sm-t border border-os-border text-os-muted transition-[background-color,border-color,color] duration-[var(--dur-press)] hover:border-os-border-strong hover:text-os-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="px-5 py-5">
          <h2
            id="cohort-modal-title"
            className="text-[20px] font-bold uppercase leading-[1.15] tracking-[0.06em]"
          >
            Build this for real
          </h2>
          <p className="mt-3 font-mono text-[12px] leading-relaxed text-os-muted">
            You&apos;re running the FounderOS demo locally — the operator console, the agent
            roster, the knowledge core, all of it.
          </p>
          <p className="mt-3 font-mono text-[12px] leading-relaxed text-os-muted">
            Want help setting this up? Go to the FounderOS cohort to learn how to build the entire
            thing end-to-end and get it into production.
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
            <a
              href={COHORT_URL}
              target="_blank"
              rel="noreferrer"
              onClick={dismiss}
              className="inline-flex items-center justify-center gap-1.5 rounded-sm-t border border-os-accent bg-os-accent px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-os-ink transition-opacity hover:opacity-90"
            >
              Join the cohort — founderos.example.com
              <ArrowUpRight className="h-3 w-3" />
            </a>
            <button
              type="button"
              onClick={dismiss}
              className="pressable rounded-sm-t border border-os-border px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-os-muted transition-[background-color,border-color,color] duration-[var(--dur-press)] hover:border-os-border-strong hover:text-os-text"
            >
              Keep exploring
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
