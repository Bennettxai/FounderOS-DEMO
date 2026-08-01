/**
 * Screen context for the Conductor panel — a short, honest summary of what
 * the operator is looking at, resolved per route and handed to the agent so
 * it can talk about the screen (Notion-agent style). The funnel gets the
 * full live read; other views get cheap repo-backed counts; unknown paths
 * degrade to the route name. Never blocks a chat: resolvers that fail return
 * a plain title line.
 */
import { NAV_AGENTS, NAV_INTELLIGENCE, NAV_LIBRARY, NAV_OPERATE, NAV_SYSTEM } from '@/lib/nav';
import { getDb } from '@/lib/data';
import { funnelSummary, journeyMeta, splitFunnelJourneys, FUNNEL_STAGES } from '@/lib/funnel';
import { attioFunnelJourneys } from '@/lib/funnel-live';
import { ghlFunnelJourneys } from '@/lib/funnel-ghl';

const ALL_NAV = [...NAV_OPERATE, ...NAV_AGENTS, ...NAV_INTELLIGENCE, ...NAV_SYSTEM, ...NAV_LIBRARY];

export function screenTitleFor(path: string): string {
  const clean = path.split('?')[0] || '/';
  const hit = ALL_NAV.find((n) => (n.href === '/' ? clean === '/' : clean === n.href || clean.startsWith(`${n.href}/`)));
  return hit?.label ?? clean;
}

export type FunnelContextInput = {
  clients: number;
  converted: number;
  revenueUsd: number;
  stageCounts: [string, number][];
  archived: number;
  sources: string;
  decaying: number;
  reddest: { name: string; days: number }[];
};

/** Pure formatter — what the Conductor reads about the funnel screen. */
export function describeFunnelContext(d: FunnelContextInput): string {
  return [
    `Funnel: ${d.clients} active leads across ${d.sources}; ${d.converted} converted ($${Math.round(d.revenueUsd).toLocaleString('en-US')}); ${d.archived} archived (>90d quiet).`,
    `Current stage counts — ${d.stageCounts.map(([label, n]) => `${label}: ${n}`).join(' · ')}.`,
    `${d.decaying} fading toward the 90-day archive (quiet >21d).`,
    d.reddest.length > 0
      ? `Most at risk: ${d.reddest.map((r) => `${r.name} (${r.days}d quiet)`).join(', ')}.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function funnelContext(): Promise<string> {
  const now = new Date();
  const [attioLive, ghlLive] = await Promise.all([attioFunnelJourneys(now), ghlFunnelJourneys(now)]);
  const live = [...(attioLive?.journeys ?? []), ...(ghlLive?.journeys ?? [])];
  const all = live.length > 0 ? live : getDb().funnel.journeys();
  const { active, archived } = splitFunnelJourneys(all, now);
  const summary = funnelSummary(active);
  const metas = active.map((j) => ({ j, meta: journeyMeta(j, now) }));
  const decaying = metas.filter(({ j, meta }) => j.status !== 'converted' && meta.daysSinceLastTouch > 21).length;
  const reddest = metas
    .filter(({ j }) => j.status !== 'converted')
    .sort((a, b) => b.meta.daysSinceLastTouch - a.meta.daysSinceLastTouch)
    .slice(0, 5)
    .map(({ j, meta }) => ({ name: j.name, days: meta.daysSinceLastTouch }));
  const stageCounts = new Map<string, number>();
  for (const j of active) {
    const label = FUNNEL_STAGES.find((s) => s.id === j.status)?.label ?? j.status;
    stageCounts.set(label, (stageCounts.get(label) ?? 0) + 1);
  }
  const sources =
    live.length > 0
      ? [
          attioLive?.journeys.length ? `Attio ${attioLive.total}` : null,
          ghlLive?.journeys.length ? `GHL ${ghlLive.total}` : null,
        ]
          .filter(Boolean)
          .join(' + ') + ' (live)'
      : 'seeded demo data';
  return describeFunnelContext({
    clients: summary.clients,
    converted: summary.converted,
    revenueUsd: summary.revenueUsd,
    stageCounts: FUNNEL_STAGES.map((s) => [s.label, stageCounts.get(s.label) ?? 0]),
    archived: archived.length,
    sources,
    decaying,
    reddest,
  });
}

/** Route-aware context. Cheap everywhere except the funnel (the flagship). */
export async function screenContextFor(path: string): Promise<{ title: string; context: string }> {
  const title = screenTitleFor(path);
  const clean = path.split('?')[0] || '/';
  try {
    if (clean.startsWith('/funnel')) {
      return { title, context: await funnelContext() };
    }
    const db = getDb();
    if (clean === '/' || clean.startsWith('/agents') || clean.startsWith('/org')) {
      const agents = db.agents.all();
      const active = agents.filter((a) => a.status === 'active').length;
      return {
        title,
        context: `${title}: agent roster — ${agents.length} agents (${active} active) across ${db.departments.all().length} pillars.`,
      };
    }
    if (clean.startsWith('/integrations')) {
      const tools = db.tools.all();
      return {
        title,
        context: `${title}: connections board — ${tools.length} integrations tracked (${tools.filter((t) => t.status === 'connected').length} connected).`,
      };
    }
    if (clean.startsWith('/roadmap')) {
      return { title, context: `${title}: ${db.roadmap.all().length} roadmap items across quarters.` };
    }
    return { title, context: `${title} view of Founder OS.` };
  } catch {
    return { title, context: `${title} view of Founder OS.` };
  }
}
