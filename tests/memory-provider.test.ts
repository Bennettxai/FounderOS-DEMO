import { describe, expect, test } from 'vitest';
import { openDb } from '@/lib/db';
import {
  MEMORY_BUDGET_CHARS,
  collectFacts,
  createMemoryProvider,
  renderBrief,
  type MemoryBrain,
  type MemoryFact,
} from '@/lib/memory-provider';

/**
 * A memory provider for G-Brain, so Hermes workers have context of what is
 * going on. (the operator, 2026-08-21)
 *
 * Hermes agents run on the host and on Railway. They pick up work from the
 * Paperclip board knowing nothing about the operator's business: not what the
 * agents just did, not what is waiting on him, not what the brain-store
 * already knows. The MCP gives a Claude session tool-by-tool access; a Hermes
 * worker on glm-5.2 needs the opposite shape — one cheap read that returns a
 * briefing it can put straight in its prompt.
 *
 * Two hard rules, both inherited from the connector layer:
 *  - it must be FAST (sqlite repos only, no connector fan-out), and
 *  - it must be HONEST. A degraded recall is never dressed up as a real one.
 */
const NOW = Date.parse('2026-08-21T09:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

function db() {
  return openDb(':memory:');
}

const run = (over: Partial<{ id: string; agentId: string; ok: boolean; summary: string; startedAt: string }>) => ({
  id: over.id ?? 'r1',
  agentId: over.agentId ?? 'a1',
  startedAt: over.startedAt ?? iso(NOW - HOUR),
  finishedAt: over.startedAt ?? iso(NOW - HOUR),
  ok: over.ok ?? true,
  summary: over.summary ?? 'ok',
  model: null,
  tokensIn: null,
  tokensOut: null,
  costUsd: null,
});

const task = (over: Partial<{ id: string; title: string; status: 'open' | 'doing' | 'done'; createdAt: string }>) => ({
  id: over.id ?? 't1',
  agentId: 'a1',
  title: over.title ?? 'A task',
  status: over.status ?? ('open' as const),
  createdAt: over.createdAt ?? iso(NOW - DAY),
  updatedAt: over.createdAt ?? iso(NOW - DAY),
});

describe('collectFacts — what is going on, read from sqlite only', () => {
  test('an agent whose LAST run failed is reported, with the reason', () => {
    const d = db();
    d.agentRuns.insert(run({ id: 'r1', agentId: 'comms-digest', ok: false, summary: 'IMAP auth rejected' }));
    const facts = collectFacts(d, NOW);
    d.close();

    const text = facts.map((f) => f.text).join('\n');
    expect(text).toContain('comms-digest');
    expect(text).toContain('IMAP auth rejected');
  });

  test('a failure followed by a success is not still reported as failing', () => {
    const d = db();
    d.agentRuns.insert(run({ id: 'r1', agentId: 'trading', ok: false, summary: 'broker 502', startedAt: iso(NOW - 3 * HOUR) }));
    d.agentRuns.insert(run({ id: 'r2', agentId: 'trading', ok: true, summary: 'snapshot pushed', startedAt: iso(NOW - HOUR) }));
    const facts = collectFacts(d, NOW);
    d.close();

    expect(facts.filter((f) => f.lane === 'agents').map((f) => f.text).join('\n')).not.toContain('broker 502');
  });

  test('open work is counted and the oldest is named; finished work is not', () => {
    const d = db();
    d.agentTasks.insert(task({ id: 't1', title: 'Send Harlow pre-call brief', createdAt: iso(NOW - 4 * DAY) }));
    d.agentTasks.insert(task({ id: 't2', title: 'Newer thing', createdAt: iso(NOW - HOUR) }));
    d.agentTasks.insert(task({ id: 't3', title: 'Already handled', status: 'done', createdAt: iso(NOW - 9 * DAY) }));
    const facts = collectFacts(d, NOW);
    d.close();

    const text = facts.map((f) => f.text).join('\n');
    expect(text).toContain('Send Harlow pre-call brief');
    expect(text).toContain('2 open');
    expect(text).not.toContain('Already handled');
  });

  test('the morning report contributes who is waiting on him', () => {
    const d = db();
    d.commsDigests.insert({
      id: 'd1',
      generatedAt: iso(NOW - 2 * HOUR),
      payload: JSON.stringify({
        digest: {
          generatedAt: iso(NOW - 2 * HOUR),
          total: 3,
          needsReply: 2,
          counts: { client: 1 },
          entries: [
            { tier: 'client', rank: 1, reason: 'client', source: 'email', sender: 'robin@northwindlogistics.example.com', title: 'workshop logistics', preview: 'confirming', ts: iso(NOW - 5 * HOUR) },
          ],
        },
        sources: [],
      }),
    });
    const facts = collectFacts(d, NOW);
    d.close();

    const text = facts.map((f) => f.text).join('\n');
    expect(text).toContain('robin@northwindlogistics.example.com');
    expect(text).toContain('2');
  });

  test('a sender whose name IS the title is not printed twice', () => {
    // Seen live: "call · Joel Kaplan — Launchpad Cohort — Joel Kaplan".
    // WhatsApp and several email rows carry the sender as the subject too.
    const d = db();
    d.commsDigests.insert({
      id: 'd1',
      generatedAt: iso(NOW - HOUR),
      payload: JSON.stringify({
        digest: {
          total: 1,
          needsReply: 1,
          entries: [
            { tier: 'client', rank: 1, reason: 'x', source: 'whatsapp', sender: 'Ivan Kovac', title: 'Ivan Kovac', preview: '', ts: iso(NOW - HOUR) },
          ],
        },
      }),
    });
    const line = collectFacts(d, NOW).find((f) => f.text.includes('Ivan'))!.text;
    d.close();

    expect(line.match(/Ivan Kovac/g)).toHaveLength(1);
  });

  test('a corrupt digest payload is skipped, never thrown', () => {
    const d = db();
    d.commsDigests.insert({ id: 'd1', generatedAt: iso(NOW), payload: 'not json' });
    expect(() => collectFacts(d, NOW)).not.toThrow();
    d.close();
  });

  test('an empty database says so instead of returning nothing', () => {
    const d = db();
    const facts = collectFacts(d, NOW);
    d.close();
    expect(facts.length).toBeGreaterThan(0);
  });
});

describe('renderBrief — a briefing a worker can paste into its prompt', () => {
  const brainUp = { connected: true, provider: 'gbrain', detail: 'gbrain ok · health 92/100' };
  const brainDown = { connected: false, provider: 'gbrain', detail: 'cannot connect to Supabase' };
  const facts: MemoryFact[] = [
    { lane: 'now', weight: 100, text: 'PAST DUE: Harlow pre-call brief was due 14:30Z' },
    { lane: 'agents', weight: 80, text: 'comms-digest last run FAILED: IMAP auth rejected' },
    { lane: 'agents', weight: 30, text: 'trading ran 1h ago: snapshot pushed' },
  ];

  test('the recall block leads when there is a query', () => {
    const { markdown } = renderBrief({
      query: 'northwind-logistics parking',
      recall: [{ title: 'northwind-logistics-deal', snippet: 'Robin Sample, $9,200, an on-site workshop', source: 'gbrain' }],
      facts,
      brain: brainUp,
      now: NOW,
    });
    expect(markdown).toContain('northwind-logistics parking');
    expect(markdown).toContain('Robin Sample');
    expect(markdown.indexOf('Robin Sample')).toBeLessThan(markdown.indexOf('comms-digest'));
  });

  test('a degraded recall is declared as degraded, never passed off as a real one', () => {
    const { markdown } = renderBrief({
      query: 'northwind-logistics',
      recall: [{ title: 'notes/deals', snippet: 'northwind-logistics', source: 'brain-store' }],
      facts,
      brain: brainDown,
      now: NOW,
    });
    expect(markdown).toMatch(/unreachable|degraded/i);
    expect(markdown).toContain('cannot connect to Supabase');
    // and it must warn against reading absence as fact
    expect(markdown).toMatch(/not.*absence|incomplete/i);
  });

  /**
   * A live query for a named deal can come back with an empty greeting page at
   * score 0.86 and an unrelated page at 0.96. G-Brain's scores are not
   * calibrated to relevance, so a score floor would only launder the junk.
   * What IS computable for free is whether the hits contain the words that
   * were asked about — and a worker told "semantic match only" will not build
   * a client email out of an old greeting.
   */
  test('a recall that matches none of the asked-about words says so', () => {
    const { markdown } = renderBrief({
      query: 'northwind-logistics parking robin sample',
      recall: [
        { title: 'conversations/2026-01-05-greeting', snippet: '# Greeting (no messages)', source: 'gbrain', score: 0.86 },
        { title: 'projects/webinar-examples', snippet: '# Webinar Examples', source: 'gbrain', score: 0.96 },
      ],
      facts,
      brain: brainUp,
      now: NOW,
    });
    expect(markdown).toMatch(/semantic match only|none of these hits/i);
  });

  test('a recall that does contain the words carries no such warning', () => {
    const { markdown } = renderBrief({
      query: 'northwind-logistics parking',
      recall: [{ title: 'projects/northwind-logistics', snippet: 'Northwind Logistics — Robin Sample, $9,200', source: 'gbrain', score: 0.9 }],
      facts,
      brain: brainUp,
      now: NOW,
    });
    expect(markdown).not.toMatch(/semantic match only/i);
  });

  test('short words do not count as a match: "the" appearing everywhere proves nothing', () => {
    const { markdown } = renderBrief({
      query: 'the northwind-logistics deal',
      recall: [{ title: 'notes/misc', snippet: 'the weather is fine and the day is long', source: 'gbrain' }],
      facts,
      brain: brainUp,
      now: NOW,
    });
    expect(markdown).toMatch(/semantic match only|none of these hits/i);
  });

  test('a healthy brain adds no warning banner', () => {
    const { markdown } = renderBrief({ query: null, recall: [], facts, brain: brainUp, now: NOW });
    expect(markdown).not.toMatch(/degraded/i);
  });

  test('the brief stays inside its character budget', () => {
    const many: MemoryFact[] = Array.from({ length: 400 }, (_, i) => ({
      lane: 'agents' as const,
      weight: 10,
      text: `agent-${i} ran and said something reasonably long about what it did`,
    }));
    const { markdown } = renderBrief({ query: null, recall: [], facts: many, brain: brainUp, now: NOW });
    expect(markdown.length).toBeLessThanOrEqual(MEMORY_BUDGET_CHARS);
  });

  test('truncation drops the least important first, and keeps the urgent', () => {
    const { markdown, truncated } = renderBrief({
      query: null,
      recall: [],
      facts,
      brain: brainUp,
      now: NOW,
      budgetChars: 200,
    });
    expect(truncated).toBe(true);
    expect(markdown).toContain('PAST DUE');
    expect(markdown).not.toContain('snapshot pushed');
  });

  test('truncation is declared in the text, not silent', () => {
    const { markdown } = renderBrief({ query: null, recall: [], facts, brain: brainUp, now: NOW, budgetChars: 200 });
    expect(markdown).toMatch(/\d+ (more|dropped)/i);
  });

  test('each lane heading is printed once, however the weights interleave', () => {
    // Seen live: "## Agents" twice, because a weight-70 inbox fact sorted
    // between the weight-80 failure and the weight-30 run summaries.
    const mixed: MemoryFact[] = [
      { lane: 'agents', weight: 80, text: 'slack-worker last run FAILED' },
      { lane: 'now', weight: 100, text: 'Robin is waiting' },
      { lane: 'agents', weight: 30, text: 'payments ran 17h ago' },
      { lane: 'now', weight: 105, text: 'Morning report: 150 need a reply' },
    ];
    const { markdown } = renderBrief({ query: null, recall: [], facts: mixed, brain: brainUp, now: NOW });
    expect(markdown.match(/## Agents/g)).toHaveLength(1);
    expect(markdown.match(/## Waiting on the operator/g)).toHaveLength(1);
    // and grouping must not lose the ordering INSIDE a lane
    expect(markdown.indexOf('Morning report')).toBeLessThan(markdown.indexOf('Robin is waiting'));
    expect(markdown.indexOf('FAILED')).toBeLessThan(markdown.indexOf('payments ran'));
  });

  test('the most urgent lane leads', () => {
    const mixed: MemoryFact[] = [
      { lane: 'agents', weight: 80, text: 'a failure' },
      { lane: 'now', weight: 100, text: 'someone waiting' },
    ];
    const { markdown } = renderBrief({ query: null, recall: [], facts: mixed, brain: brainUp, now: NOW });
    expect(markdown.indexOf('someone waiting')).toBeLessThan(markdown.indexOf('a failure'));
  });

  test('the header and the timestamp survive any budget', () => {
    const { markdown } = renderBrief({ query: null, recall: [], facts, brain: brainUp, now: NOW, budgetChars: 1 });
    expect(markdown).toContain('2026-08-21T09:00:00.000Z');
  });
});

describe('createMemoryProvider — the thing Hermes actually calls', () => {
  const fakeBrain = (over: Partial<MemoryBrain> = {}): MemoryBrain & { searchCalls: string[] } => {
    const searchCalls: string[] = [];
    return {
      searchCalls,
      name: 'fake',
      async status() {
        return { connected: true, provider: 'fake', detail: 'up' };
      },
      async search(q: string) {
        searchCalls.push(q);
        return [{ title: 'hit', snippet: `about ${q}`, source: 'gbrain' }];
      },
      ...over,
    } as MemoryBrain & { searchCalls: string[] };
  };

  test('ambient context does not pay for a G-Brain round trip', async () => {
    // A worker asking "what is going on" has no query. Searching for nothing
    // would cost a 15s CLI call and return noise.
    const brain = fakeBrain();
    const d = db();
    const provider = createMemoryProvider({ db: d, brain });
    const brief = await provider.brief({ now: NOW });
    d.close();

    expect(brain.searchCalls).toEqual([]);
    expect(brief.recall).toEqual([]);
    expect(brief.markdown).toBeTruthy();
  });

  test('a query is passed through to G-Brain and lands in the brief', async () => {
    const brain = fakeBrain();
    const d = db();
    const provider = createMemoryProvider({ db: d, brain });
    const brief = await provider.brief({ query: 'northwind-logistics', now: NOW });
    d.close();

    expect(brain.searchCalls).toEqual(['northwind-logistics']);
    expect(brief.markdown).toContain('about northwind-logistics');
  });

  test('a G-Brain that throws degrades the brief instead of failing the request', async () => {
    const brain = fakeBrain({
      async search() {
        throw new Error('gbrain exploded');
      },
    });
    const d = db();
    const provider = createMemoryProvider({ db: d, brain });
    const brief = await provider.brief({ query: 'anything', now: NOW });
    d.close();

    expect(brief.recall).toEqual([]);
    expect(brief.brain.connected).toBe(false);
    expect(brief.markdown).toContain('gbrain exploded');
  });

  test('a slow G-Brain is abandoned on a budget rather than hanging the worker', async () => {
    const brain = fakeBrain({
      search: () => new Promise(() => {}) as Promise<never>,
    });
    const d = db();
    const provider = createMemoryProvider({ db: d, brain });
    const brief = await provider.brief({ query: 'anything', now: NOW, recallBudgetMs: 10 });
    d.close();

    expect(brief.recall).toEqual([]);
    expect(brief.brain.connected).toBe(false);
    expect(brief.markdown).toMatch(/timed out/i);
  });

  test('remember() writes back through capture and returns the slug', async () => {
    const captured: string[] = [];
    const brain = fakeBrain({
      async capture(input) {
        captured.push(input.text);
        return { ok: true, slug: 'notes/hermes-learned', contentHash: 'abc' };
      },
    });
    const d = db();
    const provider = createMemoryProvider({ db: d, brain });
    const out = await provider.remember({ text: 'Robin prefers morning calls' });
    d.close();

    expect(captured).toEqual(['Robin prefers morning calls']);
    expect(out).toEqual({ ok: true, slug: 'notes/hermes-learned', contentHash: 'abc' });
  });

  test('a failed capture is reported as failed, not swallowed into a fake success', async () => {
    const brain = fakeBrain({
      async capture() {
        return { ok: false, error: 'supabase paused' };
      },
    });
    const d = db();
    const provider = createMemoryProvider({ db: d, brain });
    const out = await provider.remember({ text: 'x' });
    d.close();

    expect(out.ok).toBe(false);
    expect(out).toMatchObject({ error: 'supabase paused' });
  });

  test('a brain with no capture says so rather than pretending to have written', async () => {
    const d = db();
    const provider = createMemoryProvider({ db: d, brain: fakeBrain() });
    const out = await provider.remember({ text: 'x' });
    d.close();

    expect(out.ok).toBe(false);
  });
});

describe('the HTTP surface Hermes curls', () => {
  const read = (p: string) =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('node:fs').readFileSync(require('node:path').join(process.cwd(), p), 'utf8');

  test('GET serves the brief and POST writes a memory', () => {
    const src = read('app/api/memory/route.ts');
    expect(src).toContain('export async function GET');
    expect(src).toContain('export async function POST');
  });

  test('format=md returns raw markdown, so a shell worker can pipe it', () => {
    const src = read('app/api/memory/route.ts');
    expect(src).toContain("'md'");
    expect(src).toContain('text/markdown');
  });

  test('better-sqlite3 keeps the route on the node runtime', () => {
    expect(read('app/api/memory/route.ts')).toContain("runtime = 'nodejs'");
  });

  /**
   * Every other route here rides the private network trust model. This one hands over
   * the whole business memory in a single GET, and the Railway pool reaches it
   * from outside the host, so it takes an OPTIONAL shared secret: set
   * MEMORY_API_TOKEN and it is enforced, leave it unset and nothing changes.
   */
  test('the token guard is opt-in and fails closed once it is set', () => {
    const src = read('app/api/memory/route.ts');
    expect(src).toContain('MEMORY_API_TOKEN');
    expect(src).toContain('401');
  });
});
