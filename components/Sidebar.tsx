'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_OPERATE, NAV_AGENTS, NAV_INTELLIGENCE, NAV_SYSTEM, NAV_LIBRARY, type NavItem } from '@/lib/nav';
import { OsMark } from '@/components/OsMark';

function NavGroup({ title, items, pathname }: { title: string; items: NavItem[]; pathname: string }) {
  return (
    <>
      <div className="px-2.5 pb-1.5 pt-3.5 font-mono text-[9px] uppercase tracking-[0.18em] text-os-dim">
        {title}
      </div>
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2.5 rounded-sm-t border px-2.5 py-[7px] text-[13.5px] font-medium transition-colors ${
              active
                ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-os-accent'
                : 'border-transparent text-os-muted hover:bg-os-surface2 hover:text-os-text'
            }`}
          >
            <Icon className="h-[15px] w-[15px] shrink-0 opacity-85" strokeWidth={1.7} />
            {label}
          </Link>
        );
      })}
    </>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [live, setLive] = useState<{ up: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/connections')
      .then((res) => res.json())
      .then((body: { connections?: { state: string }[] }) => {
        if (cancelled || !Array.isArray(body.connections)) return;
        setLive({
          up: body.connections.filter((c) => c.state === 'connected').length,
          total: body.connections.length,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-[232px] flex-col border-r border-os-border bg-os-bg2">
      <div className="flex items-center gap-[11px] px-[18px] pb-[18px] pt-5">
        <OsMark size={34} className="shrink-0" />
        <div>
          <div className="text-[13px] font-bold tracking-[0.14em]">FOUNDER OS</div>
          <div className="mt-[3px] whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.16em] text-os-dim">
            v3 · Operator Mode
          </div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-2">
        <NavGroup title="Operate" items={NAV_OPERATE} pathname={pathname} />
        <NavGroup title="Agents" items={NAV_AGENTS} pathname={pathname} />
        <NavGroup title="Intelligence" items={NAV_INTELLIGENCE} pathname={pathname} />
        <NavGroup title="System" items={NAV_SYSTEM} pathname={pathname} />
        <NavGroup title="Variants" items={NAV_LIBRARY} pathname={pathname} />
      </nav>
      <div className="flex flex-col gap-2 border-t border-os-border px-[18px] py-3.5">
        <div className="flex items-center gap-2 whitespace-nowrap font-mono text-[10px] text-os-muted">
          <span className="dot ok pulse" /> {live ? `${live.up}/${live.total}` : '—/—'} systems live
        </div>
        <div className="whitespace-nowrap font-mono text-[10px] text-os-dim">
          localhost:4100 · sqlite · real agents
        </div>
      </div>
    </aside>
  );
}
