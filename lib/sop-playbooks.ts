import { z } from 'zod';
import type { SopTask } from '@/lib/schemas';

/**
 * SOP playbooks — the rich breakdown behind each SOP task card in the /brain
 * knowledge graph. demo-first, real-ready: a repo-level lookup keyed by task id,
 * so it can later be swapped for engine/DB-backed data without touching the card.
 *
 * Each SOP decomposes into sub-skills (BREAKS INTO), stands on upstream work
 * (BUILDS ON), states what it displaces (WHAT IT REPLACES), and carries the
 * autonomy ladder (human-led → human-assisted → fully-autonomous), the human's
 * role, build notes, a runnable skill file, and a build status. Skill file
 * bodies are generated dummy SKILL.md for now (Alex: "dummy data for the
 * skills for now").
 */

export const AUTONOMY_LEVELS = ['human-led', 'human-assisted', 'fully-autonomous'] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

export const PLAYBOOK_STATUSES = ['not-started', 'in-development', 'ready-to-run'] as const;
export type PlaybookStatus = (typeof PLAYBOOK_STATUSES)[number];

export const SopPlaybookSchema = z.object({
  autonomy: z.enum(AUTONOMY_LEVELS),
  categoryPath: z.string().min(1),
  description: z.string().min(1),
  breaksInto: z.array(z.string().min(1)).min(1),
  buildsOn: z.array(z.string().min(1)),
  replaces: z.string().min(1),
  ladder: z.object({
    humanLed: z.string().min(1),
    humanAssisted: z.string().min(1),
    fullyAutonomous: z.string().min(1),
  }),
  theHuman: z.string().min(1),
  buildNotes: z.string().min(1),
  skill: z.object({
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    blurb: z.string().min(1),
  }),
  status: z.enum(PLAYBOOK_STATUSES),
});
export type SopPlaybook = z.infer<typeof SopPlaybookSchema>;

/** A playbook plus the generated runnable skill file, ready for the card. */
export type ResolvedPlaybook = SopPlaybook & { skillMarkdown: string };

const AUTONOMY_LABEL: Record<AutonomyLevel, string> = {
  'human-led': 'HUMAN-LED',
  'human-assisted': 'HUMAN-ASSISTED',
  'fully-autonomous': 'FULLY AUTONOMOUS',
};
export function autonomyLabel(level: AutonomyLevel): string {
  return AUTONOMY_LABEL[level];
}

const STATUS_LABEL: Record<PlaybookStatus, string> = {
  'not-started': 'NOT STARTED',
  'in-development': 'IN DEVELOPMENT',
  'ready-to-run': 'READY TO RUN',
};
export function statusLabel(status: PlaybookStatus): string {
  return STATUS_LABEL[status];
}

// slug -> playbook. One authored entry per seeded SOP (35 total).
const PLAYBOOKS: Record<string, SopPlaybook> = {
  // ── TECH ────────────────────────────────────────────────────────────────
  'sop-conductor': {
    autonomy: 'fully-autonomous',
    categoryPath: 'TECH · Fleet Orchestration',
    description: 'Fan one directive out to every agent, collect the replies, and surface non-responders.',
    breaksInto: ['target-resolver', 'fan-out-dispatch', 'reply-collector'],
    buildsOn: ['Agent Registry', 'Instance Health'],
    replaces: "A $90-120k/year ops lead standing over Slack repeating the same instruction to twelve people.",
    ladder: {
      humanLed: 'You DM each agent the directive and chase replies by hand.',
      humanAssisted: 'The conductor drafts the broadcast and target list; you press send.',
      fullyAutonomous: 'It resolves the targets, fans out, stamps every send, and reports who went dark.',
    },
    theHuman: 'You write the directive and decide who it reaches. The conductor owns delivery and accountability.',
    buildNotes: "Targeting is the whole game: resolve 'the fleet' vs a single pillar before dispatch. Never fail silently, a non-responder after 60s is a report, not a shrug.",
    skill: { name: 'Fleet Broadcaster', slug: 'fleet-broadcaster', blurb: 'Fans a directive out to the whole fleet or one pillar, stamps every send, and reports non-responders.' },
    status: 'ready-to-run',
  },
  'sop-data-agent': {
    autonomy: 'fully-autonomous',
    categoryPath: 'TECH · Knowledge Retrieval',
    description: 'Hybrid search over the second brain with cited passages and honest fallbacks.',
    breaksInto: ['query-parser', 'hybrid-search', 'passage-ranker'],
    buildsOn: ['Vector Index', 'brain-store Sync'],
    replaces: "A $70k/year knowledge manager everyone pings on Slack for 'where's that doc?'",
    ladder: {
      humanLed: 'You grep the brain-store yourself and hope you remember the filename.',
      humanAssisted: 'It returns candidate passages; you decide which actually answer.',
      fullyAutonomous: "It parses, searches, ranks, and returns only cited passages, logging gaps it can't answer.",
    },
    theHuman: 'You own what counts as truth. It never invents a citation and files what it cannot answer as a gap.',
    buildNotes: 'Never invent a source: cited-or-nothing. When Supabase is paused, fall back to local grep instead of failing.',
    skill: { name: 'G-Brain Answerer', slug: 'gbrain-answerer', blurb: 'Hybrid-searches the second brain and returns cited passages, never invented ones.' },
    status: 'ready-to-run',
  },
  'sop-markdown-auditor': {
    autonomy: 'fully-autonomous',
    categoryPath: 'TECH · Knowledge Hygiene',
    description: 'Walk the brain-store, flag broken links and stale docs, and track fix-ups to done.',
    breaksInto: ['link-checker', 'orphan-finder', 'frontmatter-linter'],
    buildsOn: ['brain-store Sync'],
    replaces: 'A part-time knowledge-base janitor that never keeps up.',
    ladder: {
      humanLed: 'You notice broken links only when something 404s in front of a client.',
      humanAssisted: 'It lists the broken links and orphans; you triage.',
      fullyAutonomous: 'It walks every file, scores each folder, and tracks fix-ups to done.',
    },
    theHuman: "You set what 'healthy' means. It enforces the rules and reports the score.",
    buildNotes: "Per-folder scores beat one global number. Track the worst offenders to done, don't just flag them.",
    skill: { name: 'Markdown Auditor', slug: 'markdown-auditor', blurb: 'Walks brain-store, flags broken wiki-links and stale frontmatter, and scores each folder.' },
    status: 'in-development',
  },
  'sop-vector-auditor': {
    autonomy: 'fully-autonomous',
    categoryPath: 'TECH · Index Integrity',
    description: 'Keep pgvector embeddings mirroring brain-store, re-embedding on drift.',
    breaksInto: ['db-waker', 'chunk-differ', 'reembed-trigger'],
    buildsOn: ['brain-store Sync', 'Supabase Project'],
    replaces: 'A data engineer babysitting embedding jobs by hand.',
    ladder: {
      humanLed: 'You assume the index is fine until search quietly returns nothing.',
      humanAssisted: 'It reports chunk drift; you kick off re-embeds.',
      fullyAutonomous: 'It wakes the paused DB, diffs counts, re-embeds drifted docs, and verifies after.',
    },
    theHuman: 'You decide the drift tolerance. It wakes, compares, and heals the index within it.',
    buildNotes: "Free-tier Supabase pauses on idle: wake it and wait for queries before comparing, or you'll read a false zero.",
    skill: { name: 'Vector Index Auditor', slug: 'vector-index-auditor', blurb: 'Diffs pgvector chunk counts against brain-store and triggers re-embeds on drift.' },
    status: 'in-development',
  },
  'sop-notion-sync': {
    autonomy: 'fully-autonomous',
    categoryPath: 'TECH · Source Sync',
    description: 'Pull shared Notion pages into the knowledge core as normalized markdown.',
    breaksInto: ['page-differ', 'block-normalizer', 'core-indexer'],
    buildsOn: ['Notion Integration Token'],
    replaces: 'Copy-pasting Notion docs into the knowledge base by hand.',
    ladder: {
      humanLed: 'You export Notion pages manually when you remember they changed.',
      humanAssisted: 'It flags changed pages; you pull them.',
      fullyAutonomous: 'It diffs, pulls deltas, normalizes to markdown, and records the sync watermark.',
    },
    theHuman: 'You choose which pages the token can see. It keeps them mirrored.',
    buildNotes: 'Watermark every sync so the next run only pulls deltas. Normalize blocks to clean markdown before indexing.',
    skill: { name: 'Notion Mirror', slug: 'notion-mirror', blurb: 'Diffs shared Notion pages and mirrors changed blocks into the knowledge core.' },
    status: 'not-started',
  },
  'sop-stack-monitor': {
    autonomy: 'fully-autonomous',
    categoryPath: 'TECH · Infra Monitoring',
    description: 'Honest up/down for every port, tmux session, and required binary.',
    breaksInto: ['port-prober', 'session-checker', 'flap-detector'],
    buildsOn: [],
    replaces: 'An SRE refreshing a terminal to see if the stack is up.',
    ladder: {
      humanLed: 'You find out a service is down when something breaks downstream.',
      humanAssisted: 'It reports current status; you compare against last time.',
      fullyAutonomous: 'It probes, records honest status, catches flapping, and alerts on a fall.',
    },
    theHuman: "You decide what 'up' requires. It reports the truth, never a fake green.",
    buildNotes: 'Never fake connected. Compare against the last sweep to catch flapping, and alert only on a real state change.',
    skill: { name: 'Local Stack Watch', slug: 'local-stack-watch', blurb: 'Probes ports, tmux sessions and binaries, reporting honest status and flaps.' },
    status: 'ready-to-run',
  },

  // ── COMMUNICATIONS ────────────────────────────────────────────────────────
  'sop-comms-agent': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Communications · Feed Composition',
    description: 'Merge Gmail, WhatsApp and Slack into one ordered, tiered timeline.',
    breaksInto: ['channel-collector', 'timeline-merger', 'urgency-ranker'],
    buildsOn: ['Gmail Triage', 'WhatsApp Monitor', 'Slack Digest'],
    replaces: 'You bouncing between four apps trying to remember who needs a reply.',
    ladder: {
      humanLed: 'You open every app separately and hold the priority in your head.',
      humanAssisted: "It merges the channels; you decide what's urgent.",
      fullyAutonomous: 'It collects, dedupes, tiers by contact, and floats reply-needed to the top.',
    },
    theHuman: 'You act on the feed. It makes sure nothing worth acting on is buried.',
    buildNotes: 'Dedupe across channels before merging. Contact tier drives the sort, not just the timestamp.',
    skill: { name: 'Unified Feed Composer', slug: 'unified-feed-composer', blurb: 'Merges three channels into one tiered timeline with urgent items on top.' },
    status: 'ready-to-run',
  },
  'sop-gmail-worker': {
    autonomy: 'human-assisted',
    categoryPath: 'Communications · Email Triage',
    description: 'Read all four inboxes, classify every thread, and draft replies in your voice.',
    breaksInto: ['imap-reader', 'thread-classifier', 'reply-drafter'],
    buildsOn: ['IMAP Credentials', 'Voice Profile'],
    replaces: 'A $45-55k/year EA triaging your inbox every morning.',
    ladder: {
      humanLed: 'You read all four inboxes yourself and forget which you answered.',
      humanAssisted: 'It classifies threads and drafts replies; you approve before send.',
      fullyAutonomous: 'It clears FYI and waiting-on-us, escalating only what needs your judgment.',
    },
    theHuman: 'You approve every send. It never fires a reply on a real thread without your yes.',
    buildNotes: 'Voice is everything: drafts read from your tone file or they sound like a bot. Client-domain threads also route to the Clients pillar.',
    skill: { name: 'Inbox Triage', slug: 'inbox-triage', blurb: 'Classifies threads across four inboxes and drafts replies in your voice for approval.' },
    status: 'in-development',
  },
  'sop-whatsapp-worker': {
    autonomy: 'human-assisted',
    categoryPath: 'Communications · Chat Monitoring',
    description: 'Read 600+ local chats and surface LC + Vantage team messages with money/deadline flags.',
    breaksInto: ['local-reader', 'sender-tagger', 'risk-flagger'],
    buildsOn: ['Full Disk Access'],
    replaces: "Scrolling 600 chats hoping you didn't miss a client asking a question.",
    ladder: {
      humanLed: 'You scroll WhatsApp and hope nothing important scrolled past.',
      humanAssisted: 'It surfaces team chats and flags money/deadlines; you respond.',
      fullyAutonomous: 'It reads, tags senders, flags risk, and pushes only what matters to the feed.',
    },
    theHuman: 'You reply to people. It makes sure the message that mattered did not get buried under 600 others.',
    buildNotes: 'Read-only, nothing leaves the machine. The read needs Full Disk Access or it hangs, so bound it in a child process.',
    skill: { name: 'WhatsApp Watcher', slug: 'whatsapp-watcher', blurb: 'Reads local WhatsApp storage read-only and surfaces flagged team messages.' },
    status: 'in-development',
  },
  'sop-slack-worker': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Communications · Slack Digest',
    description: 'Summarize every joined channel and separate out mentions and open questions.',
    breaksInto: ['channel-lister', 'digest-writer', 'mention-extractor'],
    buildsOn: ['Slack Bot Token'],
    replaces: 'Reading every channel to find the two messages that needed you.',
    ladder: {
      humanLed: 'You read every channel to find the one that needed you.',
      humanAssisted: 'It digests each channel; you scan the summaries.',
      fullyAutonomous: 'It digests, calls out direct mentions and unanswered questions, and pushes to the feed.',
    },
    theHuman: 'You answer the mentions. It makes sure you see them.',
    buildNotes: 'Separate mentions and unanswered questions from the general digest, they need action, not just awareness.',
    skill: { name: 'Slack Digester', slug: 'slack-digester', blurb: 'Summarizes joined channels and flags mentions and unanswered questions.' },
    status: 'not-started',
  },

  // ── MARKETING / GROWTH ────────────────────────────────────────────────────
  'sop-social-agent': {
    autonomy: 'human-assisted',
    categoryPath: 'Marketing · Content Pipeline',
    description: 'Calendar to briefs to assets to publish queue, gated by an editorial approval.',
    breaksInto: ['calendar-reader', 'creative-briefer', 'asset-qa'],
    buildsOn: ['Content Calendar', 'Brand Voice'],
    replaces: 'A $4-6k/month content coordinator chasing creators for assets.',
    ladder: {
      humanLed: 'You brief creators one by one and assemble the queue manually.',
      humanAssisted: 'It briefs the creative workers and QAs assets; you approve the drop.',
      fullyAutonomous: 'It runs calendar to queue, rejecting off-brand takes with a reason.',
    },
    theHuman: 'Nadia Kapoor approves every drop. The pipeline fills the queue; the human opens the gate.',
    buildNotes: "Reject off-brand with a one-line reason so the fix is fast. Log what shipped so tomorrow's brief starts warm.",
    skill: { name: 'Content Pipeline Runner', slug: 'content-pipeline-runner', blurb: 'Turns the calendar into briefs, QAs returned assets, and queues approved posts.' },
    status: 'in-development',
  },
  'sop-postly-publisher': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Marketing · Cross-Platform Publishing',
    description: 'One queue out to every @alexx.ai surface with per-platform captions.',
    breaksInto: ['caption-adapter', 'multi-publish', 'post-verifier'],
    buildsOn: ['Content Pipeline Runner', 'Postly API'],
    replaces: 'Manually reposting the same clip to six apps with tweaked captions.',
    ladder: {
      humanLed: 'You upload to each platform by hand and rewrite the caption six times.',
      humanAssisted: 'It adapts captions and posts; you confirm each went live.',
      fullyAutonomous: 'It publishes to all six, verifies, and retries failures once before flagging.',
    },
    theHuman: 'You approve the post upstream. Publishing is fully mechanical from there.',
    buildNotes: 'Adapt captions per platform (IG/TikTok/X/YouTube/LinkedIn/FB). Verify each post id landed, retry once, then flag.',
    skill: { name: 'Six-Platform Publisher', slug: 'six-platform-publisher', blurb: 'Adapts a caption per platform, publishes via Postly, and verifies each went live.' },
    status: 'ready-to-run',
  },
  'sop-adsmith-creative': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Marketing · UGC Creative',
    description: 'Vantage ad angles rendered as UGC actors across Veo, Sora and Kling.',
    breaksInto: ['actor-generator', 'take-culler', 'variant-sheet'],
    buildsOn: ['Ad Brief'],
    replaces: 'A $2-3k UGC shoot per batch of ad angles.',
    ladder: {
      humanLed: 'You hire creators and wait a week per batch of angles.',
      humanAssisted: 'It generates actor takes; you pick the finals.',
      fullyAutonomous: 'It generates, culls off-brief takes, renders finals, and ships a variant sheet.',
    },
    theHuman: 'You own the hook and offer. It produces the variations to test them.',
    buildNotes: "Cull takes that break the brief BEFORE rendering finals, that's where the compute cost is. Name finals by angle.",
    skill: { name: 'UGC Variant Generator', slug: 'ugc-variant-generator', blurb: 'Renders ad angles as UGC actor variants and delivers a labeled variant sheet.' },
    status: 'in-development',
  },
  'sop-reelkit-editor': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Marketing · Short-Form Editing',
    description: 'Raw footage to platform-ready crops with captions landing on beat.',
    breaksInto: ['whisper-transcribe', 'hook-picker', 'crop-exporter'],
    buildsOn: ['Source Footage'],
    replaces: 'A $50-70/hr editor cutting reels one at a time.',
    ladder: {
      humanLed: 'You scrub footage and cut every clip by hand in an editor.',
      humanAssisted: 'It transcribes and suggests hooks; you finish the cut.',
      fullyAutonomous: 'It transcribes, picks the hook, renders themed crops, and checks caption timing.',
    },
    theHuman: 'You set the theme (LC vs Vantage). It executes the cut to spec.',
    buildNotes: 'Check captions land on beat before export. Transcribe locally with Whisper, no upload.',
    skill: { name: 'Short-Form Cutter', slug: 'short-form-cutter', blurb: 'Transcribes source, picks the hook, and renders platform crops with timed captions.' },
    status: 'in-development',
  },
  'sop-renderly-creative': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Marketing · AI Visuals',
    description: 'Stills and motion from the creative brief, culled then upscaled.',
    breaksInto: ['model-picker', 'take-culler', 'upscaler'],
    buildsOn: ['Creative Brief'],
    replaces: 'A stock-and-designer budget for every visual.',
    ladder: {
      humanLed: 'You commission or license each visual individually.',
      humanAssisted: 'It generates options; you pick which to upscale.',
      fullyAutonomous: 'It picks the model, generates to spec, culls, and upscales the winners.',
    },
    theHuman: 'You write the brief. It matches a model to it and delivers finals.',
    buildNotes: "Cull to the strongest takes before spending on upscales, that's the expensive step. Attach the brief to finals.",
    skill: { name: 'AI Visual Producer', slug: 'ai-visual-producer', blurb: 'Matches a Renderly model to the brief, generates, culls, and upscales.' },
    status: 'not-started',
  },
  'sop-dmflow-mcp': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Marketing · DM Funnels',
    description: 'Keyword triggers to booked conversations, with hot leads handed to Sales.',
    breaksInto: ['keyword-watcher', 'flow-firer', 'intent-tagger'],
    buildsOn: ['DMFlow API', 'Trigger Keywords'],
    replaces: 'A social VA copy-pasting the same DM reply all day.',
    ladder: {
      humanLed: "You reply to every 'comment X' DM by hand.",
      humanAssisted: 'It fires the flow; you watch conversions.',
      fullyAutonomous: 'It watches keywords, fires flows, tags intent, and hands hot leads to Sales.',
    },
    theHuman: 'You design the funnel and offer. It runs the triggers and routing.',
    buildNotes: 'Tag subscribers by intent as they move so Sales gets context, not just a name. Report conversions to the dashboard.',
    skill: { name: 'DM Funnel Automator', slug: 'dm-funnel-automator', blurb: 'Fires DMFlow flows on keyword triggers and routes hot leads to Sales.' },
    status: 'ready-to-run',
  },
  'sop-nadia': {
    autonomy: 'human-led',
    categoryPath: 'Marketing · Editorial',
    description: 'The human editorial gate: sets the angles, approves or kills every drop.',
    breaksInto: ['performance-review', 'angle-setting', 'drop-approval'],
    buildsOn: ['Content Pipeline Runner'],
    replaces: 'Nothing, this is the taste layer the pipeline reports into.',
    ladder: {
      humanLed: 'Nadia Kapoor sets angles and approves every asset before it ships.',
      humanAssisted: 'Agents propose angles from performance; Nadia Kapoor decides.',
      fullyAutonomous: 'Not the goal, editorial taste stays human.',
    },
    theHuman: 'Nadia Kapoor owns what gets published and why. The agents fill the queue; he opens the gate.',
    buildNotes: 'Deliberately human-led. The skill surfaces performance and proposes angles; the kill/approve stays with Nadia Kapoor.',
    skill: { name: 'Editorial Gate', slug: 'editorial-gate', blurb: "Surfaces last cycle's numbers and proposed angles for a human approve/kill." },
    status: 'ready-to-run',
  },

  // ── SALES ─────────────────────────────────────────────────────────────────
  'sop-sales-agent': {
    autonomy: 'human-assisted',
    categoryPath: 'Sales · Pipeline Ops',
    description: 'Every open deal inspected daily; stalled deals get a next action and an owner.',
    breaksInto: ['deal-puller', 'stall-detector', 'call-briefer'],
    buildsOn: ['Ledger CRM', 'Payment Links'],
    replaces: 'A $60-80k/year sales ops manager keeping the board clean.',
    ladder: {
      humanLed: 'You eyeball the board when you remember and hope nothing stalled.',
      humanAssisted: 'It ranks stalled deals and briefs the closer; you work them.',
      fullyAutonomous: 'It inspects, attaches next actions, preps payment links, and logs stage changes same-day.',
    },
    theHuman: 'Theo works the deals. The agent makes sure none go quiet unnoticed.',
    buildNotes: 'Past 7 days in stage = stalled. Prep payment links across PayKit/Stripe/FlexPay before calls, not during.',
    skill: { name: 'Pipeline Keeper', slug: 'pipeline-keeper', blurb: 'Ranks stalled deals, attaches next actions, and briefs the closer daily.' },
    status: 'in-development',
  },
  'sop-lc-lane': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Sales · LC Lane',
    description: 'Webinar registrants to closed LC deals, with no-shows rebooked in 24h.',
    breaksInto: ['lead-tracker', 'noshow-rebooker', 'revenue-reporter'],
    buildsOn: ['Ledger CRM'],
    replaces: 'An SDR manually chasing webinar no-shows.',
    ladder: {
      humanLed: 'You export the registrant list and chase no-shows by hand.',
      humanAssisted: 'It tracks leads and flags no-shows; you rebook.',
      fullyAutonomous: 'It tracks registration-to-call, rebooks no-shows in 24h, and reconciles payments.',
    },
    theHuman: 'You run the calls. The lane keeps the funnel full and reconciled.',
    buildNotes: 'The rebooking sequence must fire within 24h of a no-show or the lead cools. Sync every stage change to Ledger.',
    skill: { name: 'LC Lane Runner', slug: 'lc-lane-runner', blurb: 'Tracks LC webinar leads to booked calls and rebooks no-shows automatically.' },
    status: 'in-development',
  },
  'sop-vantage-lane': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Sales · Vantage Lane',
    description: 'Local-business inbound qualified, booked, and reconciled end to end.',
    breaksInto: ['icp-qualifier', 'calendar-booker', 'revenue-reporter'],
    buildsOn: ['ICP Definition', 'Ledger CRM'],
    replaces: 'An SDR qualifying and booking inbound by hand.',
    ladder: {
      humanLed: 'You read every inbound lead and book calls manually.',
      humanAssisted: 'It qualifies against ICP; you book the good ones.',
      fullyAutonomous: "It qualifies, books onto Theo's calendar with context, and reconciles payments.",
    },
    theHuman: "Theo closes. The lane decides who's worth his calendar.",
    buildNotes: 'Attach context to every booking so the call starts warm. Qualify hard against the ICP before booking.',
    skill: { name: 'Vantage Lane Runner', slug: 'vantage-lane-runner', blurb: 'Qualifies inbound against ICP and books calls with context attached.' },
    status: 'in-development',
  },
  'sop-vantage-paykit': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Sales · Payment Reconciliation',
    description: 'PayKit customers matched to CRM deals, every mismatch chased to resolution.',
    breaksInto: ['payment-puller', 'deal-matcher', 'mismatch-chaser'],
    buildsOn: ['PayKit API', 'Ledger CRM'],
    replaces: 'A bookkeeper cross-checking payments against the CRM by hand.',
    ladder: {
      humanLed: 'You reconcile PayKit against Ledger in a spreadsheet monthly.',
      humanAssisted: 'It flags mismatches; you chase them.',
      fullyAutonomous: 'It matches every payment to a deal and chases mismatches to resolution.',
    },
    theHuman: 'You resolve the genuinely ambiguous ones. It clears the obvious matches.',
    buildNotes: 'Flag both directions: payments with no deal AND deals with no payment. Chase to resolution, not just a flag.',
    skill: { name: 'PayKit Reconciler', slug: 'paykit-reconciler', blurb: 'Matches PayKit payments to Ledger deals and chases every mismatch.' },
    status: 'not-started',
  },
  'sop-sales-calls-data': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Sales · Call Intelligence',
    description: 'Every Recall call and Plaud recording becomes CRM intelligence: objections, commitments, next steps.',
    breaksInto: ['recall-ingest', 'plaud-ingest', 'objection-extractor', 'crm-writer'],
    buildsOn: ['Recall', 'Plaud', 'Ledger CRM'],
    replaces: 'A closer typing call notes from memory after every call.',
    ladder: {
      humanLed: 'You write call notes from memory, if you write them at all.',
      humanAssisted: 'It extracts objections and next steps; you file them.',
      fullyAutonomous: 'It ingests each call, extracts the intel, and writes it back to Ledger.',
    },
    theHuman: 'You run the conversation. It captures what was said and what to do next.',
    buildNotes: 'Tag calls where pricing or competitors came up, those patterns feed the pipeline brief.',
    skill: { name: 'Call Miner', slug: 'call-miner', blurb: 'Turns Recall calls and Plaud in-person recordings into objections, commitments and next steps in Ledger.' },
    status: 'in-development',
  },
  'sop-crm-pulse': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Sales · CRM Hygiene',
    description: 'A CRM the numbers can be trusted from: dedupe, backfill, verify stages.',
    breaksInto: ['dupe-merger', 'stage-verifier', 'metric-snapshotter'],
    buildsOn: ['Ledger CRM'],
    replaces: 'A RevOps analyst cleaning the CRM every Friday.',
    ladder: {
      humanLed: 'You clean the CRM when the numbers stop making sense.',
      humanAssisted: 'It flags dupes and stale records; you fix them.',
      fullyAutonomous: 'It merges dupes, backfills safely, verifies stages, and snapshots metrics.',
    },
    theHuman: 'You decide the risky merges. It handles the safe ones and nudges owners on stale records.',
    buildNotes: 'Only backfill what can be backfilled safely. Nudge lane owners rather than guessing stale fields.',
    skill: { name: 'CRM Pulse', slug: 'crm-pulse', blurb: 'Dedupes, verifies stages, and snapshots pipeline metrics in Ledger.' },
    status: 'not-started',
  },
  'person-theo': {
    autonomy: 'human-led',
    categoryPath: 'Sales · Closing',
    description: 'The human on the phone from hello to signed.',
    breaksInto: ['precall-review', 'discovery-script', 'objection-handling'],
    buildsOn: ['Pipeline Keeper', 'Call Miner'],
    replaces: 'Nothing, this is the closer the whole lane feeds.',
    ladder: {
      humanLed: 'Theo runs every call live from brief to signature.',
      humanAssisted: 'Agents prep the brief and objections; Theo runs the call.',
      fullyAutonomous: 'Not the goal, closing stays human.',
    },
    theHuman: 'Theo owns the conversation and the close. Never improvise pricing, use the objection sheet.',
    buildNotes: "Deliberately human-led. The skill preps the brief and last three touches; the call is Theo's.",
    skill: { name: 'Close Call Runner', slug: 'close-call-runner', blurb: 'Preps the pre-call brief and objection sheet for a human closer.' },
    status: 'ready-to-run',
  },

  // ── FINANCES ──────────────────────────────────────────────────────────────
  'sop-paykit': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Finance · Income Tracking',
    description: 'Month-to-date PayKit income, split by venture, refunds flagged same day.',
    breaksInto: ['mtd-puller', 'venture-splitter', 'refund-flagger'],
    buildsOn: ['PayKit API'],
    replaces: 'A bookkeeper tallying PayKit income by hand.',
    ladder: {
      humanLed: 'You add up PayKit payments in a spreadsheet at month end.',
      humanAssisted: 'It pulls MTD; you split by venture.',
      fullyAutonomous: 'It pulls MTD, splits LC vs Vantage, and flags refunds the day they land.',
    },
    theHuman: 'You own the books. It keeps the running total honest between closes.',
    buildNotes: 'Flag refunds and disputes same-day, not at month end. Reconcile the running total against the close.',
    skill: { name: 'PayKit Income Tracker', slug: 'paykit-income-tracker', blurb: 'Pulls MTD PayKit income split by venture and flags refunds.' },
    status: 'in-development',
  },
  'sop-stripe': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Finance · Income Tracking',
    description: 'Stripe balance and charges labeled LC, anomalies flagged, payouts noted.',
    breaksInto: ['balance-puller', 'income-labeler', 'anomaly-flagger'],
    buildsOn: ['Stripe Key'],
    replaces: 'Checking the Stripe dashboard by hand for the LC total.',
    ladder: {
      humanLed: 'You open Stripe and eyeball the balance.',
      humanAssisted: 'It pulls charges; you label and reconcile.',
      fullyAutonomous: 'It pulls balance and charges, labels LC, flags anomalies, and notes payouts.',
    },
    theHuman: 'You own the reconciliation. It keeps the income chart current.',
    buildNotes: 'Needs a live key with balance+charges read (restricted keys 403 without it). Flag anomalies against the trailing average.',
    skill: { name: 'Stripe Income Tracker', slug: 'stripe-income-tracker', blurb: 'Pulls Stripe balance and charges, labels income, and flags anomalies.' },
    status: 'in-development',
  },
  'sop-processor-confirm': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Finance · Payment Verification',
    description: 'No deal marked paid without an API receipt from the claimed processor.',
    breaksInto: ['claim-receiver', 'api-verifier', 'audit-writer'],
    buildsOn: ['Processor Registry'],
    replaces: "Taking a salesperson's word that a deal was paid.",
    ladder: {
      humanLed: "You trust the 'they paid' Slack message and hope it's true.",
      humanAssisted: 'It checks the processor; you record the result.',
      fullyAutonomous: 'It receives the claim, verifies the charge, and writes confirmation or flags loudly.',
    },
    theHuman: 'You resolve genuine disputes. It refuses to mark paid without a receipt.',
    buildNotes: 'Confirm-or-flag-loudly, never silently pass. Keep an audit trail of every confirmation for month-end.',
    skill: { name: 'Payment Confirmer', slug: 'payment-confirmer', blurb: 'Verifies a payment claim against the processor API before marking a deal paid.' },
    status: 'ready-to-run',
  },
  'sop-flexpay': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Finance · Financing',
    description: 'Payment plans pulled from FlexPay and attached to live offers before the call.',
    breaksInto: ['profile-reader', 'plan-matcher', 'acceptance-tracker'],
    buildsOn: ['FlexPay API', 'Deal Size'],
    replaces: 'A finance rep manually quoting plan options per deal.',
    ladder: {
      humanLed: 'You look up financing terms manually per deal.',
      humanAssisted: 'It pulls plan options; you attach them.',
      fullyAutonomous: 'It matches plans to the buyer profile and attaches terms before the call.',
    },
    theHuman: 'You decide what to offer. It surfaces the plans that fit and tracks what closes.',
    buildNotes: 'Attach terms BEFORE the call, not during. Track acceptance rates so pricing keeps sharpening.',
    skill: { name: 'Financing Quoter', slug: 'financing-quoter', blurb: 'Matches FlexPay plans to a buyer profile and attaches terms to the offer.' },
    status: 'not-started',
  },
  'sop-payments-pulse': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Finance · Processor Monitoring',
    description: 'Every processor pinged, honest status recorded, downtime alerted.',
    breaksInto: ['registry-pinger', 'status-recorder', 'recovery-checker'],
    buildsOn: ['Processor Registry'],
    replaces: 'Finding out a processor is down when a payment fails.',
    ladder: {
      humanLed: 'You learn a processor is down from a failed charge.',
      humanAssisted: 'It reports status; you watch for outages.',
      fullyAutonomous: 'It pings each processor, records honest status, alerts on downtime, and rechecks until recovery.',
    },
    theHuman: 'You decide what to do on an outage. It makes sure you know the moment one starts.',
    buildNotes: 'Never fake connected. Recheck failed processors on a tighter cadence and keep uptime history for analytics.',
    skill: { name: 'Processor Health Watch', slug: 'processor-health-watch', blurb: 'Pings every processor, records honest status, and alerts on downtime.' },
    status: 'ready-to-run',
  },

  // ── CLIENTS ───────────────────────────────────────────────────────────────
  'sop-client-roster': {
    autonomy: 'fully-autonomous',
    categoryPath: 'Clients · Roster',
    description: 'One always-current list of every client, health-marked with a reason.',
    breaksInto: ['source-puller', 'health-marker', 'delta-publisher'],
    buildsOn: ['Ledger CRM', 'PayKit API'],
    replaces: 'A stale client spreadsheet nobody trusts.',
    ladder: {
      humanLed: 'You keep a client list you update when you remember.',
      humanAssisted: 'It reconciles sources; you mark health.',
      fullyAutonomous: 'It pulls sources daily, marks active/at-risk/churned with a reason, and publishes deltas.',
    },
    theHuman: 'You act on at-risk accounts. It makes sure the list is never wrong.',
    buildNotes: 'Every health mark needs a reason, not just a color. Note the deltas so changes are visible.',
    skill: { name: 'Client Roster Keeper', slug: 'client-roster-keeper', blurb: 'Reconciles client sources daily and marks account health with a reason.' },
    status: 'in-development',
  },
  'sop-client-onboarding': {
    autonomy: 'human-assisted',
    categoryPath: 'Clients · Onboarding',
    description: 'Closed-won to kickoff without a dropped step, payment verified first.',
    breaksInto: ['welcome-pack', 'workspace-setup', 'kickoff-booker'],
    buildsOn: ['Payment Confirmer', 'Notion Mirror'],
    replaces: 'A $50-60k/year onboarding coordinator running a checklist.',
    ladder: {
      humanLed: 'You run the onboarding checklist manually per client.',
      humanAssisted: 'It runs the steps; you confirm access and hand off.',
      fullyAutonomous: 'It triggers on closed-won, verifies payment, ships the pack, and books kickoff.',
    },
    theHuman: 'Sasha owns the relationship handoff. The agent runs the mechanical checklist without dropping a step.',
    buildNotes: 'Verify payment landed BEFORE anything ships. Collect all access in one request, not five follow-ups.',
    skill: { name: 'Client Onboarder', slug: 'client-onboarder', blurb: 'Runs the closed-won-to-kickoff checklist, payment-gated, without dropped steps.' },
    status: 'in-development',
  },
  'sop-client-success': {
    autonomy: 'human-assisted',
    categoryPath: 'Clients · Success',
    description: 'Cadence, deliverables and renewals on rails, health scored monthly.',
    breaksInto: ['cadence-runner', 'scope-tracker', 'renewal-flagger'],
    buildsOn: ['Client Roster Keeper', 'Call Miner'],
    replaces: 'A $55-70k/year CSM juggling check-ins in their head.',
    ladder: {
      humanLed: 'You check in with clients when you can and hope scope holds.',
      humanAssisted: 'It tracks cadence and scope; you run the calls.',
      fullyAutonomous: 'It runs the cadence, flags slippage, scores health, and raises renewals 30 days out.',
    },
    theHuman: 'Sasha runs the relationship. The agent makes sure no week and no renewal slips.',
    buildNotes: 'No skipped weeks in the cadence. Raise renewals and upsells 30 days out, not at expiry.',
    skill: { name: 'Client Success Runner', slug: 'client-success-runner', blurb: 'Runs the check-in cadence, tracks scope, and flags renewals 30 days out.' },
    status: 'not-started',
  },
  'sop-sasha': {
    autonomy: 'human-led',
    categoryPath: 'Clients · Accounts',
    description: 'The human accountable for every account: kickoffs, QBRs, escalations, renewals.',
    breaksInto: ['qbr-runner', 'escalation-resolver', 'renewal-signoff'],
    buildsOn: ['Client Success Runner'],
    replaces: 'Nothing, this is the accountable human every account rolls up to.',
    ladder: {
      humanLed: 'Sasha runs kickoffs, QBRs and escalations personally.',
      humanAssisted: 'Agents prep health scores and materials; Sasha runs the calls.',
      fullyAutonomous: 'Not the goal, account accountability stays human.',
    },
    theHuman: 'Sasha owns every account relationship. Resolve escalations same-day, approve scope before work starts.',
    buildNotes: "Deliberately human-led. The skill preps QBR materials and health reviews; the relationship stays Sasha's.",
    skill: { name: 'Account Owner', slug: 'account-owner', blurb: 'Preps QBR materials and health reviews for the accountable human.' },
    status: 'ready-to-run',
  },
};

/** A safe generated fallback so any SOP without an authored entry still renders
 *  a full card (keeps every task covered even if the seed grows). */
function fallbackPlaybook(task: SopTask): SopPlaybook {
  const human = task.assigneeKind === 'person';
  return {
    autonomy: human ? 'human-led' : 'fully-autonomous',
    categoryPath: 'Operations · SOP',
    description: task.summary,
    breaksInto: ['intake', 'execute', 'report'],
    buildsOn: [],
    replaces: 'Manual effort a person would otherwise repeat by hand.',
    ladder: {
      humanLed: 'A person runs every step by hand.',
      humanAssisted: 'The agent does the work; a human approves the output.',
      fullyAutonomous: 'The agent runs the whole SOP end to end and reports.',
    },
    theHuman: human
      ? 'This SOP is owned by a human; the skill assists, it does not replace the call.'
      : 'A human sets the goal and reviews the output; the agent executes.',
    buildNotes: 'Wire the real steps from the SOP checklist into the skill below.',
    skill: {
      name: `${task.title} Skill`,
      slug: task.id.replace(/^sop-/, '').replace(/[^a-z0-9-]/g, '-'),
      blurb: task.summary,
    },
    status: 'not-started',
  };
}

/** Generate the dummy-but-runnable SKILL.md body from the playbook + SOP.
 *  Real skill wiring lands later; this reads like the file it will become. */
export function skillFileMarkdown(pb: SopPlaybook, task: SopTask): string {
  const steps = task.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const buildsOn = pb.buildsOn.length ? pb.buildsOn.map((b) => `- ${b}`).join('\n') : '- nothing upstream';
  return `---
name: ${pb.skill.slug}
title: ${pb.skill.name}
description: ${pb.skill.blurb}
autonomy: ${pb.autonomy}
status: ${pb.status}
---

# ${pb.skill.name}

${pb.description}

## When to run
${task.summary}

## Breaks into
${pb.breaksInto.map((s) => `- ${s}`).join('\n')}

## Builds on
${buildsOn}

## Procedure
${steps}

## The human in the loop
${pb.theHuman}

## Build notes
${pb.buildNotes}

> Dummy skill file. The steps above mirror the live SOP; wire the runnable
> implementation here when this skill is promoted from ${pb.status}.
`;
}

/** Resolve the full, card-ready playbook for a SOP task (authored or fallback),
 *  including the generated runnable skill file. */
export function playbookFor(task: SopTask): ResolvedPlaybook {
  const pb = PLAYBOOKS[task.id] ?? fallbackPlaybook(task);
  return { ...pb, skillMarkdown: skillFileMarkdown(pb, task) };
}
