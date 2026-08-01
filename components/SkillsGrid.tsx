'use client';

/**
 * The skill catalog. Compact, icon-led cards packed many-per-row; click a card
 * to expand its real SKILL.md in a reader. The full doc loads on demand
 * (GET /api/skills/[slug]) so the page ships light, unless a card carries inline
 * markdown (the seeded fallback). Rendered with a tiny built-in markdown pass.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  X,
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
import { SectionHead } from '@/components/terminal';

export type SkillCard = {
  id: string; // slug — also the /api/skills/[slug] key
  name: string;
  group: string;
  description: string;
  meta: string; // source path or owner (shown in the reader header)
  filePath: string;
  status?: 'live' | 'learning' | 'planned';
  markdown?: string; // inline (fallback); otherwise fetched by id
};

const STATUS: Record<string, string> = { live: 'var(--ok)', learning: 'var(--warn)', planned: 'var(--text-3)' };
const GROUP_ORDER = ['Spec · build · review', 'Engineering', 'Sales', 'Content', 'Ops', 'Creative', 'Skills', 'Firecrawl'];

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
  switch (card.group) {
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

  const groups = [...new Set(cards.map((c) => c.group))].sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a);
    const ib = GROUP_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });

  const ViewingIcon = viewing ? skillIcon(viewing) : Sparkles;

  return (
    <div>
      <p className="mb-4 font-mono text-[11px] text-os-dim">{sourceNote}</p>
      {groups.map((group) => {
        const inGroup = cards.filter((c) => c.group === group);
        return (
          <section key={group} className="mb-6">
            <SectionHead label={group} count={inGroup.length} />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {inGroup.map((c) => {
                const Icon = skillIcon(c);
                return (
                  <button
                    key={c.id}
                    onClick={() => open(c)}
                    title={`${c.name} — open SKILL.md`}
                    className="group flex flex-col gap-1.5 rounded-lg border border-os-border bg-os-surface p-2.5 text-left transition-colors hover:border-os-border-strong hover:bg-os-surface2"
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-[15px] w-[15px] shrink-0 text-os-accent" strokeWidth={1.8} />
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold group-hover:text-os-text">{c.name}</span>
                      {c.status && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS[c.status] }} />}
                    </div>
                    <p className="line-clamp-2 text-[10px] leading-snug text-os-dim">{c.description}</p>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={() => setViewing(null)}>
          <div className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-os-border-strong bg-os-surface" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-os-border px-5 py-3">
              <span className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-os-dim">
                <ViewingIcon className="h-3.5 w-3.5 shrink-0 text-os-accent" />
                <span className="truncate">{viewing.filePath}</span>
              </span>
              <button onClick={() => setViewing(null)} aria-label="Close" className="shrink-0 text-os-dim transition-colors hover:text-os-text">
                <X className="h-4 w-4" />
              </button>
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
