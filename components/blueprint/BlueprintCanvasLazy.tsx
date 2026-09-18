'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy client shell for the Blueprint workspace (hierarchy canvas + search
 * + inspector + ask bar): interaction-heavy and client-only, so it loads
 * after first paint behind a dimension-matched skeleton (repo convention -
 * see AudienceConsistencyLazy, BrainGraphView). Its own file because
 * app/blueprint/page.tsx is a server component and next/dynamic with
 * ssr:false must be called from client code.
 */
export const BlueprintCanvasLazy = dynamic(() => import('@/components/blueprint/HierarchyWorkspace').then((m) => m.HierarchyWorkspace), {
  ssr: false,
  loading: () => <div className="bh-skeleton animate-pulse" />,
});
