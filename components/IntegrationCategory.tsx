'use client';

import { useState } from 'react';

/**
 * A collapsible category row in the "Browse by category" section. Thin client
 * wrapper: the card grid is rendered on the server and passed as children; this
 * only toggles its visibility and rotates the marker.
 *
 * Mock 3f: the header is a lens row and the chevron is the ▸ glyph the rest of
 * the rebrand uses for "there is more under this", rotated 90° on open. Only
 * transform moves, so the panel radius never animates.
 */
export function IntegrationCategory({
  label,
  count,
  defaultOpen = false,
  children,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-panel border border-os-border bg-os-surface/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-lens="r" className="pressable flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span
          aria-hidden
          className={`shrink-0 font-mono text-[11px] leading-none text-os-dim transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        >
          ▸
        </span>
        <span className="flex-1 text-[13px] font-semibold text-os-text">{label}</span>
        <span className="grid h-5 min-w-5 place-items-center rounded-full border border-os-border px-1.5 font-mono text-[10px] text-os-dim">
          {count}
        </span>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}
