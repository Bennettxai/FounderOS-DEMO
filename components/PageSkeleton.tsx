/**
 * The instant-paint fallback every route shows on click, before its
 * `force-dynamic` server render (live DB/connector reads) finishes.
 *
 * This is the fix for "the button doesn't respond to my click": without a
 * `loading.tsx`, the App Router keeps the OLD page fully painted and does
 * nothing else until the new page's entire render completes, so a click
 * looks dead for however long the server takes. Once a `loading.tsx` exists,
 * Next swaps to it the instant navigation starts -- same render budget as
 * before, but the screen answers back immediately instead of freezing.
 *
 * It is also what makes prefetching possible at all on a fully dynamic page:
 * Next can only prefetch UP TO the nearest loading boundary, so a route with
 * none has nothing to preload. Every sidebar link sits in the viewport, so
 * Next prefetches this shell for all of them as soon as the shell exists --
 * the "preload while I'm using it" half of the ask, for free.
 *
 * No page-specific content on purpose: a generic shape that matches every
 * page's actual skeleton (PageHeader, then a loose grid of panels) avoids
 * duplicating each page's real layout just to guess at it, and it is the same
 * `animate-pulse` + hairline-border block already used for lazy-loaded graphs
 * (BrainGraphView, AudienceConsistencyLazy) — one visual language, not two.
 */
function Block({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg-t border border-os-border bg-os-surface ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div className="px-6 py-5">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <Block className="mb-2 h-2.5 w-24" />
          <Block className="h-6 w-56" />
        </div>
        <Block className="h-8 w-28" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Block className="h-28" />
        <Block className="h-28" />
        <Block className="h-28" />
      </div>
      <Block className="mt-3 h-64" />
    </div>
  );
}
