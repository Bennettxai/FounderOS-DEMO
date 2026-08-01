'use client';

import { useState } from 'react';

type Hit = { title: string; snippet: string; source: string };
type QueryState =
  | { phase: 'idle' }
  | { phase: 'busy'; query: string }
  | { phase: 'done'; query: string; hits: Hit[] }
  | { phase: 'error'; query: string; message: string };

/** Live `gbrain ›` prompt — hits GET /api/brain?q= (hybrid search, local fallback). */
export function BrainQuery({ fallbackActive }: { fallbackActive: boolean }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState<QueryState>({ phase: 'idle' });

  async function run() {
    const query = q.trim();
    if (!query || state.phase === 'busy') return;
    setState({ phase: 'busy', query });
    try {
      const res = await fetch(`/api/brain?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { results: Hit[] };
      setState({ phase: 'done', query, hits: body.results });
      setQ('');
    } catch (err) {
      setState({ phase: 'error', query, message: err instanceof Error ? err.message : String(err) });
    }
  }

  const statusLine =
    state.phase === 'busy'
      ? 'querying — hybrid (local + zeroentropy)…'
      : state.phase === 'done'
        ? `${state.hits.length} hits · "${state.query}"${fallbackActive ? ' · local fallback (supabase paused)' : ''}`
        : state.phase === 'error'
          ? `query failed · ${state.message}`
          : 'press ↵ to query the second brain';

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
                <span className="shrink-0 font-mono text-[10px] text-os-accent">{hit.source}</span>
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
