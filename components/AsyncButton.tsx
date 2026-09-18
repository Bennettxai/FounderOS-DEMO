'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable } from './Pressable';

type Phase = 'idle' | 'busy' | 'done';

/** Async affordance: idle → spinner (optionally with elapsed seconds) → ✓ pop,
    then back to idle after 1.4s. Every async action must show busy and done.
    A caller that knows the run failed passes `failed`, so the done phase reads
    ✗ in the error color instead of claiming a success that never happened. */
export function AsyncButton({
  run,
  children,
  busyLabel,
  doneLabel = 'done',
  failLabel = 'failed',
  failed = false,
  showElapsed = false,
  disabled = false,
  tone = 'primary',
  className,
}: {
  run: () => Promise<unknown>;
  children: ReactNode;
  busyLabel?: ReactNode;
  doneLabel?: ReactNode;
  failLabel?: ReactNode;
  failed?: boolean;
  showElapsed?: boolean;
  disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'ghost';
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [since, setSince] = useState(0);
  const [, tick] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (phase === 'busy' && showElapsed) {
      timer.current = setInterval(() => tick((n) => n + 1), 1000);
      return () => {
        if (timer.current) clearInterval(timer.current);
      };
    }
  }, [phase, showElapsed]);
  const onClick = async () => {
    if (disabled || phase !== 'idle') return;
    setPhase('busy');
    setSince(Date.now());
    try {
      await run();
    } finally {
      setPhase('done');
      setTimeout(() => setPhase('idle'), 1400);
    }
  };
  const elapsed = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const dark = tone === 'primary';
  return (
    <Pressable
      tone={tone}
      onClick={onClick}
      className={`${disabled ? 'disabled:opacity-30' : ''} ${className ?? ''}`}
      disabled={disabled}
      aria-busy={phase === 'busy'}
    >
      {phase === 'idle' && children}
      {phase === 'busy' && (
        <>
          <span
            className="inline-block h-[10px] w-[10px] animate-[om-spin_.8s_linear_infinite] rounded-full border-[1.5px]"
            style={{ borderColor: dark ? 'var(--accent-ink)' : 'var(--ok)', borderRightColor: 'transparent' }}
          />
          {busyLabel}
          {showElapsed && <span className="tabular-nums">{elapsed}s</span>}
        </>
      )}
      {phase === 'done' && (
        <>
          <span className="pop" style={{ color: failed ? 'var(--err)' : dark ? undefined : 'var(--ok)' }}>
            {failed ? '✗' : '✓'}
          </span>
          {failed ? failLabel : doneLabel}
        </>
      )}
    </Pressable>
  );
}
