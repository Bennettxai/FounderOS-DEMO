'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { filterCommands, type Command } from '@/lib/palette';
// Digit shortcuts (1–9) jump to views — derived from the sidebar's visible order
// so they stay in lockstep with the nav.
import { DIGIT_VIEWS } from '@/lib/nav';

function isTyping(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}

export function CommandPalette({ commands }: { commands: Command[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => filterCommands(commands, query).slice(0, 9), [commands, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setIndex(0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        close();
      } else if (!open && /^[1-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping()) {
        const href = DIGIT_VIEWS[Number(e.key) - 1];
        if (href) router.push(href);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('alex:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('alex:palette', onOpen);
    };
  }, [close, open, router]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function go(command: Command | undefined) {
    if (!command) return;
    close();
    if (command.href.startsWith('http')) window.open(command.href, '_blank');
    else router.push(command.href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-os-bg/60 pt-[14vh] backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-[560px] max-w-[calc(100vw-48px)] overflow-hidden rounded-lg-t border border-os-border-strong bg-os-surface shadow-[0_24px_80px_-16px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, hits.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              go(hits[index]);
            }
          }}
          placeholder="Jump anywhere — views, agents, tools…"
          className="w-full border-b border-os-border bg-transparent px-[18px] py-4 font-mono text-sm text-os-text outline-none placeholder:text-os-dim"
        />
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {hits.length === 0 && (
            <li className="px-4 py-6 text-center font-mono text-xs text-os-dim">No matches</li>
          )}
          {hits.map((command, i) => (
            <li key={command.id}>
              <button
                onClick={() => go(command)}
                onMouseEnter={() => setIndex(i)}
                className={`flex w-full items-center gap-2.5 rounded-sm-t px-3 py-[9px] text-left text-[13px] ${
                  i === index ? 'bg-[var(--accent-soft)] text-os-text' : 'text-os-muted'
                }`}
              >
                <span className="w-3 shrink-0 opacity-60">{i === index ? '›' : ''}</span>
                <span className="min-w-0 flex-1 truncate">{command.label}</span>
                {command.hint && (
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim">
                    {command.hint}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
