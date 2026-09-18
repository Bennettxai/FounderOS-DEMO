'use client';

import { useEffect, useState } from 'react';

/**
 * The Claude-Code-style liveness readout: a plain "waiting" state reads as
 * dead, so this adds a braille spinner, a cycling status verb with a shimmer sweep,
 * and the elapsed seconds — shown wherever an agent run is out and the reply
 * has not landed yet. One component, every chat surface.
 */
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const VERBS = [
  'Synthesizing',
  'Orchestrating',
  'Consulting the board',
  'Delegating',
  'Reasoning',
  'Wiring context',
  'Composing',
];

/**
 * Short verbs for the `compact` variant. A seat chip is ~5 columns wide, so
 * "Consulting the board" would truncate to noise; these always fit.
 */
const SHORT_VERBS = ['Running', 'Thinking', 'Working', 'Reasoning', 'Acting'];

export function Synthesizing({
  since,
  label,
  compact = false,
  dock = false,
}: {
  since?: number;
  label?: string;
  /** Chip-sized: smaller type, tighter gap, short verbs. Used on seat chips. */
  compact?: boolean;
  /** Conductor-dock variant: a blinking square and one lowercase word. */
  dock?: boolean;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);
  const frame = FRAMES[tick % FRAMES.length];
  // ~2.4s per verb so it reads as activity, not a strobe
  const pool = compact ? SHORT_VERBS : VERBS;
  const verb = label ?? pool[Math.floor(tick / 24) % pool.length];
  const secs = since ? Math.max(0, Math.floor((Date.now() - since) / 1000)) : null;
  // The dock is 380px of vertical column: a cycling verb next to a spinner
  // reads as clutter there, so it gets the cursor square and one steady word.
  if (dock) {
    return (
      <span className="inline-flex items-center gap-2 font-mono text-[10px]" data-synthesizing>
        <span
          aria-hidden
          className="h-[6px] w-[6px] shrink-0 bg-os-text"
          style={{ animation: 'om-blink 1s steps(1) infinite' }}
        />
        <span className="synth-shimmer truncate">
          synthesizing{secs !== null ? ` · ${secs}s` : ''}
        </span>
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-baseline font-mono ${compact ? 'gap-1 text-[9px]' : 'gap-2 text-[11px]'}`}
      data-synthesizing
    >
      <span className="text-os-accent">{frame}</span>
      <span className="synth-shimmer truncate">{verb}…</span>
      {secs !== null && <span className="shrink-0 text-os-dim">{secs}s</span>}
    </span>
  );
}
