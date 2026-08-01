import Link from 'next/link';
import { ArrowUpRight, BarChart3, Brain, Clapperboard, ExternalLink, Play, Wrench } from 'lucide-react';
import { getDb } from '@/lib/data';
import { contentAgents } from '@/lib/content';
import { zernioRecentPosts, zernioPostDays } from '@/lib/connectors/zernio';
import { PageHeader } from '@/components/PageHeader';
import { Badge, Dot, SectionHead } from '@/components/terminal';
import type { Agent } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

// The Vantage content-intelligence system this view backlinks out to.
const INTEL_URL = 'https://intel.vantage.ai';
const INTEL_ANALYTICS_URL = 'https://intel.vantage.ai/my-analytics';

function prettyTool(slug: string): string {
  return slug.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function agoFrom(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

function platformLabel(p: string): string {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function AgentCard({ agent, lead = false }: { agent: Agent; lead?: boolean }) {
  return (
    <div
      className={`rounded-lg-t border bg-os-surface p-4 ${lead ? 'border-[var(--accent-line)]' : 'border-os-border'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Dot state={agent.status === 'active' ? 'ok' : 'available'} pulse={agent.status === 'active'} />
            <span className="truncate text-[14px] font-bold">{agent.name}</span>
            {lead && <span className="rounded-sm-t border border-[var(--accent-line)] px-1.5 py-px font-mono text-[9px] uppercase tracking-wide text-os-accent">lead</span>}
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-os-dim">{agent.role} · {agent.model}</div>
        </div>
        <span className={`shrink-0 font-mono text-[10px] uppercase tracking-wide ${agent.status === 'active' ? 'text-os-ok' : 'text-os-warn'}`}>
          {agent.status}
        </span>
      </div>
      <p className="mt-2.5 text-[12px] leading-relaxed text-os-muted [text-wrap:pretty]">{agent.description}</p>
      {agent.tools.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {agent.tools.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-sm-t border border-os-border bg-os-surface2 px-1.5 py-0.5 font-mono text-[10px] text-os-muted">
              <Wrench className="h-2.5 w-2.5" /> {prettyTool(t)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BacklinkCard({
  href, icon: Icon, title, sub,
}: {
  href: string;
  icon: typeof Brain;
  title: string;
  sub: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 rounded-lg-t border border-os-border bg-os-surface p-4 transition-colors hover:border-os-border-strong"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md-t border border-os-border bg-os-surface2 text-os-accent">
        <Icon className="h-4 w-4" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
          {title}
          <ExternalLink className="h-3.5 w-3.5 text-os-dim transition-colors group-hover:text-os-accent" />
        </span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-os-dim [text-wrap:pretty]">{sub}</span>
        <span className="mt-1.5 block truncate font-mono text-[10px] text-os-muted">{href.replace('https://', '')}</span>
      </span>
    </a>
  );
}

export default async function ContentPage() {
  const db = getDb();
  const crew = contentAgents(db.agents.all());
  const lead = crew[0] ?? null;
  const workers = lead ? crew.slice(1) : crew;

  const posts = await zernioRecentPosts(8).catch(() => []);
  const days = await zernioPostDays().catch(() => []);
  const activeDays = days.filter((d) => d.platforms.length > 0).length;

  return (
    <div>
      <PageHeader
        eyebrow="content engine"
        title="Content Creation"
        right={<Badge tone="accent">{crew.length} agents</Badge>}
      />

      {/* Backlinks to the Vantage content-intelligence system */}
      <section>
        <SectionHead label="Content intelligence" />
        <div className="grid gap-3 sm:grid-cols-2">
          <BacklinkCard
            href={INTEL_URL}
            icon={Brain}
            title="Vantage Intel"
            sub="Your content intelligence system — research, hooks, and what's working, feeding the content agent."
          />
          <BacklinkCard
            href={INTEL_ANALYTICS_URL}
            icon={BarChart3}
            title="My Analytics"
            sub="Per-piece performance and audience analytics from the intelligence system."
          />
        </div>
      </section>

      {/* The content agent + crew (real seed roster) */}
      <section className="mt-8">
        <SectionHead
          label="Content agents"
          count={`${crew.length}`}
        />
        <p className="mb-3 flex items-center gap-1.5 text-xs text-os-dim">
          <Clapperboard className="h-3.5 w-3.5" /> Tied to your social media — run them from{' '}
          <Link href="/agents" className="inline-flex items-center gap-0.5 text-os-accent hover:underline">
            Agents <ArrowUpRight className="h-3 w-3" />
          </Link>
        </p>
        {lead && <AgentCard agent={lead} lead />}
        {workers.length > 0 && (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {workers.map((a) => (
              <AgentCard key={a.id} agent={a} />
            ))}
          </div>
        )}
      </section>

      {/* Zernio content pipeline — recent published content + cadence */}
      <section className="mt-8">
        <SectionHead
          label="Zernio content pipeline"
          count={posts.length > 0 ? `${posts.length} recent` : 'no live pull'}
        />
        <p className="mb-3 flex items-center gap-1.5 text-xs text-os-dim">
          Published across six platforms via Zernio · {activeDays} active days tracked · full dashboard in{' '}
          <Link href="/social" className="inline-flex items-center gap-0.5 text-os-accent hover:underline">
            Social <ArrowUpRight className="h-3 w-3" />
          </Link>
        </p>
        {posts.length > 0 ? (
          <ul className="flex flex-col divide-y divide-os-border overflow-hidden rounded-lg-t border border-os-border bg-os-surface">
            {posts.map((p, i) => (
              <li key={`${p.url}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                <Play className="h-3.5 w-3.5 shrink-0 text-os-dim" />
                <span className="w-24 shrink-0 font-mono text-[10.5px] uppercase tracking-wide text-os-muted">{platformLabel(p.platform)}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px]">{p.caption || 'Untitled post'}</span>
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-os-dim hover:text-os-accent">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                <span className="w-10 shrink-0 text-right font-mono text-[10px] text-os-dim">{agoFrom(p.publishedAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg-t border border-dashed border-os-border bg-os-surface px-4 py-5 text-center font-mono text-[11.5px] text-os-dim">
            No live Zernio pull right now — recent content shows here once the API responds (key from ~/.config/social/.env).
          </p>
        )}
      </section>
    </div>
  );
}
