import { ArrowUpRight } from 'lucide-react';
import { COHORT_CTA, COHORT_URL } from '@/lib/cohort';

/**
 * Permanent footer CTA — rendered once in the layout, under `{children}`, so
 * it lands at the bottom of every view. Static markup on purpose: no state,
 * no client JS, no hydration cost on any route.
 */
export function CohortBanner() {
  return (
    <footer className="mt-14 border-t border-os-border pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="page-eyebrow mb-1.5 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.32em] text-os-dim">
            FounderOS Cohort
          </div>
          <p className="max-w-[70ch] font-mono text-[11.5px] leading-relaxed text-os-muted">
            {COHORT_CTA}
          </p>
        </div>
        <a
          href={COHORT_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 self-start whitespace-nowrap rounded-sm-t border border-os-border-strong px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-os-text transition-[background-color,border-color,color] duration-[var(--dur-press)] hover:border-os-accent hover:bg-os-surface2 sm:self-auto"
        >
          founderos.example.com
          <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>
    </footer>
  );
}
