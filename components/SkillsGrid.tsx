'use client';

/**
 * The skill catalog as one filtered card wall (mock 5g): a text filter, the
 * All / Claude Code / Operator / Draft chips with live counts, and cards that
 * read eyebrow (source · scope) / status / title / two-line description /
 * footer path-or-owner. Click a card to expand its real SKILL.md in a reader.
 * The full doc loads on demand (GET /api/skills/[slug]) so the page ships
 * light, unless a card carries inline markdown (the seeded fallback).
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  X,
  Download,
  Flame,
  Code2,
  Image as ImageIcon,
  FileSignature,
  Hammer,
  ClipboardList,
  SearchCheck,
  Plug,
  Target,
  Clapperboard,
  Cog,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Chip } from '@/components/Pressable';

export type SkillCard = {
  id: string; // slug — also the /api/skills/[slug] key
  name: string;
  group: string;
  kind: 'claude' | 'operator';
  description: string;
  meta: string; // source path or owner — the card footer
  filePath: string;
  status?: 'live' | 'learning' | 'planned';
  markdown?: string; // inline (fallback); otherwise fetched by id
};

const STATUS: Record<string, string> = { live: 'var(--ok)', learning: 'var(--warn)', planned: 'var(--text-3)' };

type Filter = 'All' | 'Claude Code' | 'Operator' | 'Draft';
const isDraft = (c: SkillCard) => c.status != null && c.status !== 'live';
const matches = (c: SkillCard, f: Filter) =>
  f === 'All' ? true : f === 'Draft' ? isDraft(c) : f === 'Claude Code' ? c.kind === 'claude' : c.kind === 'operator';

/** What sits above the title: the card's source and scope. */
const eyebrowOf = (c: SkillCard) =>
  c.kind === 'claude' ? `Claude Code · ${c.id.includes(':') ? 'plugin' : 'user'}` : c.group;

/** The tool/nature each skill runs on, as an icon. */
function skillIcon(card: SkillCard): LucideIcon {
  if (card.group === 'Firecrawl') return Flame;
  switch (card.id) {
    case 'codex':
      return Code2;
    case 'nano-banana':
      return ImageIcon;
    case 'proposal-generator':
      return FileSignature;
    case 'mcp-builder':
      return Plug;
    case 'build':
      return Hammer;
    case 'spec':
      return ClipboardList;
    case 'review':
      return SearchCheck;
  }
  switch (card.group.replace(/^Operator · /, '')) {
    case 'Sales':
      return Target;
    case 'Content':
      return Clapperboard;
    case 'Ops':
      return Cog;
    case 'Engineering':
      return Code2;
    default:
      return Sparkles;
  }
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} className="font-semibold text-os-text">{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="rounded bg-os-surface2 px-1 font-mono text-[11px] text-os-accent">{p.slice(1, -1)}</code>;
    return <span key={i}>{p}</span>;
  });
}

function Markdown({ src }: { src: string }) {
  const out: ReactNode[] = [];
  let fence: string[] | null = null;
  let k = 0;
  for (const line of src.split('\n')) {
    if (line.trim().startsWith('```')) {
      if (fence) {
        out.push(<pre key={k++} className="my-2 overflow-x-auto rounded-md border border-os-border bg-os-bg p-3 font-mono text-[11px] leading-relaxed text-os-muted">{fence.join('\n')}</pre>);
        fence = null;
      } else fence = [];
      continue;
    }
    if (fence) { fence.push(line); continue; }
    if (/^#\s/.test(line)) out.push(<h1 key={k++} className="mb-1 mt-4 text-[16px] font-bold">{inline(line.slice(2))}</h1>);
    else if (/^##\s/.test(line)) out.push(<h2 key={k++} className="mb-1 mt-3 font-mono text-[11px] font-bold uppercase tracking-widest text-os-dim">{inline(line.slice(3))}</h2>);
    else if (/^###\s/.test(line)) out.push(<h3 key={k++} className="mt-2 text-[12.5px] font-semibold">{inline(line.slice(4))}</h3>);
    else if (/^---\s*$/.test(line)) out.push(<hr key={k++} className="my-2.5 border-os-border" />);
    else if (/^\s*[-*]\s/.test(line))
      out.push(<div key={k++} className="flex gap-2 text-[12.5px] leading-relaxed text-os-muted"><span className="text-os-accent">·</span><span>{inline(line.replace(/^\s*[-*]\s/, ''))}</span></div>);
    else if (line.trim() === '') out.push(<div key={k++} className="h-2" />);
    else out.push(<p key={k++} className="text-[12.5px] leading-relaxed text-os-muted">{inline(line)}</p>);
  }
  if (fence) out.push(<pre key={k++} className="my-2 overflow-x-auto rounded-md border border-os-border bg-os-bg p-3 font-mono text-[11px] leading-relaxed text-os-muted">{fence.join('\n')}</pre>);
  return <div>{out}</div>;
}

export function SkillsGrid({ cards, sourceNote }: { cards: SkillCard[]; sourceNote: string }) {
  const [viewing, setViewing] = useState<SkillCard | null>(null);
  const [md, setMd] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setViewing(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const open = async (card: SkillCard) => {
    setViewing(card);
    if (card.markdown != null) {
      setMd(card.markdown);
      return;
    }
    setMd(null); // loading
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(card.id)}`);
      const body = (await res.json()) as { markdown?: string; error?: string };
      setMd(body.markdown ?? `SKILL.md could not be read (${body.error ?? res.status}).`);
    } catch {
      setMd('SKILL.md could not be read.');
    }
  };

  const FILTERS: Filter[] = ['All', 'Claude Code', 'Operator', 'Draft'];
  const q = query.trim().toLowerCase();
  const shown = cards.filter(
    (c) =>
      matches(c, filter) &&
      (q === '' || `${c.name} ${c.description} ${c.meta} ${c.group}`.toLowerCase().includes(q)),
  );

  const ViewingIcon = viewing ? skillIcon(viewing) : Sparkles;

  /** Save the open SKILL.md: real skills stream from the API, inline docs download as a blob. */
  const download = (card: SkillCard) => {
    if (card.markdown == null) {
      window.location.href = `/api/skills/${encodeURIComponent(card.id)}?download=1`;
      return;
    }
    const blob = new Blob([card.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${card.id}-SKILL.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 font-mono text-[11px] text-os-dim">{sourceNote}</p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter skills"
          className="h-[26px] w-44 rounded-ctl border border-os-border bg-os-bg px-2.5 font-mono text-[11px] text-os-text placeholder:text-os-dim focus:border-os-border-strong focus:outline-none"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <Chip key={f} on={filter === f} onClick={() => setFilter(f)}>
            {f} {cards.filter((c) => matches(c, f)).length}
          </Chip>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="font-mono text-[11px] text-os-dim">
          no skills match{q ? ` "${query.trim()}"` : ''} · clear the filter to see all {cards.length}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => {
            const Icon = skillIcon(c);
            const status = c.status ?? 'live';
            return (
              <button
                key={c.id}
                onClick={() => open(c)}
                title={`${c.name} · open SKILL.md`}
                data-lens="r"
                className="pressable is-row group flex flex-col gap-2 rounded-lg-t border border-os-border bg-os-surface p-4 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">
                    {eyebrowOf(c)}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-os-dim">
                    <span className="h-1.5 w-1.5" style={{ background: STATUS[status] }} />
                    {status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-os-accent" strokeWidth={1.8} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold group-hover:text-os-text">{c.name}</span>
                </div>
                <p className="line-clamp-2 min-h-[30px] text-[11px] leading-snug text-os-dim">{c.description}</p>
                <div className="truncate border-t border-os-border pt-2 font-mono text-[9.5px] text-os-dim">{c.meta}</div>
              </button>
            );
          })}
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={() => setViewing(null)}>
          <div className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-os-border-strong bg-os-surface" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-os-border px-5 py-3">
              <span className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-os-dim">
                <ViewingIcon className="h-3.5 w-3.5 shrink-0 text-os-accent" />
                <span className="truncate">{viewing.filePath}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <button
                  onClick={() => download(viewing)}
                  title="Download SKILL.md"
                  className="pressable flex items-center gap-1.5 rounded-md border border-os-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-os-dim hover:border-os-border-strong hover:text-os-text"
                >
                  <Download className="h-3 w-3" />
                  skill.md
                </button>
                <button onClick={() => setViewing(null)} aria-label="Close" className="pressable shrink-0 text-os-dim hover:text-os-text">
                  <X className="h-4 w-4" />
                </button>
              </span>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              {md === null ? (
                <p className="animate-pulse font-mono text-[11px] text-os-dim">loading SKILL.md…</p>
              ) : (
                <Markdown src={md} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
