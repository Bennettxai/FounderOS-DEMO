'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy client shell for the combined audience/consistency card: the chart
 * engine (plus its fullscreen modal) loads after first paint, client-only.
 * The placeholder mirrors the card's settled footprint so nothing shifts.
 * Lives as its own file because /social is a server component and
 * next/dynamic with ssr:false must be called from client code.
 */
export const AudienceConsistencyLazy = dynamic(
  () => import('@/components/AudienceConsistency').then((m) => m.AudienceConsistency),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[480px] animate-pulse rounded-lg-t border border-os-border bg-os-surface px-5 py-[18px]" />
    ),
  },
);
