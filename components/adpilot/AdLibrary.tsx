'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bookmark,
  ChevronDown,
  Library as LibraryBig,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import type { WallAd } from '@/lib/foreplay/wall';
import type { WatchEntry } from '@/lib/foreplay/watchlist';
import type { SavedAd } from '@/lib/foreplay/saved';
import type { Signal } from '@/lib/foreplay/signals';
import { forYou } from '@/lib/foreplay/personal';

/**
 * The Ad library: ONE bounded module (viewport-height, internal scroll;
 * the page ends cleanly after it). Tabs: For you (personalized, honest,
 * labeled ranking) · Search (concept mining) · Saved (the swipe file) ·
 * Watchlist · Activity (the wire, in plain English). Ask Adscout is the
 * prompt bar pinned at the top. Every surface wears the red glass
 * (.ap-panel): no teal tint on this page.
 */

type Props = {
  initialWall: WallAd[];
  watchlist: WatchEntry[];
  saved: SavedAd[];
  signals: Signal[];
  credits: { remaining: number; total: number } | null;
  lastSyncAt: string | null;
};

type Tab = 'foryou' | 'search' | 'saved' | 'watchlist' | 'activity';

const nf = new Intl.NumberFormat('en-US');

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 36) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export function AdLibrary({ initialWall, watchlist: initialWatch, saved: initialSaved, signals, credits, lastSyncAt }: Props) {
  const [tab, setTab] = useState<Tab>('foryou');
  const [watchlist, setWatchlist] = useState(initialWatch);
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<WallAd | null>(null);
  const [mineResults, setMineResults] = useState<WallAd[] | null>(null);
  const [libOpen, setLibOpen] = useState(false);

  const savedIds = useMemo(() => new Set(saved.map((s) => s.ad.id)), [saved]);
  const savedAds = useMemo(() => saved.map((s) => s.ad), [saved]);

  // For-you: watchlist store + saved snapshots + last mine results, scored
  // against niche keywords, longevity, and the taste of what the operator saved.
  const feed = useMemo(() => {
    const pool = new Map<string, WallAd>();
    for (const ad of initialWall) pool.set(ad.id, ad);
    for (const ad of mineResults ?? []) pool.set(ad.id, ad);
    return forYou([...pool.values()], savedAds).slice(0, 30);
  }, [initialWall, mineResults, savedAds]);

  const toggleSave = async (ad: WallAd) => {
    const isSaved = savedIds.has(ad.id);
    const res = await fetch('/api/adscout/saved', {
      method: isSaved ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isSaved ? { adId: ad.id } : ad),
    });
    const body = await res.json();
    if (res.ok && body.ok) setSaved(body.saved);
  };

  const runSync = async () => {
    setBusy('sync');
    setNotice(null);
    try {
      const res = await fetch('/api/adscout/sync', { method: 'POST' });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setNotice(`Refreshed: ${body.brands} brands · ${body.signals.length} new signals`);
      window.location.reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'refresh failed');
      setBusy(null);
    }
  };

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'foryou', label: 'For you' },
    { key: 'search', label: 'Search' },
    { key: 'saved', label: 'Saved', count: saved.length },
    { key: 'watchlist', label: 'Watchlist', count: watchlist.length },
    { key: 'activity', label: 'Activity', count: signals.length },
  ];

  return (
    <div>
      {/* Ask Adscout: the centerpiece: frosted glass with the orbiting glow */}
      <AskWidget wall={initialWall} onOpen={setSelected} />

      {/* The band: one loud element, two quiet ones */}
      <div className="mt-6 grid gap-4 lg:grid-cols-12">
        <button
          type="button"
          onClick={() => setLibOpen((v) => !v)}
          className="pressable ap-bright flex items-center justify-between p-5 text-left transition-transform hover:-translate-y-px lg:col-span-5"
        >
          <span>
            <span className="flex items-center gap-2 text-[16px] font-medium text-white">
              <LibraryBig className="h-5 w-5" strokeWidth={1.7} />
              {libOpen ? 'Close ad library' : 'Open ad library'}
            </span>
            <span className="mt-1 block text-[12.5px] text-white/75">
              {nf.format(initialWall.length)} tracked ads · {saved.length} saved · search by concept, save winners, remake
            </span>
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 text-white/85 transition-transform ${libOpen ? 'rotate-180' : ''}`} strokeWidth={1.9} />
        </button>
        <div className="ap-panel p-5 lg:col-span-4">
          <div className="text-[12.5px] text-os-dim">API credits</div>
          <div className="mt-1 text-[25px] font-light tabular-nums text-os-text">
            {credits ? (
              <>
                {nf.format(credits.remaining)} <span className="text-[14px] text-os-dim">/ {nf.format(credits.total)}</span>
              </>
            ) : (
              'not connected'
            )}
          </div>
          <div className="mt-2.5 flex gap-[3px]">
            {Array.from({ length: 20 }, (_, i) => (
              <span
                key={i}
                className="h-[10px] flex-1 rounded-[2px]"
                style={{
                  background:
                    credits && i < Math.round((credits.remaining / credits.total) * 20)
                      ? 'rgba(255,69,87,0.85)'
                      : 'rgba(255,255,255,0.07)',
                }}
              />
            ))}
          </div>
        </div>
        <div className="ap-panel flex flex-col justify-center p-5 lg:col-span-3">
          <button type="button" onClick={runSync} disabled={busy === 'sync'} className="pressable c-btn c-btn-primary flex items-center justify-center gap-2 py-2.5 text-[13px]">
            {busy === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.7} /> : <RefreshCw className="h-4 w-4" strokeWidth={1.7} />}
            Refresh data
          </button>
          <div className="mt-2 text-center text-[12px] text-os-dim">{notice ?? `last synced ${ago(lastSyncAt)}`}</div>
        </div>
      </div>

      {libOpen && (
        <div className="ap-panel mt-4 flex h-[80vh] flex-col overflow-hidden">
      {/* Tab rail */}
      <div className="flex gap-1 border-b border-[rgba(255,69,87,0.14)] px-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`pressable flex items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-[12.5px] ${
              tab === t.key ? 'border-[var(--accent)] text-os-text' : 'border-transparent text-os-dim hover:text-os-muted'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="text-[10.5px] tabular-nums text-os-dim">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content: internal scroll; the page never sprawls */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'foryou' && (
          <>
            <CardGrid ads={feed.map((f) => f.ad)} savedIds={savedIds} onOpen={setSelected} onSave={toggleSave} />
            <p className="mt-3 text-center text-[11px] text-os-dim">
              ranked by fit to your niche + your saves + proven longevity: saves teach this feed
            </p>
          </>
        )}
        {tab === 'search' && (
          <SearchTab savedIds={savedIds} onOpen={setSelected} onSave={toggleSave} onResults={setMineResults} />
        )}
        {tab === 'saved' &&
          (saved.length === 0 ? (
            <Empty line1="Nothing saved yet." line2="The bookmark on any ad saves it here: and teaches the For-you feed." />
          ) : (
            <CardGrid ads={savedAds} savedIds={savedIds} onOpen={setSelected} onSave={toggleSave} />
          ))}
        {tab === 'watchlist' && (
          <WatchlistTab watchlist={watchlist} wall={initialWall} setWatchlist={setWatchlist} busy={busy} setBusy={setBusy} setNotice={setNotice} />
        )}
        {tab === 'activity' && <ActivityTab signals={signals} wall={initialWall} onOpen={setSelected} />}
      </div>

        </div>
      )}

      {selected && (
        <Dossier
          ad={selected}
          isSaved={savedIds.has(selected.id)}
          onClose={() => setSelected(null)}
          onSave={toggleSave}
          onWatch={async (ad) => {
            if (!ad.brandId) return;
            const res = await fetch('/api/adscout/watchlist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ brandId: ad.brandId, name: ad.brand, avatar: ad.thumbnail }),
            });
            const body = await res.json();
            if (res.ok && body.ok) {
              setWatchlist(body.watchlist);
              setNotice(`Watching ${ad.brand}`);
            }
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------- Ask widget ------------------------------- */

/** Keyword-overlap match: the ads the answer is most plausibly about. */
function relatedAds(text: string, wall: WallAd[]): WallAd[] {
  const words = new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9$]+/)
      .filter((w) => w.length > 3),
  );
  return wall
    .map((ad) => {
      const hay = `${ad.hook ?? ''} ${ad.brand}`.toLowerCase().split(/[^a-z0-9$]+/);
      let score = 0;
      for (const w of hay) if (words.has(w)) score += 1;
      return { ad, score: score + (ad.live ? 0.5 : 0) + Math.min(ad.daysRunning / 200, 0.5) };
    })
    .filter((r) => r.score >= 1.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => r.ad);
}

function AskWidget({ wall, onOpen }: { wall: WallAd[]; onOpen: (ad: WallAd) => void }) {
  const [question, setQuestion] = useState('');
  const [state, setState] = useState<{ phase: 'idle' | 'running' | 'done' | 'error'; text?: string }>({ phase: 'idle' });
  const examples = useMemo(
    () => (state.phase === 'done' && state.text ? relatedAds(`${question} ${state.text}`, wall) : []),
    [state, question, wall],
  );

  const ask = async () => {
    const q = question.trim();
    if (q.length < 3 || state.phase === 'running') return;
    setState({ phase: 'running' });
    try {
      const res = await fetch('/api/adscout/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setState({ phase: 'done', text: body.answer });
    } catch (err) {
      setState({ phase: 'error', text: err instanceof Error ? err.message : 'ask failed' });
    }
  };

  return (
    <div className="relative mx-auto max-w-3xl overflow-hidden rounded-[20px] border border-[rgba(255,120,132,0.28)]">
      {/* the light circling behind the glass */}
      <div className="ap-orbit" aria-hidden />
      <div className="absolute inset-0 bg-[#0a0608]/60 backdrop-blur-2xl" aria-hidden />
      <div className="relative px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-[14px] font-medium text-[var(--accent-2)]">Ask Adscout</span>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask()}
            placeholder="what's working in my niche right now?"
            className="min-w-0 flex-1 bg-transparent text-[14.5px] text-os-text outline-none placeholder:text-os-dim"
          />
          <button type="button" onClick={ask} disabled={state.phase === 'running'} aria-label="ask Adscout" className="pressable c-btn px-3 py-2">
            {state.phase === 'running' ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.7} /> : <Send className="h-4 w-4" strokeWidth={1.7} />}
          </button>
        </div>

        {/* the widget grows downward for the answer */}
        {state.phase === 'running' && (
          <p className="mt-3 text-[13px] text-os-muted">Checking the library: hooks, longevity, drivers, signals…</p>
        )}
        {state.phase === 'error' && <p className="mt-3 text-[13px] text-[#ff8790]">{state.text}</p>}
        {state.phase === 'done' && (
          <div className="mt-4 border-t border-[rgba(255,120,132,0.16)] pt-4">
            <div className="flex items-start gap-3">
              <p className="flex-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-os-text">{state.text}</p>
              <button
                type="button"
                onClick={() => setState({ phase: 'idle' })}
                aria-label="dismiss answer"
                className="pressable shrink-0 text-os-dim hover:text-os-text"
              >
                <X className="h-4 w-4" strokeWidth={1.7} />
              </button>
            </div>
            {examples.length > 0 && (
              <div className="mt-4">
                <div className="text-[12px] text-os-dim">From the library</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {examples.map((ad) => (
                    <button
                      key={ad.id}
                      type="button"
                      onClick={() => onOpen(ad)}
                      className="pressable flex items-center gap-2.5 rounded-[10px] border border-[rgba(255,120,132,0.18)] bg-black/35 p-2 text-left hover:bg-black/55"
                    >
                      {ad.thumbnail || ad.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ad.thumbnail ?? ad.image ?? ''} alt="" className="h-11 w-14 shrink-0 rounded-[7px] object-cover" />
                      ) : (
                        <span className="flex h-11 w-14 shrink-0 items-center justify-center rounded-[7px] bg-black/50 text-[10px] text-os-dim">
                          {ad.format ?? 'ad'}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] text-os-text">{ad.brand}</span>
                        <span className="block text-[11px] tabular-nums text-os-dim">
                          {ad.daysRunning}d {ad.live ? 'live' : 'off'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- card grid ------------------------------- */

function CardGrid({
  ads,
  savedIds,
  onOpen,
  onSave,
}: {
  ads: WallAd[];
  savedIds: Set<string>;
  onOpen: (ad: WallAd) => void;
  onSave: (ad: WallAd) => void;
}) {
  // The 2x2 lead slot needs imagery: promote the first ad with a still.
  const display = useMemo(() => {
    const i = ads.findIndex((a) => a.thumbnail || a.image);
    if (i <= 0) return ads;
    return [ads[i], ...ads.slice(0, i), ...ads.slice(i + 1)];
  }, [ads]);

  if (display.length === 0) {
    return <Empty line1="Nothing here yet." line2="Add brands to the watchlist or run a search: the library builds itself." />;
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {display.map((ad, i) => (
        <div key={ad.id} className={`group relative ${i === 0 ? 'col-span-2 row-span-2' : ''}`}>
          <button
            type="button"
            onClick={() => onOpen(ad)}
            className="pressable pressable is-row block w-full overflow-hidden rounded-[12px] border border-[rgba(255,69,87,0.13)] bg-[#0a0608] text-left"
          >
            <div className={`relative w-full ${i === 0 ? 'aspect-[4/3.05]' : 'aspect-[4/3]'} bg-[#0a0d0f]`}>
              {ad.thumbnail || ad.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ad.thumbnail ?? ad.image ?? ''}
                  alt={`${ad.brand} ad creative`}
                  className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full items-center justify-center font-mono text-[11px] text-os-dim">{ad.format ?? 'ad'}</div>
              )}
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#04070ae8] to-transparent" />
              <div className="absolute bottom-2 left-2.5 right-2.5 flex items-end justify-between gap-2">
                <span className="truncate text-[11.5px] text-os-muted">{ad.brand}</span>
                <span className="flex shrink-0 items-baseline gap-1">
                  <span className={`text-[19px] font-light tabular-nums ${ad.live ? 'text-[var(--accent)]' : 'text-os-dim'}`}>
                    {ad.daysRunning}
                  </span>
                  <span className="text-[10px] text-os-dim">days</span>
                </span>
              </div>
              {ad.live && <span className="absolute left-2 top-2 h-2 w-2 rounded-full bg-[var(--accent)]" />}
            </div>
            {ad.hook && (
              <p className={`px-2.5 py-2 text-[12px] leading-snug text-os-muted ${i === 0 ? 'line-clamp-3' : 'line-clamp-2'}`}>
                “{ad.hook}”
              </p>
            )}
          </button>
          {/* Save toggle: the swipe-file affordance on every card */}
          <button
            type="button"
            aria-label={savedIds.has(ad.id) ? 'unsave ad' : 'save ad'}
            onClick={(e) => {
              e.stopPropagation();
              onSave(ad);
            }}
            className={`pressable absolute right-2 top-2 rounded-full border p-1.5 backdrop-blur ${
              savedIds.has(ad.id)
                ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[rgba(255,255,255,0.14)] bg-black/45 text-os-muted opacity-0 hover:text-os-text group-hover:opacity-100'
            }`}
          >
            <Bookmark className="h-3.5 w-3.5" strokeWidth={1.7} fill={savedIds.has(ad.id) ? 'currentColor' : 'none'} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Empty({ line1, line2 }: { line1: string; line2: string }) {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
      <p className="text-[13px] text-os-muted">{line1}</p>
      <p className="mt-1 max-w-md text-[12px] text-os-dim">{line2}</p>
    </div>
  );
}

/* --------------------------------- search --------------------------------- */

function SearchTab({
  savedIds,
  onOpen,
  onSave,
  onResults,
}: {
  savedIds: Set<string>;
  onOpen: (ad: WallAd) => void;
  onSave: (ad: WallAd) => void;
  onResults: (ads: WallAd[]) => void;
}) {
  const [concept, setConcept] = useState('');
  const [minDays, setMinDays] = useState(21);
  const [format, setFormat] = useState<'all' | 'video' | 'image'>('all');
  const [state, setState] = useState<
    | { phase: 'idle' }
    | { phase: 'running' }
    | { phase: 'done'; probes: { query: string; results: number }[]; pooled: number; apiCalls: number; winners: WallAd[] }
    | { phase: 'error'; message: string }
  >({ phase: 'idle' });

  const run = async () => {
    const q = concept.trim();
    if (q.length < 3 || state.phase === 'running') return;
    setState({ phase: 'running' });
    try {
      const res = await fetch('/api/adscout/mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept: q, minDays, ...(format !== 'all' ? { format } : {}) }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setState({ phase: 'done', probes: body.probes, pooled: body.pooled, apiCalls: body.apiCalls, winners: body.winners });
      onResults(body.winners);
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : 'search failed' });
    }
  };

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={`pressable rounded-full border px-2.5 py-1 text-[11.5px] ${
        active ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-[rgba(255,69,87,0.14)] text-os-dim hover:text-os-muted'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <label className="block text-[12.5px] text-os-muted" htmlFor="ap-concept">
        Describe a concept: probes expand it, the database answers with proven ads
      </label>
      <div className="ap-glow mt-2 flex items-center gap-2 rounded-[12px] border border-[rgba(255,69,87,0.3)] bg-black/45 p-1.5">
        <Search className="ml-2 h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={1.7} />
        <input
          id="ap-concept"
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="founders replacing staff with AI agents"
          className="min-w-0 flex-1 bg-transparent px-1 py-2 text-[14px] text-os-text outline-none placeholder:text-os-dim"
        />
        <button type="button" onClick={run} disabled={state.phase === 'running' || concept.trim().length < 3} className="pressable c-btn c-btn-primary flex items-center gap-1.5 text-[12.5px]">
          {state.phase === 'running' ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.7} /> : <Search className="h-4 w-4" strokeWidth={1.7} />}
          Search ads
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] text-os-dim">Proven for</span>
        {[21, 30, 60].map((d) => chip(minDays === d, `${d}+ days`, () => setMinDays(d)))}
        <span className="ml-3 mr-1 text-[11px] text-os-dim">Format</span>
        {(['all', 'video', 'image'] as const).map((f) => chip(format === f, f, () => setFormat(f)))}
        <span className="ml-auto text-[11px] text-os-dim">~5 API credits per search</span>
      </div>

      <div className="mt-4">
        {state.phase === 'idle' && (
          <Empty line1="Search the 100M-ad database by idea, not by brand." line2="Results are filtered to ads still paying off after your chosen threshold: the honest proof filter." />
        )}
        {state.phase === 'running' && (
          <p className="py-8 text-center text-[12.5px] text-os-dim">expanding concept → probing discovery → filtering to proven ads…</p>
        )}
        {state.phase === 'error' && <p className="py-8 text-center text-[12px] text-[#f04e52]">{state.message}</p>}
        {state.phase === 'done' && (
          <>
            <div className="mb-3 text-[11.5px] leading-relaxed text-os-dim">
              {state.probes.map((p) => (
                <span key={p.query} className="mr-3">
                  “{p.query}” → {p.results}
                </span>
              ))}
              <span className="text-os-muted">
                · {state.pooled} pooled · {state.apiCalls} credits
              </span>
            </div>
            <CardGrid ads={state.winners} savedIds={savedIds} onOpen={onOpen} onSave={onSave} />
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- watchlist -------------------------------- */

function WatchlistTab({
  watchlist,
  wall,
  setWatchlist,
  busy,
  setBusy,
  setNotice,
}: {
  watchlist: WatchEntry[];
  wall: WallAd[];
  setWatchlist: (w: WatchEntry[]) => void;
  busy: string | null;
  setBusy: (b: string | null) => void;
  setNotice: (n: string | null) => void;
}) {
  const [domain, setDomain] = useState('');

  const liveCounts = useMemo(() => {
    const counts = new Map<string, { live: number; top: number }>();
    for (const ad of wall) {
      if (!ad.brandId) continue;
      const cur = counts.get(ad.brandId) ?? { live: 0, top: 0 };
      if (ad.live) cur.live += 1;
      cur.top = Math.max(cur.top, ad.daysRunning);
      counts.set(ad.brandId, cur);
    }
    return counts;
  }, [wall]);

  const add = async () => {
    const d = domain.trim();
    if (!d) return;
    setBusy('add');
    try {
      const res = await fetch('/api/adscout/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: d }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setWatchlist(body.watchlist);
      setDomain('');
      setNotice(`Watching ${body.added.name}: refresh data to pull its ads`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'add failed');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (brandId: string) => {
    const res = await fetch('/api/adscout/watchlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId }),
    });
    const body = await res.json();
    if (res.ok && body.ok) setWatchlist(body.watchlist);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <label className="block text-[12px] text-os-muted" htmlFor="ap-domain">
        Track a brand: enter its website, Adscout finds its ad pages
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id="ap-domain"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="skool.com"
          className="min-w-0 flex-1 rounded-[10px] border border-[rgba(255,69,87,0.18)] bg-black/35 px-3 py-2.5 text-[13px] text-os-text outline-none placeholder:text-os-dim"
        />
        <button type="button" onClick={add} disabled={busy === 'add'} className="pressable c-btn flex items-center gap-1.5 text-[12.5px]">
          {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.7} /> : <Plus className="h-4 w-4" strokeWidth={1.7} />}
          Track brand
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {watchlist.length === 0 && (
          <Empty line1="No brands tracked." line2="Tracked brands get synced daily: new launches, longevity winners, kills, velocity moves." />
        )}
        {watchlist.map((w) => {
          const counts = liveCounts.get(w.id);
          return (
            <div key={w.id} className="flex items-center gap-3 rounded-[12px] border border-[rgba(255,69,87,0.13)] bg-black/25 px-3.5 py-2.5">
              {w.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[12px] text-[var(--accent)]">
                  {w.name.slice(0, 1)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-os-text">{w.name}</div>
                <div className="text-[11px] text-os-dim">{w.domain ?? 'added from a result'}</div>
              </div>
              {counts && (
                <div className="text-right text-[11.5px] tabular-nums text-os-muted">
                  {counts.live} live · longest {counts.top}d
                </div>
              )}
              <button type="button" aria-label={`stop watching ${w.name}`} onClick={() => remove(w.id)} className="pressable c-btn p-1.5">
                <X className="h-3.5 w-3.5" strokeWidth={1.7} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- activity --------------------------------- */

const SIGNAL_META: Record<Signal['type'], { icon: typeof Zap; label: string }> = {
  new_launch: { icon: Zap, label: 'launched' },
  winner: { icon: Trophy, label: 'proven' },
  killed: { icon: XCircle, label: 'killed' },
  velocity_spike: { icon: TrendingUp, label: 'scaling up' },
  velocity_drop: { icon: TrendingDown, label: 'pulling back' },
};

function ActivityTab({ signals, wall, onOpen }: { signals: Signal[]; wall: WallAd[]; onOpen: (ad: WallAd) => void }) {
  const byAd = useMemo(() => new Map(wall.map((a) => [a.id, a])), [wall]);
  const groups = useMemo(() => {
    const map = new Map<string, Signal[]>();
    for (const s of signals) {
      const day = s.at.slice(0, 10);
      map.set(day, [...(map.get(day) ?? []), s]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [signals]);

  if (signals.length === 0) {
    return <Empty line1="Quiet." line2="After each refresh this lists what changed across your watchlist: launches, ads crossing 21/30/60 days, kills, and spend-velocity moves." />;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <p className="text-[12px] text-os-dim">What changed across your watchlist, newest first.</p>
      {groups.map(([day, rows]) => (
        <div key={day}>
          <div className="mb-2 text-[11.5px] text-os-dim">{day}</div>
          <div className="flex flex-col gap-1.5">
            {rows.map((s, i) => {
              const meta = SIGNAL_META[s.type];
              const Icon = meta.icon;
              const ad = s.adId ? byAd.get(s.adId) : undefined;
              return (
                <button
                  key={`${s.at}-${i}`}
                  type="button"
                  disabled={!ad}
                  onClick={() => ad && onOpen(ad)}
                  className={`pressable flex items-center gap-3 rounded-[10px] border border-[rgba(255,69,87,0.1)] bg-black/20 px-3 py-2 text-left ${ad ? 'hover:bg-black/35' : 'cursor-default'}`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${s.type === 'winner' ? 'text-[var(--accent)]' : 'text-os-dim'}`} strokeWidth={1.7} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-os-muted">{s.message}</span>
                  {ad && (ad.thumbnail || ad.image) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ad.thumbnail ?? ad.image ?? ''} alt="" className="h-8 w-11 shrink-0 rounded-[6px] object-cover" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ dossier drawer ----------------------------- */

function Dossier({
  ad,
  isSaved,
  onClose,
  onSave,
  onWatch,
}: {
  ad: WallAd;
  isSaved: boolean;
  onClose: () => void;
  onSave: (ad: WallAd) => void;
  onWatch: (ad: WallAd) => void;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [copied, setCopied] = useState(false);

  const topDrivers = useMemo(
    () => Object.entries(ad.drivers).sort((a, b) => b[1] - a[1]).slice(0, 6),
    [ad.drivers],
  );

  const remake = () => {
    const beats = ad.transcript.slice(0, 8).map((l) => l.s).join(' / ');
    const payload = {
      toolKey: 'video',
      title: `Remake: ${ad.brand}`,
      spec: {
        prompt: [
          `Remake this proven ad concept in the user's voice (source ran ${ad.daysRunning} days${ad.live ? ', still live' : ''}).`,
          ad.hook ? `Hook shape to model: "${ad.hook}"` : null,
          beats ? `Beat structure: ${beats}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        medias: ad.video ? [{ role: 'video_references', ref: ad.video, label: `${ad.brand} source ad` }] : [],
      },
    };
    try {
      sessionStorage.setItem('founder:remake', JSON.stringify(payload));
    } catch {
      /* storage unavailable: the composer just opens blank */
    }
    router.push('/content?remake=1');
  };

  const copyHook = async () => {
    if (!ad.hook) return;
    try {
      await navigator.clipboard.writeText(ad.hook);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div className="ap-panel h-full w-full max-w-[460px] overflow-y-auto rounded-none border-y-0 border-r-0 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[15px] text-os-text">{ad.brand}</div>
            <div className="mt-0.5 text-[12px] text-os-dim">
              {ad.format ?? 'ad'} · {ad.daysRunning} days {ad.live ? '· live' : '· off'}
              {ad.ctaType ? ` · ${ad.ctaType.toLowerCase().replaceAll('_', ' ')}` : ''}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="close" className="pressable c-btn p-1.5">
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>

        {ad.video ? (
          <video ref={videoRef} src={ad.video} controls playsInline className="w-full rounded-[10px] border border-[rgba(255,69,87,0.16)] bg-black" />
        ) : ad.thumbnail || ad.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ad.thumbnail ?? ad.image ?? ''} alt={`${ad.brand} creative`} className="w-full rounded-[10px] border border-[rgba(255,69,87,0.16)]" />
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button type="button" onClick={remake} className="pressable c-btn c-btn-primary flex items-center gap-1.5 text-[12px]">
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.7} /> Remake
          </button>
          <button type="button" onClick={() => onSave(ad)} className="pressable c-btn flex items-center gap-1.5 text-[12px]">
            <Bookmark className="h-3.5 w-3.5" strokeWidth={1.7} fill={isSaved ? 'currentColor' : 'none'} />
            {isSaved ? 'Saved' : 'Save'}
          </button>
          {ad.brandId && (
            <button type="button" onClick={() => onWatch(ad)} className="pressable c-btn flex items-center gap-1.5 text-[12px]">
              <Plus className="h-3.5 w-3.5" strokeWidth={1.7} /> Track brand
            </button>
          )}
          {ad.hook && (
            <button type="button" onClick={copyHook} className="pressable c-btn flex items-center gap-1.5 text-[12px]">
              <Copy className="h-3.5 w-3.5" strokeWidth={1.7} /> {copied ? 'Copied' : 'Copy hook'}
            </button>
          )}
          {ad.linkUrl && (
            <a href={ad.linkUrl} target="_blank" rel="noreferrer" className="c-btn flex items-center gap-1.5 text-[12px]">
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.7} /> Landing page
            </a>
          )}
        </div>

        {ad.hook && (
          <div className="mt-4">
            <div className="text-[11px] text-os-dim">Hook ({ad.hookSource})</div>
            <p className="mt-1 text-[13.5px] leading-snug text-os-text">“{ad.hook}”</p>
          </div>
        )}

        {topDrivers.length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] text-os-dim">Emotional drivers</div>
            <div className="mt-2 flex flex-col gap-1.5">
              {topDrivers.map(([axis, score]) => (
                <div key={axis} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-[12px] text-os-muted">{axis}</span>
                  <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-black/40">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(score / 10) * 100}%`, opacity: 0.4 + 0.06 * score }} />
                  </div>
                  <span className="w-6 shrink-0 text-right text-[11.5px] tabular-nums text-os-dim">{score}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {ad.transcript.length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] text-os-dim">Transcript: click a line to seek</div>
            <div className="mt-2 flex flex-col">
              {ad.transcript.map((line, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    const v = videoRef.current;
                    if (v) {
                      v.currentTime = line.t;
                      v.play().catch(() => undefined);
                    }
                  }}
                  className="pressable group flex gap-2.5 rounded-[7px] px-2 py-1.5 text-left hover:bg-black/35"
                >
                  <span className="shrink-0 text-[11px] tabular-nums text-os-dim group-hover:text-[var(--accent)]">
                    {Math.floor(line.t / 60)}:{String(Math.floor(line.t % 60)).padStart(2, '0')}
                  </span>
                  <span className="text-[12.5px] leading-snug text-os-muted group-hover:text-os-text">{line.s}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
