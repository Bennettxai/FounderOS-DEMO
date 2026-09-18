'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type Kind = 'ok' | 'warn' | 'err' | 'busy';
type Toast = { id: number; kind: Kind; text: string; undo?: () => void; born: number; held: boolean; ttl: number };
type Api = {
  ok: (text: string, undo?: () => void) => number;
  warn: (text: string) => number;
  err: (text: string) => number;
  busy: (text: string) => number;
  update: (id: number, kind: Kind, text: string) => void;
  close: (id: number) => void;
};

const Ctx = createContext<Api | null>(null);
export const useToast = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('Wrap the app in <Toaster>');
  return c;
};

// Status colors come from the theme vars so mono/terminal both read honestly.
const color = (k: Kind) => (k === 'ok' ? 'var(--ok)' : k === 'warn' ? 'var(--warn)' : k === 'err' ? 'var(--err)' : 'var(--text)');

/**
 * Toasts are for results that live somewhere else (archived, delegated, created, failed).
 * Actions whose result is visible in place confirm on the button instead (AsyncButton).
 * Rules: one line, verb first, name the object. ok/warn auto-dismiss 2.6s; err stays; hover pauses;
 * destructive actions pass `undo`. Stack bottom-right, newest on top, max 4.
 */
export function Toaster({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const n = useRef(0);
  const push = useCallback((kind: Kind, text: string, undo?: () => void) => {
    const id = ++n.current;
    setList((l) => [...l.slice(-3), { id, kind, text, undo, born: Date.now(), held: false, ttl: kind === 'err' ? Infinity : 2600 }]);
    return id;
  }, []);
  const api = useMemo<Api>(
    () => ({
      ok: (t, u) => push('ok', t, u),
      warn: (t) => push('warn', t),
      err: (t) => push('err', t),
      busy: (t) => push('busy', t),
      update: (id, kind, text) =>
        setList((l) => l.map((t) => (t.id === id ? { ...t, kind, text, born: Date.now(), ttl: kind === 'err' ? Infinity : 2600 } : t))),
      close: (id) => setList((l) => l.filter((t) => t.id !== id)),
    }),
    [push],
  );
  useEffect(() => {
    // The 200ms sweep doubles as the re-render tick that advances the progress
    // hairlines; the empty-list guard keeps an idle app from re-rendering forever.
    const iv = setInterval(() => {
      const now = Date.now();
      setList((l) => (l.length ? l.filter((t) => t.held || t.ttl === Infinity || now - t.born < t.ttl) : l));
    }, 200);
    return () => clearInterval(iv);
  }, []);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[300px] flex-col-reverse gap-1.5">
        {list.map((t) => (
          <div
            key={t.id}
            data-lens="r"
            onMouseEnter={() => setList((l) => l.map((x) => (x.id === t.id ? { ...x, held: true } : x)))}
            onMouseLeave={() => setList((l) => l.map((x) => (x.id === t.id ? { ...x, held: false, born: Date.now() } : x)))}
            className={`pressable pointer-events-auto relative flex items-center gap-2 rounded-panel border bg-os-bg px-2.5 py-2 font-mono text-[10.5px] shadow-[0_12px_30px_rgba(0,0,0,.7)] animate-enter ${t.kind === 'err' ? 'border-os-err' : 'border-os-border-strong'}`}
          >
            {t.kind === 'busy' ? (
              <span className="inline-block h-[10px] w-[10px] animate-[om-spin_.8s_linear_infinite] rounded-full border-[1.5px] border-os-text border-r-transparent" />
            ) : (
              <span className="animate-pop" style={{ color: color(t.kind) }}>
                {t.kind === 'ok' ? '✓' : t.kind === 'warn' ? '!' : '✕'}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{t.text}</span>
            {t.undo && (
              <button
                onClick={() => {
                  t.undo?.();
                  api.close(t.id);
                }}
                className="pressable text-[10px] text-os-muted underline hover:text-os-text"
              >
                undo
              </button>
            )}
            <button onClick={() => api.close(t.id)} className="pressable px-0.5 text-[12px] text-os-dim hover:text-os-text">
              ×
            </button>
            {t.ttl !== Infinity && (
              <span
                className="absolute bottom-0 left-2 right-2 h-px origin-left opacity-50 transition-transform duration-200 ease-linear"
                style={{ background: color(t.kind), transform: `scaleX(${t.held ? 1 : Math.max(0, 1 - (Date.now() - t.born) / t.ttl)})` }}
              />
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
