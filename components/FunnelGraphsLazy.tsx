'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy client shells for the two funnel graph engines — the heaviest code on
 * /funnel. /funnel is a server component, so next/dynamic({ ssr: false }) has to
 * live in client code (same reason as AudienceConsistencyLazy). Each placeholder
 * mirrors its svg aspect (radial 1100/680, space 1100/460) at full width, so
 * /funnel's first paint ships without the viz and nothing shifts when it hydrates.
 */
export const FunnelRadialLazy = dynamic(
  () => import('@/components/FunnelRadial').then((m) => m.FunnelRadial),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full animate-pulse overflow-hidden rounded-lg-t border border-os-border bg-os-surface"
        style={{ aspectRatio: '1100 / 680' }}
      />
    ),
  },
);

export const FunnelSpaceLazy = dynamic(
  () => import('@/components/FunnelSpace').then((m) => m.FunnelSpace),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full animate-pulse overflow-hidden rounded-lg-t border border-os-border bg-os-surface"
        style={{ aspectRatio: '1100 / 460' }}
      />
    ),
  },
);
