'use client';

import { usePathname } from 'next/navigation';
import { Search } from 'lucide-react';

import { ThemeToggle } from '@/components/ThemeToggle';
import { OsMark } from '@/components/OsMark';

const SEGMENT_LABELS: Record<string, string> = {
  '': 'home',
  agents: 'agents',
  tasks: 'tasks',
  skills: 'skills',
  org: 'org-chart',
  brain: 'startup-brain',
  workflows: 'workflows',
  integrations: 'connections',
  analytics: 'analytics',
};

export function openPalette() {
  window.dispatchEvent(
    new CustomEvent('startup:palette'),
  );
}

export function Topbar() {
  const pathname = usePathname();
  const segment = pathname.split('/')[1] ?? '';
  const here = SEGMENT_LABELS[segment] ?? segment;

  return (
    <div className="sticky top-0 z-30 flex h-[52px] shrink-0 items-center gap-3.5 border-b border-os-border bg-os-bg2/70 px-6 backdrop-blur">
      <div className="flex items-center gap-[7px] whitespace-nowrap font-mono text-[11px] tracking-[0.04em] text-os-dim">
        <span>startup</span>

        <span className="opacity-45">/</span>

        <span className="text-os-text">
          {here}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <ThemeToggle />

        <button
          onClick={openPalette}
          title="Command palette"
          aria-label="Open command palette"
          className="grid h-[30px] w-[30px] place-items-center rounded-sm-t border border-os-border bg-os-surface text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text"
        >
          <Search className="h-3.5 w-3.5" />
        </button>

        <OsMark
          size={26}
          className="ml-1 shrink-0"
        />
      </div>
    </div>
  );
}