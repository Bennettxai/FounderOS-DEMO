import Link from 'next/link';
import { ArrowUpRight, BarChart3, Brain, Clapperboard, ExternalLink, Megaphone, Play } from 'lucide-react';
import { getDb } from '@/lib/data';
import { contentAgents } from '@/lib/content';
import { zernioRecentPosts, zernioPostDays } from '@/lib/connectors/zernio';
import { PageHeader } from '@/components/PageHeader';
import { Badge, Dot, SectionHead } from '@/components/terminal';
import { ContentAgentCard } from '@/components/ContentAgentCard';
import { Rise } from '@/components/motion';

export const dynamic = 'force-dynamic';

// The Vantage content-intelligence system this view backlinks out to.
const INTEL_URL = 'https://intel.vantage.example.com';
const INTEL_ANALYTICS_URL = 'https://intel.vantage.example.com/my-analytics';

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

function BacklinkCard({
  href, icon: Icon, mark, title, sub, internal = false, meta,
}: {
  href: string;
  icon?: typeof Brain;
  /** real brand mark (public/*.png) instead of a lucide glyph */
  mark?: string;
  title: string;
  sub: string;
  internal?: boolean;
  meta?: string;
}) {
  const inner = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-ctl border border-os-border bg-os-surface2 text-os-accent">
        {mark ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mark} alt="" className="h-5 w-5 object-contain" />
        ) : Icon ? (
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
          {title}
          {internal ? (
            <ArrowUpRight className="h-3.5 w-3.5 lens-child text-os-dim group-hover:text-os-accent" />
          ) : (
            <ExternalLink className="h-3.5 w-3.5 lens-child text-os-dim group-hover:text-os-accent" />
          )}
        </span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-os-dim [text-wrap:pretty]">{sub}</span>
        <span className="mt-1.5 block truncate font-mono text-[10px] text-os-muted">
          {meta ?? href.replace('https://', '')}
        </span>
      </span>
    </>
  );
  const cls =
    'pressable is-row group flex h-full items-start gap-3 rounded-panel border border-os-border bg-os-surface p-4';
  return internal ? (
    <Link href={href} data-lens="r" className={cls}>{inner}</Link>
  ) : (
    <a href={href} data-lens="r" target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
  );
}

export default async function ContentPage() {
  const db = getDb();
  const crew = contentAgents(db.agents.all());
  const leadMagnets = db.leadMagnets.all();
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

      {/* Three equal top sections (the operator): the lead magnet index
          and both Vantage intelligence surfaces, side by side. */}
      <Rise as="section" i={1}>
        <SectionHead label="Content intelligence" />
        <div className="grid gap-3 md:grid-cols-3">
          <BacklinkCard
            href="/content/lead-magnets"
            internal
            icon={Megaphone}
            title="Lead Magnets"
            sub="Every landing page we ship, with the live link on each row."
            meta={`${leadMagnets.length} page${leadMagnets.length === 1 ? '' : 's'} · ${leadMagnets.filter((m) => m.status === 'live').length} live`}
          />
          <BacklinkCard
            href={INTEL_URL}
            mark="/vantage-mark.png"
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
      </Rise>

      {/* The content agent + crew (real seed roster) */}
      <Rise as="section" i={2} className="mt-8">
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
        {lead && <ContentAgentCard agent={lead} lead />}
        {workers.length > 0 && (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {workers.map((a) => (
              <ContentAgentCard key={a.id} agent={a} />
            ))}
          </div>
        )}
      </Rise>

      {/* Zernio content pipeline — recent published content + cadence */}
      <Rise as="section" i={3} className="mt-8">
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
          <ul className="flex flex-col divide-y divide-os-border overflow-hidden rounded-panel border border-os-border bg-os-surface">
            {posts.map((p, i) => (
              <li key={`${p.url}-${i}`} data-lens="r" className="pressable is-row flex items-center gap-3 px-4 py-2.5">
                <Play className="h-3.5 w-3.5 shrink-0 text-os-dim" />
                <Dot state={p.status === 'published' ? 'ok' : 'available'} />
                <span className="w-24 shrink-0 font-mono text-[10.5px] uppercase tracking-wide text-os-muted">{platformLabel(p.platform)}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px]">{p.caption || 'Untitled post'}</span>
                <span className={`hidden shrink-0 font-mono text-[10px] uppercase tracking-wide sm:inline ${p.status === 'published' ? 'text-os-ok' : 'text-os-dim'}`}>
                  {p.status}
                </span>
                {p.url ? (
                  <a href={p.url} data-lens="c" target="_blank" rel="noopener noreferrer" className="pressable shrink-0 rounded-ctl px-0.5 text-os-dim">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                <span className="w-10 shrink-0 text-right font-mono text-[10px] text-os-dim">{agoFrom(p.publishedAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-panel border border-dashed border-os-border bg-os-surface px-4 py-5 text-center font-mono text-[11.5px] text-os-dim">
            No live Zernio pull right now — recent content shows here once the API responds (key loaded from the environment).
          </p>
        )}
      </Rise>
    </div>
  );
}
