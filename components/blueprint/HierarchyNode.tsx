'use client';

import { memo, type AnimationEvent, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import type { HGroup, HNode, HItem } from '@/lib/blueprint/hierarchy';
import { KIND_ICON } from '@/lib/blueprint/hierarchy';
import type { Box } from '@/lib/blueprint/hierarchy-layout';
import { iconFor } from './icons';

const iconOf = (it: HItem) => iconFor(it.icon || KIND_ICON[it.kind] || 'box');

function countLeaves(g: HGroup): number {
  return g.children.reduce((a, c) => a + (c.type === 'group' ? countLeaves(c) : 1), 0);
}

/**
 * One drawn thing: a card, a compact card, a hero, the operator's start
 * circle, a routing diamond, an external (cloud) card, or a collapsed group
 * shown as its count card. Position comes in as a transform; the kind colour
 * rides `--c`, so every glow, border and tile follows the legend.
 */
export const HierarchyNode = memo(function HierarchyNode({
  box,
  className,
  enterDelay,
  onAnimationEnd,
}: {
  box: Box;
  className: string;
  enterDelay?: string;
  onAnimationEnd: (e: AnimationEvent<HTMLDivElement>) => void;
}) {
  const it = box.it as HItem;
  const shape = box.collapsed ? 'group' : it.type === 'node' ? it.shape : 'card';
  const style: CSSProperties & Record<string, string> = {
    width: `${box.w}px`,
    height: `${box.h}px`,
    transform: `translate(${box.x}px, ${box.y}px)`,
    '--tx': `${box.x}px`,
    '--ty': `${box.y}px`,
    '--c': `var(--bh-k-${it.kind}, var(--text-2))`,
  };
  if (enterDelay) style['--d'] = enterDelay;
  const Icon = iconOf(it);
  const status = it.type === 'node' ? it.status : (it.status ?? '');

  let body: React.ReactNode;
  if (box.collapsed && it.type === 'group') {
    body = (
      <div className="bh-card">
        <div className="bh-tile">
          <Icon />
        </div>
        <div className="bh-ttl">
          <div className="t">{it.name}</div>
          <div className="s">{it.sub}</div>
        </div>
        <span className="bh-stack">
          {it.children.slice(0, 4).map((c) => {
            const CI = iconOf(c);
            return (
              <i key={c.id}>
                <CI />
              </i>
            );
          })}
        </span>
        <span className="bh-count">{countLeaves(it)}</span>
        <span className="bh-chev">
          <ChevronDown />
        </span>
      </div>
    );
  } else if (shape === 'start' || shape === 'diamond') {
    body = (
      <>
        <div className="bh-card">
          <Icon />
        </div>
        <div className="bh-label">
          <div>{it.name}</div>
          <div className="s">{it.sub}</div>
        </div>
      </>
    );
  } else {
    body = (
      <div className="bh-card">
        <div className="bh-tile">
          <Icon />
        </div>
        <div className="bh-ttl">
          <div className="t">{it.name}</div>
          <div className="s">{it.sub}</div>
        </div>
        <span className="bh-st" data-s={status} />
      </div>
    );
  }

  return (
    <div className={`bh-node ${shape} k-${it.kind} ${className}`} data-id={box.id} data-s={status} data-mode={box.collapsed ? 'g' : 'n'} style={style} onAnimationEnd={onAnimationEnd}>
      {body}
    </div>
  );
});

export { iconOf as hierarchyIcon };

export type { HNode };
