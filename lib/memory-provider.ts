import type { BrainProvider, BrainSearchResult, BrainStatus } from '@/lib/brain';
import { retrieveBrain } from '@/lib/brain-retrieval';
import type { CaptureInput, CaptureOutcome } from '@/lib/connectors/gbrain';
import type { FounderDb } from '@/lib/db';
import type { DigestEntry } from '@/lib/comms-digest';

/**
 * A memory provider for G-Brain, shaped for Hermes workers.
 *
 * The ask: a memory provider for G-Brain that gives Hermes context on what's
 * going on, alongside the MCP.
 *
 * The MCP is the right shape for a Claude session: many tools, called
 * one at a time, by a model that can afford to explore. A Hermes worker on
 * glm-5.2 picking a task off the Paperclip board is the opposite case — it
 * wants ONE cheap read that returns something it can paste at the top of its
 * prompt and get on with the job. This is that read.
 *
 * Two rules, both inherited from lib/connectors:
 *
 * 1. FAST. Live OS state comes from the sqlite repos only. Never fan out to
 * the connectors here: /comms already showed what a 20s cold render does,
 * and a worker calling this before every task would pay it every time.
 * 2. HONEST. G-Brain falls back to a local brain-store keyword scan when
 * Supabase is paused, and a keyword scan is not hybrid search. When that
 * happens the brief SAYS so, because a worker that reads "no results" as
 * "no such fact" will confidently act on a gap.
 */
export const MEMORY_BUDGET_CHARS = 6_000;

/** A worker must never wait on a paused Supabase; the CLI's own cap is 15s. */
export const RECALL_BUDGET_MS = 8_000;

export type MemoryLane = 'now' | 'agents';

export type MemoryFact = {
  lane: MemoryLane;
  /** Higher survives truncation. The single highest is never dropped. */
  weight: number;
  text: string;
  ts?: string;
};

/** Ranking, named so the ordering is a decision rather than a magic number. */
export const WEIGHT = {
  digestSummary: 105,
  waitingOnHim: 100,
  agentFailing: 80,
  openWork: 60,
  recentRun: 30,
  empty: 10,
} as const;

const LANE_TITLES: Record<MemoryLane, string> = {
  now: 'Waiting on the operator',
  agents: 'Agents',
};

export type MemoryBrief = {
  generatedAt: string;
  query: string | null;
  brain: BrainStatus;
  recall: BrainSearchResult[];
  facts: MemoryFact[];
  /** The briefing itself. This is the field a worker actually consumes. */
  markdown: string;
  truncated: boolean;
};

/** A BrainProvider that may also be able to write back (the gbrain one can). */
export type MemoryBrain = BrainProvider & {
  capture?(input: CaptureInput): Promise<CaptureOutcome>;
};

const DAY = 86_400_000;

function ago(iso: string, now: number): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function clip(s: string, n: number): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length <= n ? one : `${one.slice(0, n - 1)}…`;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The most recent run per agent — a failure that was later fixed is fixed. */
function lastRunPerAgent(db: FounderDb) {
  const latest = new Map<string, { agentId: string; ok: boolean; summary: string; startedAt: string }>();
  for (const r of db.agentRuns.recent(200)) {
    const seen = latest.get(r.agentId);
    if (!seen || Date.parse(r.startedAt) > Date.parse(seen.startedAt)) latest.set(r.agentId, r);
  }
  return [...latest.values()];
}

function digestFacts(db: FounderDb, now: number): MemoryFact[] {
  const row = db.commsDigests.latest();
  if (!row) return [];
  let digest: { entries?: DigestEntry[]; total?: number; needsReply?: number } | undefined;
  try {
    digest = (JSON.parse(row.payload) as { digest?: typeof digest }).digest;
  } catch {
    return []; // a corrupt payload is not worth failing a worker's request over
  }
  if (!digest || !Array.isArray(digest.entries)) return [];

  const facts: MemoryFact[] = [
    {
      lane: 'now',
      weight: WEIGHT.digestSummary,
      ts: row.generatedAt,
      text: `Morning report (${ago(row.generatedAt, now)}): ${digest.total ?? digest.entries.length} open, ${digest.needsReply ?? 0} need a reply from him.`,
    },
  ];

  // Only the tiers that are genuinely his to answer ride into the brief; the
  // noise tier exists precisely so it does not.
  for (const e of digest.entries.filter((x) => ['call', 'client', 'branddeal', 'people'].includes(x.tier)).slice(0, 8)) {
    const held = e.carried && e.firstSeenAt ? ` · carried since ${ago(e.firstSeenAt, now)}` : '';
    // WhatsApp rows (and plenty of email ones) carry the sender as the subject,
    // so printing both gave "Ivan Kovac — Ivan Kovac".
    const subject = clip(e.title, 70);
    const who = subject.toLowerCase().includes(e.sender.toLowerCase()) ? subject : `${e.sender} — ${subject}`;
    facts.push({
      lane: 'now',
      weight: WEIGHT.waitingOnHim - (e.rank ?? 0),
      ts: e.ts,
      text: `${e.tier} · ${who} (${e.source}, ${ago(e.ts, now)}${held})`,
    });
  }
  return facts;
}

/**
 * Everything the OS knows about right now, read from sqlite only.
 * Pure with respect to the clock: `now` is passed in so it is testable.
 */
export function collectFacts(db: FounderDb, now: number = Date.now()): MemoryFact[] {
  const facts: MemoryFact[] = [];

  const runs = lastRunPerAgent(db);
  const names = new Map(db.agents.all().map((a) => [a.id, a.name]));
  const label = (id: string) => names.get(id) ?? id;

  for (const r of runs.filter((x) => !x.ok).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))) {
    facts.push({
      lane: 'agents',
      weight: WEIGHT.agentFailing,
      ts: r.startedAt,
      text: `${label(r.agentId)} (${r.agentId}) last run FAILED ${ago(r.startedAt, now)}: ${clip(r.summary, 140)}`,
    });
  }

  const green = runs.filter((x) => x.ok).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  for (const r of green.slice(0, 6)) {
    facts.push({
      lane: 'agents',
      weight: WEIGHT.recentRun,
      ts: r.startedAt,
      text: `${label(r.agentId)} ran ${ago(r.startedAt, now)}: ${clip(r.summary, 110)}`,
    });
  }

  const open = db.agentTasks
    .all()
    .filter((t) => t.status !== 'done')
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  if (open.length > 0) {
    const oldest = open[0];
    const age = Math.floor((now - Date.parse(oldest.createdAt)) / DAY);
    facts.push({
      lane: 'agents',
      weight: WEIGHT.openWork,
      ts: oldest.createdAt,
      text: `${open.length} open agent task${open.length === 1 ? '' : 's'}; oldest is "${clip(oldest.title, 80)}" (${label(oldest.agentId)}, ${age}d).`,
    });
  }

  facts.push(...digestFacts(db, now));

  if (facts.length === 0) {
    facts.push({
      lane: 'now',
      weight: WEIGHT.empty,
      text: 'No agent runs, open tasks or morning report on record yet. This OS has nothing to report, which is not the same as nothing happening.',
    });
  }
  return facts;
}

/**
 * Does any hit actually contain a word that was asked about?
 *
 * Live, "acme-parking parking dana whitfield" came back with
 * `# Greeting` at 0.86 and `# Webinar Examples` at 0.96 — the brain-store has
 * no Acme Parking page, and the scores said nothing about that. A score floor
 * would only have laundered the junk, so we check the cheap orthogonal signal
 * instead. Words shorter than four characters are ignored: "the" matching
 * proves nothing.
 */
export function lexicallyOverlaps(query: string, hits: BrainSearchResult[]): boolean {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
  if (terms.length === 0) return true; // nothing checkable — do not cry wolf
  const hay = hits.map((h) => `${h.title} ${h.snippet}`.toLowerCase()).join(' ');
  return terms.some((t) => hay.includes(t));
}

export type RenderInput = {
  query: string | null;
  recall: BrainSearchResult[];
  facts: MemoryFact[];
  brain: BrainStatus;
  now: number;
  budgetChars?: number;
};

/**
 * Render the brief, newest and most urgent first, inside a character budget.
 *
 * The header and the footer sit OUTSIDE the budget: a brief that dropped its
 * own timestamp, or dropped the note saying it had been truncated, would be
 * worse than one that ran a few characters long. So does the single
 * highest-weight fact — losing the past-due item to save 40 characters is
 * exactly the failure this whole thing exists to prevent.
 */
export function renderBrief(input: RenderInput): { markdown: string; truncated: boolean } {
  const budget = input.budgetChars ?? MEMORY_BUDGET_CHARS;
  const degraded = !!input.query && !input.brain.connected;

  const header = [
    `# Founder OS memory · ${new Date(input.now).toISOString()}`,
    `G-Brain: ${input.brain.detail}`,
  ].join('\n');

  const banner = degraded
    ? [
        '',
        `> G-Brain is UNREACHABLE, so recall below is DEGRADED: it came from a local`,
        '> brain-store keyword scan, not hybrid search, and is therefore incomplete.',
        '> Treat a missing answer as unknown, not as absence.',
      ].join('\n')
    : '';

  // Body blocks in priority order: recall answers the question that was asked,
  // then live state in weight order.
  const blocks: { weight: number; text: string }[] = [];
  if (input.query) {
    const lines = input.recall.length
      ? input.recall.map((r) => `- ${r.title} — ${clip(r.snippet, 220)} [${r.source}]`)
      : ['- (nothing in the brain-store matched)'];
    if (input.recall.length > 0 && !lexicallyOverlaps(input.query, input.recall)) {
      lines.push(
        '',
        '> SEMANTIC MATCH ONLY: none of these hits contain the words you asked',
        "> about. G-Brain's scores are not calibrated to relevance, so treat this",
        '> as a weak lead and verify before acting on it.',
      );
    }
    blocks.push({ weight: Number.MAX_SAFE_INTEGER, text: `\n## Recall · "${input.query}"\n${lines.join('\n')}` });
  }

  // Grouped by lane, lanes ordered by their most urgent member. Sorting facts
  // globally by weight instead let one lane interleave with another and print
  // its "## Lane" heading twice.
  const byLane = new Map<MemoryLane, MemoryFact[]>();
  for (const f of input.facts) byLane.set(f.lane, [...(byLane.get(f.lane) ?? []), f]);
  const lanes = [...byLane.entries()]
    .map(([lane, facts]) => ({ lane, facts: [...facts].sort((a, b) => b.weight - a.weight) }))
    .sort((a, b) => b.facts[0].weight - a.facts[0].weight);

  for (const { lane, facts } of lanes) {
    facts.forEach((f, i) => {
      const head = i === 0 ? `\n## ${LANE_TITLES[lane]}\n` : '';
      blocks.push({ weight: f.weight, text: `${head}- ${f.text}` });
    });
  }

  // Reserved so the truncation notice cannot itself push the brief over budget.
  const FOOTER_ALLOWANCE = 64;
  let used = header.length + banner.length + FOOTER_ALLOWANCE;
  const kept: string[] = [];
  let dropped = 0;
  for (const [i, b] of blocks.entries()) {
    const cost = b.text.length + 1;
    // Index 0 is always kept — the recall block, or the single most urgent
    // fact. Losing the past-due item to save forty characters is the exact
    // failure this exists to prevent.
    if (i === 0) {
      kept.push(b.text);
      used += cost;
      continue;
    }
    // Strict priority, not a greedy fill: once the budget is gone we stop.
    // Skipping ahead to a cheaper block would also orphan it, because the
    // "## Lane" heading rides on the FIRST block of each lane.
    if (used + cost > budget) {
      dropped = blocks.length - i;
      break;
    }
    kept.push(b.text);
    used += cost;
  }

  const footer = dropped > 0 ? `\n\n_${dropped} more dropped to fit the context budget._` : '';
  return { markdown: `${header}${banner}${kept.join('\n')}${footer}`, truncated: dropped > 0 };
}

export type BriefOptions = {
  query?: string | null;
  now?: number;
  budgetChars?: number;
  recallBudgetMs?: number;
};

export type MemoryProvider = {
  brief(opts?: BriefOptions): Promise<MemoryBrief>;
  remember(input: CaptureInput): Promise<CaptureOutcome>;
};

export function createMemoryProvider(opts: { db: FounderDb; brain: MemoryBrain }): MemoryProvider {
  const { db, brain } = opts;

  async function safeStatus(): Promise<BrainStatus> {
    try {
      return await brain.status();
    } catch (err) {
      return { connected: false, provider: brain.name, detail: errorText(err) };
    }
  }

  async function recallFor(
    query: string,
    budgetMs: number,
  ): Promise<{ recall: BrainSearchResult[]; status: BrainStatus }> {
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), budgetMs));
    let hits: BrainSearchResult[] | 'timeout';
    try {
      // Through the hub, never brain.search directly: the brief is budgeted in
      // characters, and spending that budget on a fifteen-chunk pool the
      // reranker would have thrown away is how a worker ends up reading noise.
      const search = retrieveBrain(brain, query).then((r) => {
        // The hub never throws; a provider failure comes back as `error`, and
        // the brief has to repeat it rather than imply an empty store.
        if (r.error) throw new Error(r.error);
        return r.hits;
      });
      hits = await Promise.race([search, timeout]);
    } catch (err) {
      return { recall: [], status: { connected: false, provider: brain.name, detail: errorText(err) } };
    }
    if (hits === 'timeout') {
      return {
        recall: [],
        status: {
          connected: false,
          provider: brain.name,
          detail: `recall timed out after ${budgetMs}ms — Supabase is probably paused`,
        },
      };
    }

    // The gbrain connector degrades SILENTLY to a local keyword scan, tagging
    // those hits `brain-store` instead of `gbrain`. That tag is the only free
    // signal that hybrid search is down, so it is what we read rather than
    // paying for a second `doctor` call.
    if (hits.length === 0) return { recall: hits, status: await safeStatus() };
    const hybrid = hits.some((h) => h.source === 'gbrain');
    return {
      recall: hits,
      status: hybrid
        ? { connected: true, provider: brain.name, detail: `${hits.length} hit(s) from hybrid search` }
        : {
            connected: false,
            provider: brain.name,
            detail: 'hybrid search unavailable — answered from the local brain-store',
          },
    };
  }

  return {
    async brief(o: BriefOptions = {}): Promise<MemoryBrief> {
      const now = o.now ?? Date.now();
      const query = o.query?.trim() ? o.query.trim() : null;
      const facts = collectFacts(db, now);

      // No query means ambient context, and searching for nothing costs a CLI
      // round trip to be told nothing. Say plainly that we did not look.
      const { recall, status } = query
        ? await recallFor(query, o.recallBudgetMs ?? RECALL_BUDGET_MS)
        : { recall: [] as BrainSearchResult[], status: { connected: false, provider: brain.name, detail: 'not checked (no recall requested)' } };

      const { markdown, truncated } = renderBrief({
        query,
        recall,
        facts,
        brain: status,
        now,
        budgetChars: o.budgetChars,
      });
      return { generatedAt: new Date(now).toISOString(), query, brain: status, recall, facts, markdown, truncated };
    },

    async remember(input: CaptureInput): Promise<CaptureOutcome> {
      if (!brain.capture) {
        return { ok: false, error: `the ${brain.name} brain provider cannot write memories (no capture)` };
      }
      if (!input.text?.trim()) return { ok: false, error: 'nothing to remember (empty text)' };
      try {
        return await brain.capture(input);
      } catch (err) {
        return { ok: false, error: errorText(err) };
      }
    },
  };
}
