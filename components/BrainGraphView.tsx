'use client';

import dynamic from 'next/dynamic';
import { useState, type ComponentProps } from 'react';
import { Chip } from '@/components/Pressable';
import { SlidingTabs } from '@/components/SlidingTabs';
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
      <div className="h-[680px] min-w-0 flex-1 animate-pulse rounded-panel border border-os-border bg-os-surface" />
      <div className="hidden shrink-0 rounded-panel border border-os-border bg-os-surface lg:block lg:h-[680px] lg:w-72" />
    </div>
  ),
});

const NeuralGraph = dynamic(() => import('@/components/NeuralGraph').then((m) => m.NeuralGraph), {
  ssr: false,
  loading: () => (
    // the neural canvas renders at its viewBox aspect (1200 / 640), full width
    <div
      className="w-full animate-pulse overflow-hidden rounded-panel border border-os-border bg-os-surface"
      style={{ aspectRatio: '1200 / 640' }}
    />
  ),
});

/**
 * View switch for the /brain knowledge graph: the radial six-pillar wheel
 * (default) or the horizontal neural-network projection of the same data.
 */
export function BrainGraphView({ fill, ...props }: ComponentProps<typeof KnowledgeGraphType>) {
  const [view, setView] = useState<'radial' | 'neural'>('radial');
  const pillars = props.departments ?? [];
  // every pillar on to start; a chip off dims its nodes AND drops its directory rows
  const [activePillars, setActivePillars] = useState<string[]>(() => pillars.map((d) => d.id));
  const toggle = (id: string) =>
    setActivePillars((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  return (
    <div className={fill ? 'flex h-full flex-col' : undefined}>
      <div className="mb-2 flex shrink-0 items-center gap-1">
        <SlidingTabs<'radial' | 'neural'>
          tabs={[
            { id: 'radial', label: 'Radial' },
            { id: 'neural', label: 'Neural' },
          ]}
          value={view}
          onChange={setView}
          variant="pill"
          tabWidth={84}
        />
        {/* pillar filters belong to the radial wheel — the neural projection
            does not take them, and an armed-but-inert chip would be a lie */}
        {view === 'radial' && pillars.length > 0 && (
          <>
            <span aria-hidden className="mx-1.5 h-[18px] w-px shrink-0 bg-os-border" />
            <div className="flex flex-wrap items-center gap-1">
              {pillars.map((d) => (
                <Chip
                  key={d.id}
                  on={activePillars.includes(d.id)}
                  onClick={() => toggle(d.id)}
                  title={`Filter ${d.name}`}
                >
                  {d.name}
                </Chip>
              ))}
            </div>
          </>
        )}
      </div>
      <div className={fill ? 'min-h-0 flex-1' : undefined}>
        {view === 'radial' ? (
          <KnowledgeGraph
            fill={fill}
            {...props}
            activePillars={activePillars}
            onShowAllPillars={() => setActivePillars(pillars.map((d) => d.id))}
          />
        ) : (
          <NeuralGraph
            graph={props.graph}
            agents={props.agents}
            departments={props.departments}
            people={props.people}
            tasks={props.tasks}
            runsByAgent={props.runsByAgent}
            wiki={props.wiki}
          />
        )}
      </div>
    </div>
  );
}
