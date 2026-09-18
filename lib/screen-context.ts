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

export type QuickAction = { label: string; prompt: string };

/**
 * The four one-tap openers the dock offers on a given screen. They are the way
 * out of an empty transcript, so they have to be about the screen he is on: on
 * /finances the first question is never "what is the board doing".
 *
 * Pure and per route, so the panel can render them the instant the context
 * lands and the tests can read them without a database.
 */
const QUICK_BY_ROUTE: [string, QuickAction[]][] = [
  ['/funnel', [
    { label: 'Who is going cold?', prompt: 'Which leads in the funnel are fading toward the 90-day archive, and what is the next touch for each?' },
    { label: 'Stage bottleneck', prompt: 'Which funnel stage is holding the most clients right now, and why are they stuck there?' },
    { label: 'Revenue this month', prompt: 'What has the funnel converted this month, and how does that compare to the pipeline still open?' },
    { label: 'Draft a follow-up', prompt: 'Draft a follow-up message for the quietest lead in the funnel. Do not send it, show it to me first.' },
  ]],
  ['/brain', [
    { label: 'What do you know?', prompt: 'Summarize what G-Brain currently knows about my business: the biggest clusters and where the coverage is thin.' },
    { label: 'Query the brain', prompt: 'Run a G-Brain query and show me the top hits with their sources.' },
    { label: 'Gaps in the store', prompt: 'Which pillars have the fewest brain pages, and what should I capture to fill them?' },
    { label: 'Capture a note', prompt: 'Capture a note into G-Brain for me. Ask me what it should say first.' },
  ]],
  ['/agents', [
    { label: 'What is running?', prompt: 'Which agents are running right now, which are blocked, and which have not run today?' },
    { label: 'Last run failures', prompt: 'Show me every agent whose last run failed, with the error and what it would take to fix.' },
    { label: 'Create board task', prompt: 'Create a board task for the work I am about to describe. Ask me for the title first.' },
    { label: 'Delegate to a pillar', prompt: 'Delegate this screen’s open work to the right pillar and tell me who picked it up.' },
  ]],
  ['/org', [
    { label: 'Who owns what?', prompt: 'Walk the org: which pillar owns which workers, and where is a seat doing nothing?' },
    { label: 'Broadcast draft', prompt: 'Draft a broadcast to every pillar about today’s priority. Show it to me before sending.' },
    { label: 'Idle seats', prompt: 'Which agent seats have been idle longest, and what should they be pointed at?' },
    { label: 'Delegate to a pillar', prompt: 'Delegate a task to one pillar and tell me which agent took it.' },
  ]],
  ['/comms', [
    { label: 'What needs a reply?', prompt: 'Across every inbox and Slack lane, what is waiting on a reply from me?' },
    { label: 'Today’s digest', prompt: 'Summarize today’s comms: who reached out, what they wanted, what is unanswered.' },
    { label: 'Draft the hardest one', prompt: 'Draft a reply to the message that needs the most thought. Show it to me, do not send it.' },
    { label: 'Recording action items', prompt: 'Pull the action items out of the most recent call recordings.' },
  ]],
  ['/social', [
    { label: 'What is working?', prompt: 'Which posts drove the most growth in the last 30 days, and what do they have in common?' },
    { label: 'Follower delta', prompt: 'How did each account’s follower count move this month?' },
    { label: 'Unanswered DMs', prompt: 'Which DMs are still waiting on a reply?' },
    { label: 'Draft the next post', prompt: 'Draft the next post in my format based on what performed best recently.' },
  ]],
  ['/finances', [
    { label: 'Cash this month', prompt: 'What came in this month across every processor, and how does it compare to last month?' },
    { label: 'Outstanding invoices', prompt: 'What is invoiced and unpaid right now, and how old is each one?' },
    { label: 'Where is it going?', prompt: 'Break down this month’s spend by category and flag anything unusual.' },
    { label: 'Create a payment link', prompt: 'Create a Stripe payment link. Ask me the amount and what it is for first.' },
  ]],
  ['/trading', [
    { label: 'How is the sleeve?', prompt: 'How is the agentic sleeve doing today, and what did the Markets Agent reason about it?' },
    { label: 'Open orders', prompt: 'What orders are open right now, and are any of them stale?' },
    { label: 'Biggest movers', prompt: 'Which positions moved most today and why?' },
    { label: 'Explain a trade', prompt: 'Explain the most recent trade in the log: the thesis and whether it played out.' },
  ]],
  ['/integrations', [
    { label: 'What is down?', prompt: 'Which connections are not connected right now, and what does each one need?' },
    { label: 'Explain a failure', prompt: 'Take the most broken connector and explain exactly why it is failing.' },
    { label: 'Freshest data', prompt: 'Which connectors have the stalest data, and how stale?' },
    { label: 'Create board task', prompt: 'Create a board task to fix the connector that is most worth fixing.' },
  ]],
  ['/roadmap', [
    { label: 'What is next?', prompt: 'What is the next item on the roadmap that is actually unblocked?' },
    { label: 'Slipping items', prompt: 'Which roadmap items have slipped their quarter, and what is holding each one?' },
    { label: 'This quarter', prompt: 'Summarize this quarter: shipped, in flight, and at risk.' },
    { label: 'Create board task', prompt: 'Turn a roadmap item into a board task. Ask me which one first.' },
  ]],
  ['/content', [
    { label: 'What should I post?', prompt: 'Based on what has performed, what should the next piece of content be?' },
    { label: 'Open drafts', prompt: 'Which content pieces are drafted but never shipped?' },
    { label: 'Lead magnet pull', prompt: 'Which lead magnets are actually converting, and which are dead weight?' },
    { label: 'Draft a caption', prompt: 'Draft a caption in my format with three hashtags. Ask me the topic first.' },
  ]],
  ['/workflows', [
    { label: 'What fires next?', prompt: 'Which scheduled workflow fires next, and what does it do?' },
    { label: 'Recent failures', prompt: 'Which workflow runs failed recently, and what was the error?' },
    { label: 'Run one now', prompt: 'Which workflow is worth running right now, and why?' },
    { label: 'Create board task', prompt: 'Create a board task for a workflow that needs fixing.' },
  ]],
  ['/tasks', [
    { label: 'What needs me?', prompt: 'Which tasks are actually waiting on me rather than on an agent?' },
    { label: 'Blocked lane', prompt: 'What is blocked, and what is each one blocked on?' },
    { label: 'Create board task', prompt: 'Create a board task. Ask me the title and the owner first.' },
    { label: 'Delegate to a pillar', prompt: 'Take the oldest open task and delegate it to the right pillar.' },
  ]],
  ['/doctor', [
    { label: 'What is broken?', prompt: 'Walk the doctor checks and tell me what is genuinely broken versus merely noisy.' },
    { label: 'Explain a check', prompt: 'Explain the worst failing check: what it measures and what fixes it.' },
    { label: 'Since when?', prompt: 'How long has each failing check been failing?' },
    { label: 'Create board task', prompt: 'Create a board task for the failure most worth fixing today.' },
  ]],
];

const QUICK_DEFAULT: QuickAction[] = [
  { label: 'Summarize this screen', prompt: 'Summarize what I am looking at on this screen and what stands out.' },
  { label: 'What needs me?', prompt: 'What needs my attention right now across the OS?' },
  { label: 'Create board task', prompt: 'Create a board task for the work on this screen. Ask me the title first.' },
  { label: 'Delegate to a pillar', prompt: 'Delegate the work on this screen to the right pillar and tell me who picked it up.' },
];

/** Four openers for the screen at `path`; unknown routes get the generic set. */
export function quickActionsFor(path: string): QuickAction[] {
  const clean = path.split('?')[0] || '/';
  const hit = QUICK_BY_ROUTE.find(([href]) => clean === href || clean.startsWith(`${href}/`));
  return hit ? hit[1] : QUICK_DEFAULT;
}

/** Route-aware context. Cheap everywhere except the funnel (the flagship). */
export async function screenContextFor(
  path: string,
): Promise<{ title: string; context: string; quickActions: QuickAction[] }> {
  const title = screenTitleFor(path);
  const clean = path.split('?')[0] || '/';
  const quickActions = quickActionsFor(path);
  try {
    if (clean.startsWith('/funnel')) {
      return { title, context: await funnelContext(), quickActions };
    }
    const db = getDb();
    if (clean === '/' || clean.startsWith('/agents') || clean.startsWith('/org')) {
      const agents = db.agents.all();
      const active = agents.filter((a) => a.status === 'active').length;
      return {
        title,
        quickActions,
        context: `${title}: agent roster — ${agents.length} agents (${active} active) across ${db.departments.all().length} pillars.`,
      };
    }
    if (clean.startsWith('/integrations')) {
      const tools = db.tools.all();
      return {
        title,
        quickActions,
        context: `${title}: connections board — ${tools.length} integrations tracked (${tools.filter((t) => t.status === 'connected').length} connected).`,
      };
    }
    if (clean.startsWith('/roadmap')) {
      return { title, context: `${title}: ${db.roadmap.all().length} roadmap items across quarters.`, quickActions };
    }
    return { title, context: `${title} view of Founder OS.`, quickActions };
  } catch {
    return { title, context: `${title} view of Founder OS.`, quickActions };
  }
}
