'use client';

import { useState } from 'react';

type Hit = { title: string; snippet: string; source: string };
type QueryState =
  | { phase: 'idle' }
  | { phase: 'busy'; query: string }
  | { phase: 'done'; query: string; hits: Hit[] }
  | { phase: 'error'; query: string; message: string };

/** The nikos provider's brain sources, with friendly labels for the UI. */
const SOURCES: { id: string; label: string }[] = [
  { id: 'canonical-maps', label: 'canonical' },
  { id: 'diagmap-docs', label: 'diagmap docs' },
  { id: 'knowledge-graph', label: 'graph' },
  { id: 'hermes-skills', label: 'hermes skills' },
  { id: 'hermes-refs', label: 'hermes refs' },
  { id: 'brainz-contracts', label: 'brainz contracts' },
];

const SOURCE_LABEL: Record<string, string> = Object.fromEntries(SOURCES.map((s) => [s.id, s.label]));

/** Per-source badge styling (theme tokens; color means source family). */
const SOURCE_BADGE: Record<string, string> = {
  'canonical-maps': 'border-os-accent/40 text-os-accent',
  'diagmap-docs': 'border-os-accent/40 text-os-accent',
  'knowledge-graph': 'border-os-border-strong text-os-dim',
  'hermes-skills': 'border-os-warn/40 text-os-warn',
  'hermes-refs': 'border-os-warn/40 text-os-warn',
  'brainz-contracts': 'border-os-border-strong text-os-muted',
};

/** Live `gbrain ›` prompt — hits GET /api/brain?q= (hybrid search, local fallback). */
export function BrainQuery({ fallbackActive }: { fallbackActive: boolean }) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, setState] = useState<QueryState>({ phase: 'idle' });

  function toggleSource(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run() {
    const query = q.trim();
    if (!query || state.phase === 'busy') return;
    setState({ phase: 'busy', query });
    try {
      const params = new URLSearchParams({ q: query });
      if (selected.size > 0) params.set('sources', [...selected].join(','));
      const res = await fetch(`/api/brain?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { results: Hit[] };
      setState({ phase: 'done', query, hits: body.results });
      setQ('');
    } catch (err) {
      setState({ phase: 'error', query, message: err instanceof Error ? err.message : String(err) });
    }
  }

  const scopeLabel =
    selected.size > 0 ? [...selected].map((s) => SOURCE_LABEL[s] ?? s).join(' + ') : 'all sources';

  const statusLine =
    state.phase === 'busy'
      ? `querying ${scopeLabel}…`
      : state.phase === 'done'
        ? `${state.hits.length} hits · "${state.query}" · ${scopeLabel}${fallbackActive ? ' · local fallback (supabase paused)' : ''}`
        : state.phase === 'error'
          ? `query failed · ${state.message}`
          : `press ↵ to query the second brain · ${scopeLabel}`;

  return (
    <div className="flex min-h-[220px] flex-1 flex-col rounded-lg-t border border-os-border bg-os-surface p-1">
      <div className="flex items-center gap-[9px] border-b border-os-border px-3.5 py-[11px] font-mono text-xs">
        <span className="font-bold text-os-accent">gbrain ›</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          // the pop-out's whole point is the prompt — land the caret in it
          autoFocus
          placeholder="query the second brain…"
          className="flex-1 bg-transparent font-mono text-xs text-os-text outline-none placeholder:text-os-dim"
        />
        <kbd className="rounded-sm-t border border-os-border-strong border-b-2 bg-os-surface px-1.5 py-0.5 font-mono text-[10px] text-os-muted">
          ↵
        </kbd>
      </div>

      {/* Per-source filter — toggle one or more brain sources (none = all). */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-os-border px-3.5 py-2">
        <button
          type="button"
          onClick={() => setSelected(new Set())}
          className={`rounded-full border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] transition-colors ${
            selected.size === 0
              ? 'border-os-accent/60 bg-os-accent/10 text-os-accent'
              : 'border-os-border-strong bg-os-surface text-os-muted hover:text-os-text'
          }`}
        >
          all
        </button>
        {SOURCES.map((s) => {
          const active = selected.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleSource(s.id)}
              aria-pressed={active}
              className={`rounded-full border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] transition-colors ${
                active
                  ? 'border-os-accent/60 bg-os-accent/10 text-os-accent'
                  : 'border-os-border-strong bg-os-surface text-os-muted hover:text-os-text'
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1 overflow-y-auto p-2">
        <div className={`px-[11px] py-1.5 font-mono text-[10px] tracking-[0.08em] ${state.phase === 'error' ? 'text-os-err' : 'text-os-dim'}`}>
          {statusLine}
        </div>
        {state.phase === 'done' &&
          state.hits.map((hit) => (
            <div key={hit.title} className="rounded-sm-t px-[11px] py-[9px] transition-colors hover:bg-os-surface2">
              <div className="flex items-baseline gap-2 font-mono text-[11.5px] text-os-text">
                <span className="text-os-accent">▸</span>
                <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                <span
                  className={`shrink-0 rounded-full border px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.08em] ${
                    SOURCE_BADGE[hit.source] ?? 'border-os-border-strong text-os-dim'
                  }`}
                >
                  {SOURCE_LABEL[hit.source] ?? hit.source}
                </span>
              </div>
              <div className="mt-[3px] text-[11px] leading-relaxed text-os-dim">{hit.snippet}</div>
            </div>
          ))}
        {state.phase === 'done' && state.hits.length === 0 && (
          <div className="px-[11px] py-2 text-[11px] text-os-dim">
            nothing matched — try a broader phrase, or check the store with <code className="font-mono">gbrain doctor</code>
          </div>
        )}
      </div>
    </div>
  );
}