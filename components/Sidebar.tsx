'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PanelLeft } from 'lucide-react';
import { OsMark } from '@/components/OsMark';
import { usePathname } from 'next/navigation';
import { NAV_OPERATE, NAV_AGENTS, NAV_INTELLIGENCE, NAV_SYSTEM, NAV_LIBRARY, type NavItem } from '@/lib/nav';

function NavGroup({
  title,
  items,
  pathname,
  collapsed,
  onTip,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
  onTip: (tip: { label: string; y: number } | null) => void;
}) {
  return (
    <>
      {/* Collapsed keeps a divider where the group heading was, so the icon
          runs still read as groups rather than one undifferentiated column. */}
      {collapsed ? (
        <div className="mx-2 my-1.5 border-t border-os-border" aria-label={title} />
      ) : (
        <div className="px-2.5 pb-1.5 pt-3.5 font-mono text-[9px] uppercase tracking-[0.18em] text-os-dim">
          {title}
        </div>
      )}
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            onMouseEnter={(e) =>
              collapsed
                ? onTip({ label, y: e.currentTarget.getBoundingClientRect().top })
                : undefined
            }
            onMouseLeave={() => (collapsed ? onTip(null) : undefined)}
            data-lens="r"
            className={`pressable is-dark group relative flex items-center rounded-ctl border text-[13.5px] font-medium hover:translate-x-[2px] ${
              collapsed ? 'justify-center px-0 py-[9px]' : 'gap-2.5 px-2.5 py-[7px]'
            } ${
              active
                ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-os-accent'
                : 'border-transparent text-os-muted hover:text-os-text'
            }`}
          >
            <Icon className="h-[15px] w-[15px] shrink-0 opacity-85" strokeWidth={1.7} />
            {collapsed ? null : label}
          </Link>
        );
      })}
    </>
  );
}

const COLLAPSED_W = 56;
const MIN_W = 190;
const MAX_W = 420;
const DEFAULT_W = 232;

export function Sidebar() {
  const pathname = usePathname();
  const [live, setLive] = useState<{ up: number; total: number } | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  // The nav scrolls, and any scrolling ancestor clips an absolutely positioned
  // child — so the collapsed label is rendered fixed, outside that box.
  const [tip, setTip] = useState<{ label: string; y: number } | null>(null);
  const [width, setWidth] = useState(DEFAULT_W);
  const dragging = useRef(false);

  // Restore the previous shape before first paint of the nav, so the OS opens
  // the way it was left rather than snapping after hydration.
  useEffect(() => {
    const savedW = Number(localStorage.getItem('founderos.sidebar.w'));
    if (Number.isFinite(savedW) && savedW >= MIN_W && savedW <= MAX_W) setWidth(savedW);
    setCollapsed(localStorage.getItem('founderos.sidebar.collapsed') === '1');
  }, []);

  // Where this instance actually is (localhost in dev, the deployed host
  // name in production). Client-only: there is no location during SSR.
  useEffect(() => {
    setHost(window.location.host);
  }, []);

  // A stale label must never hang around after the rail expands.
  useEffect(() => {
    if (!collapsed) setTip(null);
  }, [collapsed]);

  // The shell's left margin reads this, so the page follows the sidebar
  // instead of the width being duplicated in two places.
  useEffect(() => {
    const w = collapsed ? COLLAPSED_W : width;
    document.documentElement.style.setProperty('--sidebar-w', `${w}px`);
  }, [collapsed, width]);

  useEffect(() => {
    localStorage.setItem('founderos.sidebar.collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (collapsed) return;
      e.preventDefault();
      dragging.current = true;
      document.body.style.cursor = 'col-resize';
      // Stop text selecting across the whole app while dragging.
      document.body.style.userSelect = 'none';

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const next = Math.min(MAX_W, Math.max(MIN_W, ev.clientX));
        setWidth(next);
      };
      const onUp = () => {
        dragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        setWidth((w) => {
          localStorage.setItem('founderos.sidebar.w', String(w));
          return w;
        });
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [collapsed],
  );

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
    <aside
      className="fixed inset-y-0 left-0 z-20 flex flex-col border-r border-os-border bg-os-bg2"
      style={{ width: collapsed ? COLLAPSED_W : width }}
    >
      <div
        className={`flex pb-[18px] pt-5 ${
          collapsed ? 'flex-col items-center gap-2 px-0' : 'items-center justify-between px-[18px]'
        }`}
      >
        {/* The emblem is the OS logo. Collapsed, it IS the identity — the
            wordmark is gone, so the mark carries it and the toggle stacks
            underneath (34px + a 28px button will not sit side by side in 56px). */}
        {collapsed ? (
          <OsMark size={30} className="shrink-0" />
        ) : (
          <div className="flex items-center gap-[11px]">
            <OsMark size={34} className="shrink-0" />
            <div>
              <div className="text-[13px] font-bold tracking-[0.14em]">FOUNDER OS</div>
              <div className="mt-[3px] whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.16em] text-os-dim">
                v3 · Operator Mode
              </div>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          data-lens="c"
          className="pressable is-dark flex h-7 w-7 shrink-0 items-center justify-center rounded-ctl border border-transparent text-os-dim hover:border-os-border hover:text-os-text"
        >
          <PanelLeft className="h-[15px] w-[15px]" strokeWidth={1.7} />
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-2">
        <NavGroup title="Operate" items={NAV_OPERATE} pathname={pathname} collapsed={collapsed} onTip={setTip} />
        <NavGroup title="Agents" items={NAV_AGENTS} pathname={pathname} collapsed={collapsed} onTip={setTip} />
        <NavGroup title="Intelligence" items={NAV_INTELLIGENCE} pathname={pathname} collapsed={collapsed} onTip={setTip} />
        <NavGroup title="System" items={NAV_SYSTEM} pathname={pathname} collapsed={collapsed} onTip={setTip} />
        <NavGroup title="Variants" items={NAV_LIBRARY} pathname={pathname} collapsed={collapsed} onTip={setTip} />
      </nav>
      <div
        className={`flex flex-col gap-2 border-t border-os-border py-3.5 ${
          collapsed ? 'items-center px-0' : 'px-[18px]'
        }`}
      >
        <div className="flex items-center gap-2 whitespace-nowrap font-mono text-[10px] text-os-muted">
          <span className="dot ok pulse" />
          {!collapsed && <>{live ? `${live.up}/${live.total}` : '—/—'} systems live</>}
        </div>
        {!collapsed && (
          // The host is read at runtime: hardcoding localhost read as a lie the
          // moment the OS was served from a remote host. Wraps rather than nowrap,
          // which used to clip "real agents" off the edge of the rail.
          <div className="break-words font-mono text-[10px] leading-relaxed text-os-dim">
            {host ?? '…'} · sqlite · real agents
          </div>
        )}
      </div>

      {collapsed && tip && (
        <div
          className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-sm-t border border-os-border-strong bg-os-surface px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-os-text"
          style={{ left: COLLAPSED_W + 8, top: tip.y + 15 }}
        >
          {tip.label}
        </div>
      )}

      {/* Drag the right edge to resize. Sits on the border itself with a wider
          invisible hit area, so it is grabbable without being a visible bar. */}
      {!collapsed && (
        <div
          onMouseDown={onDragStart}
          onDoubleClick={() => setWidth(DEFAULT_W)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize · double-click to reset"
          className="absolute inset-y-0 -right-1 z-30 w-2 cursor-col-resize hover:bg-[var(--accent-soft)]"
        />
      )}
    </aside>
  );
}
