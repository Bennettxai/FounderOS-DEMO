import { z } from 'zod';
import { getBrainProvider } from '@/lib/brain';
import { createGBrainProvider } from '@/lib/connectors/gbrain';
import { parseInboxConfigs, unreadCounts } from '@/lib/connectors/email';
import { configuredProcessors, stripeSnapshot } from '@/lib/connectors/payments';
import { recentMessages } from '@/lib/connectors/slack';
import { recentPages } from '@/lib/connectors/notion';
import { zernioStatus } from '@/lib/connectors/zernio';
import { attioClients, attioStatus } from '@/lib/connectors/attio';
import { webinarjamStatus, listRegistrants } from '@/lib/connectors/webinarjam';
import { trakyoStatus } from '@/lib/connectors/trakyo';
import { arcadsStatus } from '@/lib/connectors/arcads';
import { whatsappStatus } from '@/lib/connectors/whatsapp';
import { wisprStatus } from '@/lib/connectors/wispr';
import { localStackStatus } from '@/lib/connectors/local-stack';
import { getDb } from '@/lib/data';
import type { LlmToolSpec } from '@/lib/connectors/llm';
import type { AgentRunResult, RuntimeAgent } from '@/lib/agents/runtime';

/**
 * The real agent roster. Every run() does actual work against a live system —
 * no seeded numbers. Agents whose connector lacks credentials fail honestly
 * with setup instructions instead of pretending.
 *
 * Top-level agents are instance slots: when the Mac mini is live each one
 * becomes its own OpenClaw Hermes / Claude Code process and respond() routes
 * to that instance instead of the builtin implementation.
 */

async function gmailRun(): Promise<AgentRunResult> {
  const inboxes = parseInboxConfigs(process.env);
  if (inboxes.length === 0) {
    return { ok: false, summary: 'No inboxes configured — set INBOX_1..4_HOST/_USER/_PASS in .env.local' };
  }
  const counts = await unreadCounts(process.env);
  const failed = counts.filter((c) => c.error);
  const total = counts.reduce((sum, c) => sum + c.unread, 0);
  return {
    ok: failed.length < counts.length,
    summary: counts
      .map((c) => `${c.inbox}: ${c.error ? `ERROR ${c.error.slice(0, 60)}` : `${c.unread} unread`}`)
      .join(' · ')
      .concat(` · total ${total} unread`),
    data: counts,
  };
}

async function whatsappRun(): Promise<AgentRunResult> {
  const status = await whatsappStatus();
  return { ok: status.state === 'connected', summary: status.detail, data: status.meta };
}

async function slackRun(): Promise<AgentRunResult> {
  if (!process.env.SLACK_BOT_TOKEN) {
    return { ok: false, summary: 'Slack not configured — set SLACK_BOT_TOKEN in .env.local' };
  }
  const messages = await recentMessages(10);
  return {
    ok: true,
    summary: `${messages.length} recent messages across ${new Set(messages.map((m) => m.channel)).size} channels`,
    data: messages,
  };
}

async function zernioRun(): Promise<AgentRunResult> {
  const status = await zernioStatus();
  return { ok: status.state === 'connected', summary: status.detail, data: status.meta };
}

async function arcadsRun(): Promise<AgentRunResult> {
  const status = await arcadsStatus();
  return { ok: status.state === 'connected', summary: status.detail, data: status.meta };
}

const label = (r: AgentRunResult) => (r.ok ? 'LIVE' : 'DOWN');

const envIntegrationRun =
  (name: string, envKey: string, purpose: string) =>
  async (): Promise<AgentRunResult> => {
    if (!process.env[envKey]) {
      return { ok: false, summary: `${name} not configured — set ${envKey} · ${purpose}` };
    }
    return { ok: true, summary: `${name} credential present · ${purpose}` };
  };

const plannedLaneRun =
  (name: string, detail: string) =>
  async (): Promise<AgentRunResult> => ({ ok: false, summary: `${name} lane planned — ${detail}` });

async function stripeSalesRun(): Promise<AgentRunResult> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { ok: false, summary: 'Stripe sales checks not configured — set STRIPE_SECRET_KEY in .env.local' };
  }
  const snapshot = await stripeSnapshot(process.env);
  return {
    ok: true,
    summary: `Stripe sales payments: ${snapshot.recentCharges.length} recent charges available for confirmation`,
    data: snapshot,
  };
}

async function processorConfirmationRun(): Promise<AgentRunResult> {
  const configured = configuredProcessors(process.env).filter((p) => p.configured);
  if (configured.length === 0) {
    return { ok: false, summary: 'No payment processor APIs configured yet — start with STRIPE_SECRET_KEY' };
  }
  return {
    ok: true,
    summary: `${configured.map((p) => p.name).join(', ')} configured for payment confirmation`,
    data: configured,
  };
}

export const realAgents: RuntimeAgent[] = [
  // ── Command ──────────────────────────────────────────────────────────
  {
    id: 'conductor',
    name: 'Conductor',
    description: 'Broadcast fan-out + instance host availability (OpenClaw gateway, Ollama, tmux) for future bindings.',
    departmentId: 'dept-tech',
    async run() {
      const stack = await localStackStatus();
      return {
        ok: stack.state === 'connected',
        summary: `Instance hosts on this machine: ${stack.detail} · all agents bound to builtin runtime until the Mac mini lands`,
        data: stack.meta,
      };
    },
  },

  // ── Comms instance + channel workers ─────────────────────────────────
  {
    id: 'comms-agent',
    name: 'Comms Agent',
    description: 'Aggregates the Gmail/WhatsApp/Slack workers that feed the unified /comms view.',
    departmentId: 'dept-comms',
    async run() {
      const [gmail, whatsapp, slack] = await Promise.all([gmailRun(), whatsappRun(), slackRun()]);
      const live = [gmail, whatsapp, slack].filter((r) => r.ok).length;
      return {
        ok: live > 0,
        summary: `${live}/3 channels live → /comms · Gmail ${label(gmail)} · WhatsApp ${label(whatsapp)} · Slack ${label(slack)}`,
        data: { gmail, whatsapp, slack },
      };
    },
  },
  { id: 'gmail-worker', name: 'Gmail Worker', description: 'Unread counts and recent mail from up to four IMAP inboxes.', departmentId: 'dept-comms', run: gmailRun },
  { id: 'whatsapp-worker', name: 'WhatsApp Worker', description: 'Local WhatsApp ChatStorage, read-only.', departmentId: 'dept-comms', run: whatsappRun },
  { id: 'slack-worker', name: 'Slack Worker', description: 'Latest messages across joined Slack channels.', departmentId: 'dept-comms', run: slackRun },

  // ── Studio instance + content workers ────────────────────────────────
  {
    id: 'social-agent',
    name: 'Social Agent',
    description: 'Aggregates the Zernio publishing and Arcads ad-generation workers.',
    departmentId: 'dept-marketing-growth',
    async run() {
      const [zernio, arcads] = await Promise.all([zernioRun(), arcadsRun()]);
      const live = [zernio, arcads].filter((r) => r.ok).length;
      const queued = getDb().socialPosts.queued().length;
      const queueNote = queued > 0 ? `${queued} post${queued === 1 ? '' : 's'} queued for publish` : 'no posts queued';
      return {
        ok: live > 0,
        summary: `${live}/2 core content APIs live · Zernio ${label(zernio)} · Arcads ${label(arcads)} · ${queueNote}`,
        data: { zernio, arcads, queuedPosts: queued },
      };
    },
  },
  { id: 'zernio-publisher', name: 'Zernio Publisher', description: 'Six platforms under @founderos.ai via Zernio.', departmentId: 'dept-marketing-growth', run: zernioRun },
  { id: 'arcads-creative', name: 'Arcads Creative', description: 'UGC ads for Vantage via the Arcads API.', departmentId: 'dept-marketing-growth', run: arcadsRun },
  {
    id: 'remotion-editor',
    name: 'Remotion Editor',
    description: 'Editing and rendering pipeline for social clips, captions, and promotional cuts.',
    departmentId: 'dept-marketing-growth',
    async run() {
      const stack = await localStackStatus();
      return {
        ok: stack.state === 'connected',
        summary: `Remotion/social editing lane mapped · local stack: ${stack.detail}`,
        data: stack.meta,
      };
    },
  },
  {
    id: 'higgsfield-creative',
    name: 'Higgsfield Creative',
    description: 'Higgsfield creative generation for campaign visuals and product assets.',
    departmentId: 'dept-marketing-growth',
    async run() {
      const stack = await localStackStatus();
      return {
        ok: stack.state === 'connected',
        summary: `Higgsfield creative lane mapped · local stack: ${stack.detail}`,
        data: stack.meta,
      };
    },
  },
  {
    id: 'manychat-mcp',
    name: 'ManyChat MCP',
    description: 'ManyChat MCP/API lane for social DM automations and lead capture.',
    departmentId: 'dept-marketing-growth',
    run: envIntegrationRun('ManyChat', 'MANYCHAT_API_KEY', 'DM automation and lead capture'),
  },

  // ── Sales instance + pipeline worker ─────────────────────────────────
  {
    id: 'sales-agent',
    name: 'Sales Agent',
    description: 'Aggregates the revenue pipeline workers for Sales.',
    departmentId: 'dept-sales',
    async run() {
      const [crm, processors] = await Promise.all([attioStatus(), processorConfirmationRun()]);
      return {
        ok: crm.state === 'connected' || processors.ok,
        summary: `Sales pipeline · Attio ${crm.state === 'connected' ? 'LIVE' : 'DOWN'} · processors ${label(processors)} · FanBasis/PAVA/calls lanes mapped`,
        data: { crm, processors },
      };
    },
  },
  {
    id: 'launchpad-cohort-sales',
    name: 'Launchpad Cohort',
    description:
      'Launchpad Cohort sales lane: WebinarJam funnel (registrants/attendees → leads), Trakyo revenue attribution, plus offer/call/payment context.',
    departmentId: 'dept-sales',
    async run() {
      const [webinar, trakyo] = await Promise.all([webinarjamStatus(), trakyoStatus()]);
      const live = [webinar, trakyo].filter((s) => s.state === 'connected').length;
      return {
        ok: live > 0,
        summary: `Launchpad Cohort · WebinarJam ${webinar.state} · Trakyo ${trakyo.state}${
          live === 0 ? ' — set WEBINARJAM_API_KEY to pull webinar leads' : ''
        }`,
        data: { webinar, trakyo },
      };
    },
    chatTools(): LlmToolSpec[] {
      return [
        {
          name: 'searchWebinarRegistrants',
          description:
            "List registrants/attendees for an Launchpad Cohort WebinarJam session (these are leads). Read-only. Needs the webinar's id and schedule id.",
          parameters: z.object({
            webinarId: z.string().describe('WebinarJam webinar_id'),
            scheduleId: z.string().describe('WebinarJam schedule_id for the session'),
          }),
          execute: async (args) => {
            const webinarId = typeof args.webinarId === 'string' ? args.webinarId : '';
            const scheduleId = typeof args.scheduleId === 'string' ? args.scheduleId : '';
            if (!webinarId || !scheduleId) return { error: 'webinarId and scheduleId are required' };
            const registrants = await listRegistrants(webinarId, scheduleId);
            return { count: registrants.length, registrants: registrants.slice(0, 25) };
          },
        },
      ];
    },
  },
  {
    id: 'vantage-sales',
    name: 'Vantage',
    description: 'Vantage sales lane: pipeline, FanBasis context, payments, and call data.',
    departmentId: 'dept-sales',
    run: plannedLaneRun('Vantage sales', 'connect Vantage-specific CRM/payment/call sources'),
  },
  {
    id: 'fanbasis-sales',
    name: 'FanBasis',
    description: 'FanBasis offer/payment/customer context for Sales.',
    departmentId: 'dept-sales',
    run: envIntegrationRun('FanBasis', 'FANBASIS_API_KEY', 'offers, customers, and payment context'),
  },
  {
    id: 'vantage-fanbasis',
    name: 'Vantage FanBasis',
    description: 'FanBasis lane specifically under Vantage.',
    departmentId: 'dept-sales',
    run: envIntegrationRun('Vantage FanBasis', 'FANBASIS_API_KEY', 'Vantage offer/payment context'),
  },
  { id: 'stripe-sales', name: 'Stripe', description: 'Stripe payment confirmation for sales workflows.', departmentId: 'dept-sales', run: stripeSalesRun },
  {
    id: 'processor-confirmation',
    name: 'Processor Confirm',
    description: 'Confirms payment states across configured processor APIs.',
    departmentId: 'dept-sales',
    run: processorConfirmationRun,
  },
  {
    id: 'pava-financing',
    name: 'PAVA Financing',
    description: 'PAVA financing options for offers and payment plans.',
    departmentId: 'dept-sales',
    run: envIntegrationRun('PAVA', 'PAVA_API_KEY', 'financing options for sales offers'),
  },
  {
    id: 'sales-calls-data',
    name: 'Sales Calls Data',
    description: 'Sales call recordings, notes, outcomes, and follow-up context.',
    departmentId: 'dept-sales',
    run: envIntegrationRun('Sales calls data', 'FATHOM_API_KEY', 'call recordings, summaries, and follow-up context'),
  },

  // ── Knowledge: the G-Brain analyst and its auditors ──────────────────
  {
    id: 'data-agent',
    name: 'Data Agent',
    description: 'Analyzes markdown + vector storage health and surfaces ideas; answers broadcasts by querying G-Brain.',
    departmentId: 'dept-tech',
    async run() {
      const overview = await createGBrainProvider().overview();
      const { store, doctor } = overview;
      const warnings = doctor.checks.filter((c) => c.status !== 'ok');
      const biggest = [...store.folders].sort((a, b) => b.files - a.files)[0];
      const inbox = store.folders.find((f) => f.name === 'inbox');

      const ideas: string[] = [];
      if (!doctor.connected) ideas.push('gbrain CLI unreachable — check the binary before trusting vector queries');
      if (doctor.connected && warnings.length > 0)
        ideas.push(`${warnings.length} doctor check(s) need attention (${warnings.map((w) => w.name).join(', ')})`);
      if (inbox && inbox.files > 3) ideas.push(`inbox/ holds ${inbox.files} unprocessed pages — file or archive them`);
      if (store.totalFiles < 50)
        ideas.push(`only ${store.totalFiles} pages on disk vs ~918 in Supabase — run \`gbrain export\` to restore locally`);
      if (ideas.length === 0) ideas.push('storage healthy — no action needed');

      return {
        ok: doctor.connected,
        summary: `${doctor.detail} · ${store.totalFiles} md pages (largest: ${biggest?.name ?? 'n/a'} ${biggest?.files ?? 0}) · ideas: ${ideas.join(' | ')}`,
        data: { overview, ideas },
      };
    },
    async respond(message: string) {
      const results = await getBrainProvider().search(message);
      if (results.length === 0) {
        return { ok: false, summary: `Nothing in G-Brain matches "${message.slice(0, 80)}"` };
      }
      return {
        ok: true,
        summary: results
          .slice(0, 3)
          .map((r) => `${r.title}: ${r.snippet.slice(0, 100)}`)
          .join(' · '),
        data: results,
      };
    },
    chatTools(): LlmToolSpec[] {
      return [
        {
          name: 'searchGBrain',
          description:
            'Search the G-Brain knowledge base (brain-store markdown + vector store) and return the top matching notes. Read-only.',
          parameters: z.object({ query: z.string().describe('what to look up in the knowledge base') }),
          execute: async (args) => {
            const query = typeof args.query === 'string' ? args.query : '';
            const results = await getBrainProvider().search(query);
            return results.slice(0, 5);
          },
        },
      ];
    },
  },
  {
    id: 'markdown-auditor',
    name: 'Markdown Auditor',
    description: 'Page counts per brain-store folder, strays at the root.',
    departmentId: 'dept-tech',
    async run() {
      const { store } = await createGBrainProvider().overview();
      if (store.totalFiles === 0) {
        return { ok: false, summary: `brain-store empty or unreadable at ${store.path}` };
      }
      const root = store.folders.find((f) => f.name === '(root)');
      return {
        ok: true,
        summary: `${store.totalFiles} pages across ${store.folders.length} folders${root ? ` · ${root.files} stray at root` : ''} · ${store.folders.map((f) => `${f.name}:${f.files}`).join(' ')}`,
        data: store,
      };
    },
  },
  {
    id: 'vector-auditor',
    name: 'Vector Auditor',
    description: 'gbrain doctor: Supabase pgvector connection, embeddings, health score.',
    departmentId: 'dept-tech',
    async run() {
      const { doctor } = await createGBrainProvider().overview();
      const warn = doctor.checks.filter((c) => c.status !== 'ok');
      return {
        ok: doctor.connected,
        summary: doctor.connected
          ? `health ${doctor.healthScore ?? '?'}/100 · ${doctor.checks.length} checks, ${warn.length} warning(s)${warn.length ? `: ${warn.map((w) => w.name).join(', ')}` : ''}`
          : `doctor offline — ${doctor.detail}`,
        data: doctor,
      };
    },
  },
  {
    id: 'notion-sync',
    name: 'Notion Sync',
    description: 'Lists the most recently edited Notion pages shared with the integration.',
    departmentId: 'dept-tech',
    async run() {
      if (!process.env.NOTION_API_KEY) {
        return { ok: false, summary: 'Notion not configured — set NOTION_API_KEY in .env.local' };
      }
      const pages = await recentPages(10);
      return {
        ok: true,
        summary: `${pages.length} recently edited pages · latest: ${pages[0]?.title ?? 'none'}`,
        data: pages,
      };
    },
  },

  // ── Finance ──────────────────────────────────────────────────────────
  {
    id: 'payments-pulse',
    name: 'Payments Pulse',
    description: 'Verifies payment processor connections and reports Stripe balance + recent charges.',
    departmentId: 'dept-finance',
    async run() {
      const configured = configuredProcessors(process.env).filter((p) => p.configured);
      if (configured.length === 0) {
        return { ok: false, summary: 'No payment processors configured — start with STRIPE_SECRET_KEY in .env.local' };
      }
      if (configured.some((p) => p.id === 'stripe')) {
        const snapshot = await stripeSnapshot(process.env);
        const available = snapshot.available[0];
        return {
          ok: true,
          summary: `Stripe: ${((available?.amount ?? 0) / 100).toFixed(2)} ${(available?.currency ?? 'usd').toUpperCase()} available · ${snapshot.recentCharges.length} recent charges`,
          data: snapshot,
        };
      }
      return { ok: true, summary: `${configured.map((p) => p.name).join(', ')} configured (no live client yet)` };
    },
  },
  {
    id: 'crm-pulse',
    name: 'Attio CRM',
    description: 'Queries the Attio deals pipeline (Vantage + Launchpad Cohort). Read-scoped.',
    departmentId: 'dept-sales',
    async run() {
      const status = await attioStatus();
      return { ok: status.state === 'connected', summary: status.detail, data: status.meta };
    },
  },

  // ── Clients ──────────────────────────────────────────────────────────
  {
    id: 'client-roster',
    name: 'Client Roster',
    description: 'The live client list: funnel journeys reconciled with Attio, counted by venture and status.',
    departmentId: 'dept-clients',
    async run() {
      const db = getDb();
      const journeys = db.funnel.journeys();
      const converted = journeys.filter((j) => j.status === 'converted');
      const live = await attioClients();
      const servingAttio = live.state === 'connected' && live.clients.length > 0;
      const byVenture = new Map<string, number>();
      for (const j of converted) byVenture.set(j.venture, (byVenture.get(j.venture) ?? 0) + 1);
      const ventures = [...byVenture.entries()].map(([v, n]) => `${v} ${n}`).join(' · ') || 'none yet';
      return {
        ok: true,
        summary: servingAttio
          ? `Serving Attio live: ${live.clients.length} deals on the roster · funnel backup holds ${converted.length} clients`
          : `Serving seeded funnel: ${converted.length} clients (${ventures}) · ${journeys.length - converted.length} in pipeline · Attio ${live.state}`,
        data: {
          source: servingAttio ? 'attio' : 'funnel',
          attio: { state: live.state, deals: live.clients.length },
          clients: converted.map((j) => ({ id: j.id, name: j.name, venture: j.venture, amountUsd: j.amountUsd })),
        },
      };
    },
  },
  {
    id: 'client-onboarding',
    name: 'Onboarding Agent',
    description: 'Readiness check for the onboarding SOP: the Attio trigger plus the Slack and Notion workspaces it provisions.',
    departmentId: 'dept-clients',
    async run() {
      const { slackStatus } = await import('@/lib/connectors/slack');
      const { notionStatus } = await import('@/lib/connectors/notion');
      const [attio, slack, notion] = await Promise.all([attioStatus(), slackStatus(), notionStatus()]);
      const live = [attio, slack, notion].filter((s) => s.state === 'connected').length;
      return {
        ok: live > 0,
        summary: `Onboarding rails: Attio ${attio.state} · Slack ${slack.state} · Notion ${notion.state}${
          live < 3 ? ' — connect the missing rail to run onboarding end to end' : ''
        }`,
        data: { attio: attio.state, slack: slack.state, notion: notion.state },
      };
    },
  },
  {
    id: 'client-success',
    name: 'Client Success',
    description: 'Servicing rails: Fathom call notes for deliverable tracking plus Slack for the check-in cadence.',
    departmentId: 'dept-clients',
    async run() {
      const { slackStatus } = await import('@/lib/connectors/slack');
      const slack = await slackStatus();
      const fathom = process.env.FATHOM_API_KEY ? 'configured' : 'not_configured';
      const live = (slack.state === 'connected' ? 1 : 0) + (fathom === 'configured' ? 1 : 0);
      return {
        ok: live > 0,
        summary: `Servicing rails: Fathom ${fathom} · Slack ${slack.state}${
          live === 0 ? ' — set FATHOM_API_KEY and a Slack bot token to service clients' : ''
        }`,
        data: { fathom, slack: slack.state },
      };
    },
  },

  // ── Automations ──────────────────────────────────────────────────────
  {
    id: 'stack-monitor',
    name: 'Stack Monitor',
    description: 'Live check of the local creative/infra stack: Remotion, Ollama, command-center, OpenClaw, tmux, whisper, ffmpeg, higgsfield, gh.',
    departmentId: 'dept-tech',
    async run() {
      const [stack, wispr] = await Promise.all([localStackStatus(), wisprStatus()]);
      return {
        ok: stack.state === 'connected',
        summary: `${stack.detail} · Wispr: ${wispr.state === 'connected' ? wispr.detail : wispr.state}`,
        data: { stack: stack.meta, wispr: wispr.meta },
      };
    },
  },
];
