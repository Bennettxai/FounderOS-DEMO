'use client';

import { useEffect, useState } from 'react';
import { BarChart3, Boxes, Brain, ChevronLeft, ChevronRight, Plug, Star, Zap, type LucideIcon } from 'lucide-react';
import { PersonaOrgChart } from '@/components/PersonaOrgChart';
import type { Persona } from '@/lib/schemas';

function SectionLabel({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-os-dim">
      <Icon className="h-3 w-3" /> {children}
    </div>
  );
}

function PersonaCard({ p }: { p: Persona }) {
  return (
    <article
      className="flex flex-col overflow-hidden rounded-lg-t border border-os-border bg-os-surface"
      style={{ borderTop: `2px solid ${p.accent}` }}
    >
      {/* cover — the persona's OS as an org chart (core → departments → agents) */}
      <div className="border-b border-os-border bg-os-bg2">
        <PersonaOrgChart persona={p} />
      </div>

      {/* header */}
      <div className="border-b border-os-border px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold" style={{ color: p.accent }}>
                {String(p.order).padStart(2, '0')}
              </span>
              <h2 className="text-[15px] font-bold">{p.name}</h2>
            </div>
            <div className="mt-0.5 text-[12px] [text-wrap:pretty] text-os-muted">{p.tagline}</div>
          </div>
          <span
            className="shrink-0 rounded-sm-t border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wide"
            style={{ borderColor: p.accent, color: p.accent }}
          >
            {p.archetype}
          </span>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-os-dim [text-wrap:pretty]">{p.summary}</p>
        <div className="mt-3 flex items-start gap-2 rounded-md-t border border-os-border bg-os-surface2 px-3 py-2">
          <Star className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: p.accent }} />
          <div>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-os-dim">North star</span>
            <div className="text-[12.5px] font-semibold">{p.northStar}</div>
          </div>
        </div>
      </div>

      {/* pillars */}
      <div className="px-5 py-4">
        <SectionLabel icon={Boxes}>Pillars · {p.pillars.length}</SectionLabel>
        <div className="grid gap-2.5 lg:grid-cols-2">
          {p.pillars.map((pillar) => (
            <div key={pillar.name} className="rounded-md-t border border-os-border bg-os-surface2 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-semibold">{pillar.name}</span>
                <span className="shrink-0 truncate font-mono text-[10px] text-os-dim">{pillar.focus}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {pillar.agents.map((a) => (
                  <span key={a} className="rounded-sm-t border border-os-border bg-os-surface px-1.5 py-0.5 font-mono text-[9.5px] text-os-accent">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* connectors + metrics */}
      <div className="grid gap-4 border-t border-os-border px-5 py-4 sm:grid-cols-2">
        <div>
          <SectionLabel icon={Plug}>Connectors</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {p.connectors.map((c) => (
              <span key={c} className="rounded-sm-t border border-os-border bg-os-surface2 px-2 py-0.5 font-mono text-[10px] text-os-muted">
                {c}
              </span>
            ))}
          </div>
        </div>
        <div>
          <SectionLabel icon={BarChart3}>Tracks</SectionLabel>
          <ul className="flex flex-col gap-1">
            {p.metrics.map((m) => (
              <li key={m} className="flex items-baseline gap-1.5 text-[11.5px] text-os-muted">
                <span className="font-mono" style={{ color: p.accent }}>
                  ›
                </span>
                {m}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* brain + signature play */}
      <div className="flex flex-col gap-2.5 border-t border-os-border px-5 py-4">
        <div className="flex items-start gap-2">
          <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0 text-os-dim" />
          <p className="text-[11.5px] leading-relaxed text-os-dim [text-wrap:pretty]">{p.brainUse}</p>
        </div>
        <div
          className="flex items-start gap-2 rounded-md-t border px-3 py-2.5"
          style={{ borderColor: `${p.accent}66`, background: `color-mix(in srgb, ${p.accent} 9%, var(--surface))` }}
        >
          <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: p.accent }} />
          <div>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: p.accent }}>
              Signature play
            </span>
            <p className="mt-0.5 text-[12px] leading-relaxed [text-wrap:pretty]">{p.signaturePlay}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

/** One persona at a time — click (or ← / →) through all ten. */
export function PersonasViewer({ personas }: { personas: Persona[] }) {
  const [i, setI] = useState(0);
  const n = personas.length;
  const go = (dir: number) => setI((c) => (c + dir + n) % n);
  const current = personas[i];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  if (!current) return null;

  return (
    <div>
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes persona-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.persona-in{animation:persona-in .28s ease}
@media (prefers-reduced-motion: reduce){.persona-in{animation:none}}`,
        }}
      />

      {/* stepper controls — arrows are a fixed pair so you can repeat-click
          without chasing them; the changing label sits to their right. */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => go(-1)}
            aria-label="Previous persona"
            className="flex h-9 w-9 items-center justify-center rounded-sm-t border border-os-border text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => go(1)}
            aria-label="Next persona"
            className="flex h-9 w-9 items-center justify-center rounded-sm-t border border-os-border text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[11px] text-os-dim">
            <span style={{ color: current.accent }}>{String(i + 1).padStart(2, '0')}</span> / {String(n).padStart(2, '0')}
          </div>
          <div className="truncate text-[13px] font-semibold">{current.name}</div>
        </div>

        {/* jump rail */}
        <div className="ml-auto flex flex-wrap justify-end gap-1.5">
          {personas.map((p, idx) => {
            const active = idx === i;
            return (
              <button
                key={p.id}
                onClick={() => setI(idx)}
                title={p.name}
                className={`flex items-center gap-1.5 rounded-sm-t border px-2 py-1 font-mono text-[10px] transition-colors ${
                  active ? 'border-os-border-strong text-os-text' : 'border-os-border text-os-dim hover:text-os-muted'
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: active ? p.accent : 'var(--text-3)' }} />
                {String(idx + 1).padStart(2, '0')}
              </button>
            );
          })}
        </div>
      </div>

      {/* one card */}
      <div key={current.id} className="persona-in mx-auto max-w-4xl">
        <PersonaCard p={current} />
      </div>
    </div>
  );
}
