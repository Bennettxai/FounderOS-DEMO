'use client';

/**
 * G-Brain satellites (Slab import): the small panels that
 * float around the Slab radial, placed around the operator's graph without
 * touching the graph itself. Top-right: identity block and page counter.
 * Top-left: the ask bar, whose answer drops in as a retrieval notice.
 * Bottom-right: the footer ticker. Everything shares the graph's own tab
 * recipe (its Fullscreen control) so the frame reads as one family.
 *
 * Positions avoid every overlay the graph already owns (its top-left
 * controls, top-center title, top-right fullscreen pill, bottom-left node
 * card, bottom-center pillar stepper) and the directory aside on the right
 * (18rem plus the gap on lg screens). Everything rides the colorway; the
 * panels rise in on the slab stagger.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import type { BrainSatelliteData } from '@/lib/brain-satellites';

type Hit = { title: string; snippet: string; source: string };
type Phase = 'idle' | 'retrieve' | 'answer';

const GLASS: CSSProperties = {
  background: 'color-mix(in oklab, var(--bg) 84%, transparent)',
  borderColor: 'var(--border-strong)',
  backdropFilter: 'blur(10px)',
};

/** The graph's own tab recipe (its Fullscreen control), so the row reads as one family. */
const CHIP = 'inline-flex items-center gap-1.5 rounded-sm-t border border-os-border-strong bg-os-bg/80 px-2 py-1 font-mono text-[10.5px] text-os-muted backdrop-blur';

const risePos = (i: number, extra: CSSProperties = {}): CSSProperties => ({ ...extra, '--rise-i': i } as CSSProperties);

export function BrainSatellites() {
  const [data, setData] = useState<BrainSatelliteData | null>(null);
  const [q, setQ] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [hits, setHits] = useState<Hit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = useRef<HTMLDivElement>(null);
  /** Tapped into the graph (a department focused, a node card open): the
   *  satellites fade out so nothing overlays the text the operator is reading.
   *  Read off the graph's own DOM (its Back tab and its detail panel) through a
   *  MutationObserver, so the graph itself stays untouched. */
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    const frame = box.current?.parentElement;
    if (!frame) return;
    const check = () => setQuiet(Boolean(frame.querySelector('[aria-label="Back to the home view"], .kg-panel')));
    check();
    const obs = new MutationObserver(check);
    obs.observe(frame, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/api/brain/satellites')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setData(d as BrainSatelliteData);
      })
      .catch(() => {
        /* the panels stay quiet rather than fabricate */
      });
    return () => {
      alive = false;
    };
  }, []);

  const ask = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const query = q.trim();
      if (query.length < 2) return;
      setPhase('retrieve');
      setError(null);
      try {
        const r = await fetch(`/api/brain?q=${encodeURIComponent(query)}`);
        const json = (await r.json()) as { results?: Hit[] };
        setHits(json.results ?? []);
        setPhase('answer');
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setPhase('idle'), 14_000);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('idle');
      }
    },
    [q],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const mounted = data?.mounted ?? false;
  const statusWord = phase === 'retrieve' ? 'retrieving' : phase === 'answer' ? 'answered' : mounted ? 'ready' : data ? 'not mounted' : 'loading';
  const answer = hits[0]?.snippet ?? (phase === 'answer' ? 'Nothing in the store answers that.' : '');

  return (
    <>
      {/* the overlay box: the canvas only. Below the view-tabs row (47px, measured
          against the graph's own Fullscreen tab so the two rows sit level) and,
          on lg, left of the directory aside (18rem + the 0.75rem gap). Every
          satellite is positioned inside it, so none can cover the aside or
          the pillar chips. */}
      <div
        ref={box}
        data-quiet={quiet || undefined}
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[47px] z-20 lg:right-[18.75rem]"
        style={{ opacity: quiet ? 0 : 1, transition: 'opacity var(--dur-panel) var(--ease)' }}
      >

      {/* identity + counter: one row of chips in the graph's own tab style, beside its Fullscreen tab */}
      <div className="rise pointer-events-none absolute right-[124px] top-3 z-20 flex items-center gap-1.5" style={risePos(1)}>
        <span className={CHIP} title={data?.statusLine ?? 'reading the store'}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: mounted ? 'var(--accent)' : 'var(--warn)' }} />
          G-Brain
          <span className="text-os-dim">{data ? (mounted ? 'connected' : 'not mounted') : 'reading'}</span>
        </span>
        {data && mounted && (
          <>
            <span className={CHIP}>
              <span className="tabular-nums text-os-text">{data.pages.toLocaleString('en-US')}</span>
              <span className="text-os-dim">pages</span>
            </span>
            <span className={CHIP}>
              <span className="tabular-nums text-os-text">{data.folders}</span>
              <span className="text-os-dim">folders</span>
            </span>
          </>
        )}
      </div>

      {/* ask bar, top left of the canvas (the operator) */}
      <form onSubmit={ask} className={`rise absolute left-3 top-3 z-20 w-[340px] max-w-[60%] ${quiet ? 'pointer-events-none' : 'pointer-events-auto'}`} style={risePos(2)}>
        <div
          className="flex items-center gap-2 rounded-sm-t border px-2.5 py-1"
          style={{
            ...GLASS,
            borderColor: phase === 'retrieve' ? 'color-mix(in oklab, var(--accent) 55%, transparent)' : GLASS.borderColor,
            boxShadow: phase === 'retrieve' ? '0 0 32px color-mix(in oklab, var(--accent) 14%, transparent)' : '0 8px 30px rgba(0,0,0,0.35)',
          }}
        >
          <span className="shrink-0 font-mono text-[10.5px] text-os-accent">g-brain ›</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={data !== null && !mounted}
            placeholder={mounted || !data ? 'ask the brain' : 'brain-store not mounted'}
            spellCheck={false}
            className="min-h-[16px] w-full flex-1 border-0 bg-transparent font-mono text-[10.5px] text-os-text outline-none placeholder:text-os-dim"
            style={{ caretColor: 'var(--accent)' }}
            aria-label="Ask the brain"
          />
          <span className="shrink-0 font-mono text-[9.5px] text-os-dim">{statusWord}</span>
        </div>

        {/* retrieval notice: drops in under the bar while an answer is showing */}
        <div
          className="mt-1.5 rounded-sm-t border px-2.5 py-1.5"
          style={{
            ...GLASS,
            borderColor: phase === 'answer' ? 'color-mix(in oklab, var(--accent) 45%, transparent)' : GLASS.borderColor,
            boxShadow: '0 22px 56px -10px rgba(0,0,0,0.6)',
            opacity: phase === 'answer' || error ? 1 : 0,
            transform: phase === 'answer' || error ? 'translateY(0)' : 'translateY(-6px)',
            transition: 'opacity var(--dur-panel) var(--ease), transform var(--dur-panel) var(--ease)',
            pointerEvents: phase === 'answer' || error ? 'auto' : 'none',
          }}
          aria-live="polite"
        >
          {error ? (
            <div className="font-mono text-[10px] text-os-err">{error}</div>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full bg-os-accent" />
                <span className="shrink-0 font-mono text-[10px] text-os-muted">{hits.length > 0 ? `retrieved from ${hits.length} notes` : 'retrieval'}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-os-text">{answer}</span>
              </div>
              {hits.length > 0 && (
                <div className="mt-1 flex gap-1 overflow-hidden pl-[14px]">
                  {hits.slice(0, 3).map((h) => (
                    <span key={`${h.source}-${h.title}`} className="shrink-0 truncate rounded-[5px] border px-1.5 py-0.5 font-mono text-[9px] text-os-muted" style={{ borderColor: 'color-mix(in oklab, var(--text) 14%, transparent)' }}>
                      {h.title || h.source}
                    </span>
                  ))}
                  {hits.length > 3 && <span className="shrink-0 self-center font-mono text-[9px] text-os-dim">+{hits.length - 3}</span>}
                </div>
              )}
            </>
          )}
        </div>
      </form>

      {/* footer ticker, bottom right of the canvas */}
      <div className="pointer-events-none absolute bottom-2 right-7 z-20 font-mono text-[9px] text-os-dim">live retrieval</div>
      </div>
    </>
  );
}
