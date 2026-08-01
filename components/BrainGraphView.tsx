'use client';

import dynamic from 'next/dynamic';
import { useState, type ComponentProps } from 'react';
import type { KnowledgeGraph as KnowledgeGraphType } from '@/components/KnowledgeGraph';

/**
 * The two graph engines are the heaviest client bundles in the app
 * (KnowledgeGraph alone is ~114KB of source pulling d3-force). They load
 * lazily, client-only, behind dimension-matched skeletons so /brain's first
 * paint ships without them and nothing shifts when they hydrate.
 */
const KnowledgeGraph = dynamic(() => import('@/components/KnowledgeGraph').then((m) => m.KnowledgeGraph), {
  ssr: false,
  loading: () => (
    // mirrors the graph's settled footprint: 680px canvas + directory aside
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="h-[680px] min-w-0 flex-1 animate-pulse rounded-lg-t border border-os-border bg-os-surface" />
      <div className="hidden shrink-0 rounded-lg-t border border-os-border bg-os-surface lg:block lg:h-[680px] lg:w-72" />
    </div>
  ),
});

const NeuralGraph = dynamic(() => import('@/components/NeuralGraph').then((m) => m.NeuralGraph), {
  ssr: false,
  loading: () => (
    // the neural canvas renders at its viewBox aspect (1200 / 640), full width
    <div
      className="w-full animate-pulse overflow-hidden rounded-lg-t border border-os-border bg-os-surface"
      style={{ aspectRatio: '1200 / 640' }}
    />
  ),
});

/**
 * View switch for the /brain knowledge graph: the radial six-pillar wheel
 * (default) or the horizontal neural-network projection of the same data.
 */
export function BrainGraphView(props: ComponentProps<typeof KnowledgeGraphType>) {
  const [view, setView] = useState<'radial' | 'neural'>('radial');
  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        {(
          [
            { id: 'radial', label: 'Radial' },
            { id: 'neural', label: 'Neural' },
          ] as const
        ).map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`rounded-sm-t border px-2.5 py-1 font-mono text-[10.5px] transition-colors ${
              view === v.id
                ? 'border-os-accent text-os-accent'
                : 'border-os-border text-os-dim hover:text-os-muted'
            }`}
            aria-pressed={view === v.id}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === 'radial' ? (
        <KnowledgeGraph {...props} />
      ) : (
        <NeuralGraph
          graph={props.graph}
          agents={props.agents}
          departments={props.departments}
          people={props.people}
          tasks={props.tasks}
          runsByAgent={props.runsByAgent}
        />
      )}
    </div>
  );
}
