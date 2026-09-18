import { z } from 'zod';
import { getBrainProvider } from '@/lib/brain';
import { createGBrainProvider, readStoreNotes } from '@/lib/connectors/gbrain';
import { auditBrainStore } from '@/lib/brain-audit';
import { parseInboxConfigs, unreadCounts } from '@/lib/connectors/email';
import { configuredProcessors, stripeSnapshot } from '@/lib/connectors/payments';
import { recentMessages } from '@/lib/connectors/slack';
import { zernioStatus } from '@/lib/connectors/zernio';
import { attioClients, attioStatus } from '@/lib/connectors/attio';
import { trakyoStatus } from '@/lib/connectors/trakyo';
import { arcadsStatus } from '@/lib/connectors/arcads';
import { whatsappStatus } from '@/lib/connectors/whatsapp';
import { wisprStatus } from '@/lib/connectors/wispr';
import { localStackStatus } from '@/lib/connectors/local-stack';
import { getDb } from '@/lib/data';
import type { LlmToolSpec } from '@/lib/connectors/llm';
import type { AgentRunResult, RuntimeAgent } from '@/lib/agents/runtime';
import { brandDealAgent } from '@/lib/agents/brand-deal-agent';
import { newsletterAgent } from '@/lib/agents/newsletter-agent';

/**
 * The real agent roster. Every run() does actual work against a live system —
 * no seeded numbers. Agents whose connector lacks credentials fail honestly
 * with setup instructions instead of pretending.
 *
 * Top-level agents are instance slots: when the dedicated host is live each one
 * becomes its own Clawline Hermes / Claude Code process and respond() routes
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
  brandDealAgent,
  newsletterAgent,
  // ── Command ──────────────────────────────────────────────────────────
  {
    id: 'conductor',
    name: 'Conductor',
    description: 'Broadcast fan-out + instance host availability (Clawline gateway, Ollama, tmux) for future bindings.',
    departmentId: 'dept-tech',
    async run() {
      const stack = await localStackStatus();
      return {
        ok: stack.state === 'connected',
        summary: `Instance hosts on this machine: ${stack.detail} · all agents bound to builtin runtime until the dedicated host lands`,
        data: stack.meta,
      };
    },
  },

  // ── Comms instance + channel workers ─────────────────────────────────
  {
    id: 'comms-digest',
    name: 'Comms Digest',
    description:
      'The 9am report: scrapes the last 24h across all four inboxes, WhatsApp and Slack, and ranks who Alex needs to respond to — calls first, then clients, students and family, brand deals, group chats, companies last. Also lists what to unsubscribe from.',
    departmentId: 'dept-comms',
    async run(): Promise<AgentRunResult> {
      const { runAndStoreCommsDigest, digestSummary } = await import('@/lib/comms-digest-run');
      const result = await runAndStoreCommsDigest();
      // ok only when at least one channel answered — an all-dead run is a
      // failure worth seeing in the cron stats, not a cheerful empty report
      const ok = result.sources.some((s) => s.ok);
      return { ok, summary: digestSummary(result), data: result };
    },
  },
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
    description: 'Aggregates the Postly publishing and Adsmith ad-generation workers.',
    departmentId: 'dept-marketing-growth',
    async run() {
      const [zernio, arcads] = await Promise.all([zernioRun(), arcadsRun()]);
      const live = [zernio, arcads].filter((r) => r.ok).length;
      const queued = getDb().socialPosts.queued().length;
      const queueNote = queued > 0 ? `${queued} post${queued === 1 ? '' : 's'} queued for publish` : 'no posts queued';
      return {
        ok: live > 0,
        summary: `${live}/2 core content APIs live · Postly ${label(zernio)} · Adsmith ${label(arcads)} · ${queueNote}`,
        data: { zernio, arcads, queuedPosts: queued },
      };
    },
  },
  { id: 'postly-publisher', name: 'Postly Publisher', description: 'Six platforms under @alexx.ai via Postly.', departmentId: 'dept-marketing-growth', run: zernioRun },
  { id: 'adsmith-creative', name: 'Adsmith Creative', description: 'UGC ads for Vantage via the Adsmith API.', departmentId: 'dept-marketing-growth', run: arcadsRun },
  {
    id: 'reelkit-editor',
    name: 'Reelkit Editor',
    description: 'Editing and rendering pipeline for social clips, captions, and promotional cuts.',
    departmentId: 'dept-marketing-growth',
    async run() {
      const stack = await localStackStatus();
      return {
        ok: stack.state === 'connected',
        summary: `Reelkit/social editing lane mapped · local stack: ${stack.detail}`,
        data: stack.meta,
      };
    },
  },
  {
    id: 'renderly-creative',
    name: 'Renderly Creative',
    description: 'Renderly creative generation for campaign visuals and product assets.',
    departmentId: 'dept-marketing-growth',
    async run() {
      const stack = await localStackStatus();
      return {
        ok: stack.state === 'connected',
        summary: `Renderly creative lane mapped · local stack: ${stack.detail}`,
        data: stack.meta,
      };
    },
  },
  {
    id: 'dmflow-mcp',
    name: 'DMFlow MCP',
    description: 'DMFlow MCP/API lane for social DM automations and lead capture.',
    departmentId: 'dept-marketing-growth',
    run: envIntegrationRun('DMFlow', 'MANYCHAT_API_KEY', 'DM automation and lead capture'),
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
        summary: `Sales pipeline · Ledger ${crm.state === 'connected' ? 'LIVE' : 'DOWN'} · processors ${label(processors)} · PayKit/FlexPay/calls lanes mapped`,
        data: { crm, processors },
      };
    },
  },
  {
    id: 'launchpad-cohort-sales',
    name: 'Launchpad Cohort',
    // The webinar funnel is retired, so this lane runs on
    // Trakyo attribution alone.
    description:
      'Launchpad Cohort sales lane: Trakyo revenue attribution, plus offer/call/payment context.',
    departmentId: 'dept-sales',
    async run() {
      const trakyo = await trakyoStatus();
      const live = trakyo.state === 'connected';
      return {
        ok: live,
        summary: `Launchpad Cohort · Trakyo ${trakyo.state}${
          live ? '' : ' — no live attribution source for this lane'
        }`,
        data: { trakyo },
      };
    },
  },
  {
    id: 'vantage-sales',
    name: 'Vantage',
    description: 'Vantage sales lane: pipeline, PayKit context, payments, and call data.',
    departmentId: 'dept-sales',
    run: plannedLaneRun('Vantage sales', 'connect Vantage-specific CRM/payment/call sources'),
  },
  {
    id: 'paykit-sales',
    name: 'PayKit',
    description: 'PayKit offer/payment/customer context for Sales.',
    departmentId: 'dept-sales',
    run: envIntegrationRun('PayKit', 'PAYKIT_API_KEY', 'offers, customers, and payment context'),
  },
  {
    id: 'vantage-paykit',
    name: 'Vantage PayKit',
    description: 'PayKit lane specifically under Vantage.',
    departmentId: 'dept-sales',
    run: envIntegrationRun('Vantage PayKit', 'PAYKIT_API_KEY', 'Vantage offer/payment context'),
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
    id: 'flexpay-financing',
    name: 'FlexPay Financing',
    description: 'FlexPay financing options for offers and payment plans.',
    departmentId: 'dept-sales',
    run: envIntegrationRun('FlexPay', 'FLEXPAY_API_KEY', 'financing options for sales offers'),
  },
  {
    id: 'sales-calls-data',
    name: 'Sales Calls Data',
    description: 'Sales call recordings, notes, outcomes, and follow-up context: Recall on the calls, Plaud in the room.',
    departmentId: 'dept-sales',
    async run() {
      const { plaudStatus } = await import('@/lib/connectors/plaud');
      const { ingestPlaudNow } = await import('@/lib/plaud-ingest');
      const { getDb } = await import('@/lib/data');
      const fathom = process.env.FATHOM_API_KEY ? 'configured' : 'not_configured';
      const plaud = await plaudStatus();
      const recordings = plaud.state === 'connected' ? Number(plaud.meta?.recordings ?? 0) : 0;
      const live = (fathom === 'configured' ? 1 : 0) + (plaud.state === 'connected' ? 1 : 0);
      // The actual work: file every newly transcribed Plaud recording into the
      // brain. Pure code (Plaud did the transcribing + summarising), so this is
      // safe to run on a 30-minute cron without touching an LLM seat.
      const ingest = plaud.state === 'connected' ? await ingestPlaudNow(getDb()) : null;
      const filed = ingest?.ingested.length ?? 0;
      const waiting = ingest?.skipped.notTranscribed.length ?? 0;
      const inBrain = ingest ? ingest.skipped.alreadyIngested.length + filed : 0;
      const failed = ingest?.failed.length ?? 0;
      return {
        ok: live > 0 && failed === 0,
        summary: `Recorders: Recall ${fathom} · Plaud ${plaud.state}${
          plaud.state === 'connected'
            ? ` (${recordings} recording${recordings === 1 ? '' : 's'}, ${inBrain} in brain, ${filed} filed this pass, ${waiting} awaiting transcription${
                ingest?.claims ? `, ${ingest.claims} claims to OptimalEngine` : ''
              }${failed ? `, ${failed} FAILED: ${ingest?.failed.map((f) => f.error).join('; ')}` : ''})`
            : ''
        }${live === 0 ? ' — set FATHOM_API_KEY and PLAUD_REFRESH_TOKEN to capture calls and in-person meetings' : ''}`,
        data: { fathom, plaud: plaud.state, recordings, filed, inBrain, waiting, failed, claims: ingest?.claims ?? 0 },
      };
    },
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
  },
  {
    id: 'markdown-auditor',
    name: 'Markdown Auditor',
    description: 'Link health, orphans, duplicate titles and store-vs-index drift across the knowledge base.',
    departmentId: 'dept-tech',
    async run() {
      // It counted files until and reported green while the index
      // held Links: 0 on 1,038 pages. Counting is not auditing: this reads the
      // links, and compares the folder against the index search actually uses.
      const provider = createGBrainProvider();
      const notes = readStoreNotes();
      const stats = await provider.stats().catch(() => null);
      const audit = auditBrainStore(notes, { stats });

      const errors = audit.findings.filter((f) => f.severity === 'err');
      return {
        ok: errors.length === 0 && audit.pages > 0,
        summary: errors.length > 0 ? `${audit.summary} · ${errors.map((f) => f.detail).join(' | ')}` : audit.summary,
        data: audit,
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
    name: 'Ledger CRM',
    description: 'Queries the Ledger deals pipeline (Vantage + Launchpad Cohort). Read-scoped.',
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
    description: 'The live client list: funnel journeys reconciled with Ledger, counted by venture and status.',
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
          ? `Serving Ledger live: ${live.clients.length} deals on the roster · funnel backup holds ${converted.length} clients`
          : `Serving seeded funnel: ${converted.length} clients (${ventures}) · ${journeys.length - converted.length} in pipeline · Ledger ${live.state}`,
        data: {
          source: servingAttio ? 'ledger' : 'funnel',
          attio: { state: live.state, deals: live.clients.length },
          clients: converted.map((j) => ({ id: j.id, name: j.name, venture: j.venture, amountUsd: j.amountUsd })),
        },
      };
    },
  },
  {
    id: 'client-onboarding',
    name: 'Onboarding Agent',
    // Notion was the third rail here until it was retired; the
    // onboarding SOP no longer provisions a Notion workspace.
    description: 'Readiness check for the onboarding SOP: the Ledger trigger plus the Slack workspace it provisions.',
    departmentId: 'dept-clients',
    async run() {
      const { slackStatus } = await import('@/lib/connectors/slack');
      const [attio, slack] = await Promise.all([attioStatus(), slackStatus()]);
      const live = [attio, slack].filter((s) => s.state === 'connected').length;
      return {
        ok: live > 0,
        summary: `Onboarding rails: Ledger ${attio.state} · Slack ${slack.state}${
          live < 2 ? ' — connect the missing rail to run onboarding end to end' : ''
        }`,
        data: { attio: attio.state, slack: slack.state },
      };
    },
  },
  {
    id: 'client-success',
    name: 'Client Success',
    description: 'Servicing rails: Recall call notes and Plaud in-person recordings for deliverable tracking plus Slack for the check-in cadence.',
    departmentId: 'dept-clients',
    async run() {
      const { slackStatus } = await import('@/lib/connectors/slack');
      const { plaudConfigured } = await import('@/lib/connectors/plaud');
      const slack = await slackStatus();
      const fathom = process.env.FATHOM_API_KEY ? 'configured' : 'not_configured';
      const plaud = plaudConfigured() ? 'configured' : 'not_configured';
      const live = (slack.state === 'connected' ? 1 : 0) + (fathom === 'configured' ? 1 : 0) + (plaud === 'configured' ? 1 : 0);
      return {
        ok: live > 0,
        summary: `Servicing rails: Recall ${fathom} · Plaud ${plaud} · Slack ${slack.state}${
          live === 0 ? ' — set FATHOM_API_KEY, PLAUD_REFRESH_TOKEN and a Slack bot token to service clients' : ''
        }`,
        data: { fathom, plaud, slack: slack.state },
      };
    },
  },

  // ── Automations ──────────────────────────────────────────────────────
  {
    id: 'stack-monitor',
    name: 'Stack Monitor',
    description: 'Live check of the local creative/infra stack: Reelkit, Ollama, command-center, Clawline, tmux, whisper, ffmpeg, renderly, gh.',
    departmentId: 'dept-tech',
    async run() {
      const [stack, wispr] = await Promise.all([localStackStatus(), wisprStatus()]);
      return {
        ok: stack.state === 'connected',
        summary: `${stack.detail} · Dictate: ${wispr.state === 'connected' ? wispr.detail : wispr.state}`,
        data: { stack: stack.meta, wispr: wispr.meta },
      };
    },
  },
];
