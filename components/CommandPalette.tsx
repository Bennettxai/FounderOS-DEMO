'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DIGIT_VIEWS } from '@/lib/nav';
import { buildPaletteCommands, filterPalette, type PaletteAgent, type PaletteCommand, type PaletteScope } from '@/lib/palette';
import { Chip } from '@/components/Pressable';
import { useToast } from '@/components/Toaster';

const SCOPES: PaletteScope[] = ['all', 'go', 'run', 'ask'];

function isTyping(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}

/**
 * ⌘K — one box for jump / run / ask. Groups: Go to, Run, Ask. Tab cycles scope,
 * ↑↓ move, ↵ fires, Esc closes. Digit keys 1–9 jump views while the palette is
 * closed. No match + ↵ sends the text straight to the Conductor. Mounted once
 * in app/layout.tsx; the Topbar button opens it via the 'alex:palette' event.
 */
export function CommandPalette({ agents }: { agents: PaletteAgent[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<0 | 1 | 2 | 3>(0);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();

  const commands = useMemo(() => buildPaletteCommands(agents), [agents]);

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      } else if (!open && /^[1-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping()) {
        const href = DIGIT_VIEWS[Number(e.key) - 1];
        if (href) router.push(href);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('alex:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('alex:palette', onOpen);
    };
  }, [open, router]);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setScope(0);
      setTimeout(() => input.current?.focus(), 30);
    }
  }, [open]);

  const rows = useMemo(() => filterPalette(commands, q, SCOPES[scope]), [commands, q, scope]);

  const go = (href: string) => {
    if (href.startsWith('http')) window.open(href, '_blank');
    else router.push(href);
  };

  const ask = async (message: string, label: string) => {
    const id = toast.busy(`Asking the Conductor · "${label}"`);
    try {
      const res = await fetch('/api/conductor/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.update(id, 'ok', `Sent to the Conductor · "${label}"`);
    } catch {
      toast.update(id, 'err', 'Conductor unreachable');
    }
  };

  const fire = async (c?: PaletteCommand) => {
    setOpen(false);
    const text = q.trim();
    if (!c) {
      if (text) await ask(text, text.length > 40 ? `${text.slice(0, 40)}…` : text);
      return;
    }
    if (c.kind === 'run' && c.agentId) {
      const id = toast.busy(`${c.title}…`);
      try {
        const res = await fetch(`/api/agents/${c.agentId}/run`, { method: 'POST' });
        if (!res.ok) throw new Error(String(res.status));
        toast.update(id, 'ok', `${c.title} · done`);
      } catch {
        toast.update(id, 'err', `${c.title} failed`);
      }
      return;
    }
    if (c.kind === 'ask' && c.prompt) {
      await ask(c.prompt, c.title);
      return;
    }
    if (c.href) go(c.href);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((i) => Math.max(0, i - 1));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setScope((s) => ((s + 1) % 4) as 0 | 1 | 2 | 3);
      setSel(0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      fire(rows[sel]);
    }
  };

  if (!open) return null;
  const groups = (
    [
      ['go', 'Go to'],
      ['run', 'Run'],
      ['ask', 'Ask'],
    ] as const
  )
    .map(([k, label]) => ({ label, items: rows.filter((r) => r.kind === k) }))
    .filter((g) => g.items.length);

  return (
    <div className="fixed inset-0 z-50 bg-os-bg/55 animate-enter" onClick={() => setOpen(false)}>
      <div
        data-spot
        onClick={(e) => e.stopPropagation()}
        className="absolute left-1/2 top-14 w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-tile border border-os-border-strong bg-os-bg shadow-[0_24px_60px_rgba(0,0,0,.75)] animate-[om-pal_.38s_cubic-bezier(.22,.61,.36,1)_both]"
      >
        <div className="flex items-center gap-2.5 border-b border-os-border px-3.5 py-3">
          <span className="text-os-dim">›</span>
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={onKey}
            placeholder="Jump, run, ask… (type an agent name, a route, or a question)"
            className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-os-text outline-none placeholder:text-os-dim"
          />
          <kbd className="kbd">esc</kbd>
        </div>
        <div className="flex gap-1.5 border-b border-os-hairline px-3.5 py-2">
          {['All', 'Go to', 'Run', 'Ask'].map((l, i) => (
            <Chip
              key={l}
              on={scope === i}
              onClick={() => {
                setScope(i as 0 | 1 | 2 | 3);
                setSel(0);
                input.current?.focus();
              }}
            >
              {l}
            </Chip>
          ))}
          <span className="ml-auto self-center font-mono text-[9px] text-os-dim">{rows.length} results</span>
        </div>
        <div className="max-h-[330px] overflow-auto p-1.5">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="px-2.5 pb-1 pt-2 font-mono text-[8.5px] uppercase tracking-[.2em] text-os-dim">{g.label}</div>
              {g.items.map((r) => {
                const i = rows.indexOf(r);
                const on = i === sel;
                return (
                  <div
                    key={r.id}
                    data-lens="r"
                    onMouseEnter={() => setSel(i)}
                    onClick={() => fire(r)}
                    className={`pressable is-row animate-enter grid cursor-pointer grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-ctl border px-2.5 py-[7px] ${on ? 'border-os-border-strong bg-os-surface2' : 'border-transparent'}`}
                  >
                    <span
                      className={`grid h-[22px] w-[22px] place-items-center rounded-[5px] border border-os-border font-mono text-[10px] ${r.kind === 'run' ? 'text-os-ok' : r.kind === 'ask' ? 'text-os-warn' : 'text-os-muted'}`}
                    >
                      {r.glyph}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[11.5px] font-semibold text-os-text">{r.title}</div>
                      <div className="truncate font-mono text-[9.5px] text-os-dim">{r.sub}</div>
                    </div>
                    <span className="flex items-center gap-1 font-mono text-[9.5px] text-os-dim">
                      {r.kind === 'go' ? 'jump' : r.kind}
                      {on && <kbd className="kbd">↵</kbd>}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          {rows.length === 0 && (
            <div className="animate-enter p-7 text-center font-mono text-[10.5px] leading-relaxed text-os-dim">
              <span className="text-os-text">No match for «{q}».</span>
              <br />
              <span className="text-[9.5px]">press ↵ to ask the Conductor instead</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3.5 border-t border-os-border px-3.5 py-2 font-mono text-[9.5px] text-os-dim">
          <span>
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd> move
          </span>
          <span>
            <kbd className="kbd">↵</kbd> run
          </span>
          <span>
            <kbd className="kbd">tab</kbd> scope
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-blink bg-os-ok" />
            Conductor listening
          </span>
        </div>
      </div>
    </div>
  );
}
