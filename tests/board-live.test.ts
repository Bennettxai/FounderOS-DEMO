import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { CORE_ISSUE_LANES, SEAT_CENTRE_SLOT, boardStats, groupIssues, modelSummary, orderRuns, orderSeats, runDuration, runningSince } from '@/lib/board-live';
import type { PaperclipAgent, PaperclipIssue, PaperclipRun } from '@/lib/connectors/paperclip';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * BoardLive (the operator, 2026-08-07): the live Paperclip board rendered natively
 * on /agents — seat chips with models, the heartbeat run feed, task lanes,
 * all polling. The OS is the face; Paperclip stays the engine.
 */

const agent = (over: Partial<PaperclipAgent>): PaperclipAgent => ({
  id: 'a1',
  name: 'Agent',
  status: 'idle',
  adapterType: 'hermes',
  model: 'glm-5.2',
  lastHeartbeatAt: null,
  ...over,
});

describe('modelSummary — what models hold seats right now', () => {
  test('groups by model, most common first', () => {
    const s = modelSummary([
      agent({ id: '1', model: 'glm-5.2' }),
      agent({ id: '2', model: 'glm-5.2' }),
      agent({ id: '3', model: 'claude-local', adapterType: 'claude_local' }),
    ]);
    expect(s).toBe('glm-5.2 x2 · claude-local x1');
  });

  test('a seat without a model shows its adapter type, never disappears', () => {
    expect(modelSummary([agent({ model: null, adapterType: 'codex' })])).toBe('codex x1');
    expect(modelSummary([agent({ model: null, adapterType: null })])).toBe('unconfigured x1');
  });
});

const issue = (over: Partial<PaperclipIssue>): PaperclipIssue => ({
  id: 'i1',
  identifier: 'BOS-1',
  title: 'Task',
  status: 'todo',
  assigneeName: null,
  updatedAt: null,
  ...over,
});

describe('groupIssues — board lanes', () => {
  test('known lanes ride in order, unknown statuses append, cancelled hidden', () => {
    const lanes = groupIssues([
      issue({ id: '1', status: 'done' }),
      issue({ id: '2', status: 'todo' }),
      issue({ id: '3', status: 'triage' }),
      issue({ id: '4', status: 'in_progress' }),
      issue({ id: '5', status: 'cancelled' }),
    ]);
    expect(lanes.map((l) => l.status)).toEqual(['in_progress', 'todo', 'done', 'triage']);
    expect(lanes.flatMap((l) => l.issues).find((i) => i.status === 'cancelled')).toBeUndefined();
  });

  /**
   * the operator, 2026-08-18: "I don't know why the task lanes don't show at least
   * two or three stages of the tasks. There was more there and now it just
   * shows me the done ones."
   *
   * Nothing changed in the code — the BOARD emptied out. Every open task got
   * finished, so every lane but `done` disappeared and the pipeline read like
   * the feature had broken. An empty lane is information; a missing lane looks
   * like a bug. The three stages always render.
   */
  test('the pipeline stages always render, even when a stage holds nothing', () => {
    const lanes = groupIssues([issue({ id: '1', status: 'done' })]);
    expect(lanes.map((l) => l.status)).toEqual([...CORE_ISSUE_LANES]);
    expect(lanes.find((l) => l.status === 'in_progress')!.issues).toEqual([]);
    expect(lanes.find((l) => l.status === 'todo')!.issues).toEqual([]);
    expect(lanes.find((l) => l.status === 'done')!.issues).toHaveLength(1);
  });

  test('a completely empty board still shows the stages', () => {
    expect(groupIssues([]).map((l) => l.status)).toEqual([...CORE_ISSUE_LANES]);
  });

  test('the optional lanes stay hidden until they actually hold work', () => {
    expect(groupIssues([]).map((l) => l.status)).not.toContain('blocked');
    expect(groupIssues([]).map((l) => l.status)).not.toContain('in_review');
    // the live board spells review 'in_review', so it has to be a known lane
    // and sit in pipeline order rather than getting appended after done
    const lanes = groupIssues([issue({ id: '1', status: 'in_review' }), issue({ id: '2', status: 'done' })]);
    expect(lanes.map((l) => l.status)).toEqual(['in_progress', 'in_review', 'todo', 'done']);
  });
});

const run = (over: Partial<PaperclipRun>): PaperclipRun => ({
  id: 'r1',
  agentId: 'a1',
  agentName: 'Agent',
  status: 'completed',
  startedAt: '2026-08-07T05:00:00Z',
  finishedAt: '2026-08-07T05:00:14Z',
  ...over,
});

describe('run feed ordering + duration', () => {
  test('newest first, unstamped runs last', () => {
    const ordered = orderRuns([
      run({ id: 'old', startedAt: '2026-08-07T04:00:00Z' }),
      run({ id: 'unstamped', startedAt: null }),
      run({ id: 'new', startedAt: '2026-08-07T05:30:00Z' }),
    ]);
    expect(ordered.map((r) => r.id)).toEqual(['new', 'old', 'unstamped']);
  });

  test('duration reads human, in-flight runs have none', () => {
    expect(runDuration(run({}))).toBe('14s');
    expect(runDuration(run({ finishedAt: '2026-08-07T05:03:12Z' }))).toBe('3m 12s');
    expect(runDuration(run({ finishedAt: null }))).toBeNull();
  });
});

describe('boardStats — the de-demo numbers row, all from live board data', () => {
  const NOW = new Date('2026-08-07T12:00:00Z').getTime();
  test('seats, running, open tasks, and 24h windows all derive from the payload', () => {
    const s = boardStats(
      {
        agents: [
          agent({ id: '1', status: 'running', lastHeartbeatAt: '2026-08-07T11:00:00Z' }),
          agent({ id: '2', status: 'idle', lastHeartbeatAt: '2026-08-01T11:00:00Z' }), // stale heartbeat
          agent({ id: '3', status: 'error' }),
        ],
        issues: [
          issue({ id: '1', status: 'in_progress' }),
          issue({ id: '2', status: 'done' }),
          issue({ id: '3', status: 'cancelled' }),
          issue({ id: '4', status: 'todo' }),
        ],
        runs: [
          run({ id: 'r1', startedAt: '2026-08-07T09:00:00Z' }),
          run({ id: 'r2', startedAt: '2026-08-05T09:00:00Z' }), // outside 24h
          run({ id: 'r3', startedAt: null }),
        ],
      },
      NOW,
    );
    expect(s).toEqual({ seats: 3, running: 1, openTasks: 2, runs24h: 1, heartbeats24h: 1 });
  });
});

describe('GET /api/board/live — honest aggregated snapshot', () => {
  test('unconfigured board answers 200 with connected:false and empty lists', async () => {
    const mod = await import('@/app/api/board/live/route');
    const res = (await mod.GET()) as Response;
    expect(res.status).toBe(200);
    const body = (await res.json()) as { connected: boolean; agents: unknown[]; issues: unknown[]; runs: unknown[] };
    expect(body.connected).toBe(false);
    expect(body.agents).toEqual([]);
    expect(body.issues).toEqual([]);
    expect(body.runs).toEqual([]);
  });
});

describe('BoardLive wiring contracts', () => {
  test('the strip polls the live route and pauses when the tab is hidden', () => {
    const src = read('components/BoardLive.tsx');
    expect(src).toContain("fetch('/api/board/live', { cache: 'no-store' })");
    expect(src).toContain('setInterval(tick, POLL_MS)');
    expect(src).toContain('document.hidden');
  });

  test('every seat chip has a real Run button and shows its model', () => {
    const src = read('components/BoardLive.tsx');
    expect(src).toContain('/api/board/agents/${agent.id}/run');
    expect(src).toContain('modelSummary(data.agents)');
    expect(src).toContain("agent.model ?? agent.adapterType ?? 'unconfigured'");
  });

  test('unreachable board renders an honest dead strip, no fake green', () => {
    const src = read('components/BoardLive.tsx');
    expect(src).toContain('board unreachable');
    expect(src).toContain('No fake data');
  });

  test('/agents is de-demo: live board + real CEO chat only, no seeded roster', () => {
    const page = read('app/agents/page.tsx');
    expect(page).toContain('<BoardLive initial={boardInitial}');
    expect(page.indexOf('<BoardLive')).toBeLessThan(page.indexOf('<ConductorChat'));
    // the seeded demo is gone: no seeded roster cards, fake-tool chats,
    // seeded stats, activity feed, or cost analysis
    for (const gone of ['AgentRosterCard', 'AgentActivityFeed', 'AgentCostAnalysis', 'AgentWorkPanel']) {
      expect(page).not.toContain(gone);
    }
    // the page may touch the repo layer (his approve/dismiss calls on board
    // tasks live there), but never to re-seed a roster out of it
    expect(page).not.toMatch(/getDb\(\)\.(agents|departments|metrics|tools)/);
  });

  test('the stats row rides inside BoardLive so it polls live with everything else', () => {
    const src = read('components/BoardLive.tsx');
    expect(src).toContain('boardStats(data)');
    for (const label of ['Seats', 'Running now', 'Open tasks', 'Runs · 24h', 'Heartbeats · 24h']) {
      expect(src).toContain(label);
    }
  });

  /**
   * The board holds 134 issues, 132 of them done. Fetching the newest 40 got
   * 40 done rows and nothing else, so the lanes showed a single DONE column
   * and "Open tasks" read 0 while two tasks were genuinely open. The cap has
   * to clear the done backlog or the number on the card is a lie.
   */
  test('the issues fetch is deep enough that open work is not buried under done', () => {
    // BOTH readers, or the fix lasts exactly one paint: the page renders the
    // first payload and /api/board/live overwrites it every 4s.
    for (const file of ['app/agents/page.tsx', 'app/api/board/live/route.ts']) {
      const limit = read(file).match(/paperclipIssues\((\d+)\)/);
      expect(limit, `${file} fetches issues`).toBeTruthy();
      expect(Number(limit![1]), `${file} issue cap`).toBeGreaterThanOrEqual(200);
    }
  });

  /**
   * The board gets a `minmax(0,1fr)` column beside the 400px Conductor rail,
   * so on the operator's screen it renders around 780px wide, not full width. Every
   * one of these is something that overflowed or got clipped at that size.
   */
  describe('the strip reads correctly at the width it actually gets', () => {
    const src = read('components/BoardLive.tsx');

    test('stat labels wrap instead of running out the side of the card', () => {
      // 'Heartbeats · 24h' escaped its box: the shared <Label> hard-codes
      // whitespace-nowrap, which is right for section heads and wrong here.
      expect(src).toContain('function StatLabel');
      expect(src).toContain('<StatLabel>{label}</StatLabel>');
      expect(src).not.toContain('<Label>{label}</Label>');
    });

    test('the model roster shows every model instead of trailing off in an ellipsis', () => {
      // it used to be `ml-auto truncate` inside the header row, so six models
      // clipped to '... codex_local x1 …' and the rest were unreadable
      expect(src).toMatch(/modelSummary\(data\.agents\)/);
      expect(src).not.toMatch(/ml-auto truncate[^"]*"[\s\S]{0,120}modelSummary/);
    });

    test('seat chips stay two lines tall, with tooltips carrying the full strings', () => {
      // Wrapping the name and model so nothing was cut made the chips up to
      // twice as tall. the operator, 2026-08-18: "the agent boxes are too big now".
      // Compact wins; hover reveals the rest, and the header roster already
      // lists every model in play.
      expect(src).toMatch(/truncate text-\[11\.5px\] font-semibold/);
      expect(src).toContain('title={agent.name}');
      expect(src).not.toMatch(/break-words text-\[11px\] font-semibold/);
    });

    test('the lanes get the wide column and the run feed the narrow one', () => {
      expect(src).toMatch(/lg:grid-cols-\[minmax\(0,[\w.]+\)_minmax\(0,1fr\)\]/);
      expect(src.indexOf('Run feed')).toBeLessThan(src.indexOf('Task lanes'));
    });

    test('the run feed spends its width on the agent name, not the word succeeded', () => {
      // narrowing the feed column to give the lanes room clipped 'Conductor'
      // to 'Cond…'; the tick glyph already says the run finished cleanly
      expect(src).toContain('{!RUN_OK.has(r.status) && <span className={runColor(r.status)}>{r.status}</span>}');
    });

    test('an empty lane says so instead of vanishing', () => {
      expect(src).toContain('lane.issues.length === 0');
    });
  });

  test('the Conductor chat polls continuously and shows a thinking bubble', () => {
    const src = read('components/ConductorChat.tsx');
    expect(src).toContain('data-thinking');
    expect(src).toContain('setInterval');
    // typing never hard-locks during a CEO run: the composer's textarea
    // carries no disabled attribute (only the send button gates on sending)
    expect(read('components/ConductorComposer.tsx')).not.toMatch(/<textarea[^>]*disabled/s);
  });
});

/**
 * Live spinner on every seat (the operator, 2026-08-14): the Claude-style loading
 * symbol the Conductor shows in the side panel should appear on each agent box
 * the moment that agent turns on, so the board reads as interactive rather
 * than as a static grid of chips.
 */
describe('per-seat run spinner', () => {
  const run = (over: Partial<PaperclipRun>): PaperclipRun => ({
    id: 'r1',
    agentId: 'a1',
    agentName: null,
    status: 'running',
    startedAt: '2026-08-14T10:00:00.000Z',
    finishedAt: null,
    ...over,
  });

  test('runningSince returns the in-flight run start for that agent', () => {
    const runs = [run({ id: 'r1', agentId: 'a1' })];
    expect(runningSince(runs, 'a1')).toBe('2026-08-14T10:00:00.000Z');
  });

  test('an agent with no open run has no elapsed clock', () => {
    const runs = [run({ agentId: 'a1', status: 'succeeded', finishedAt: '2026-08-14T10:01:00.000Z' })];
    expect(runningSince(runs, 'a1')).toBeNull();
    expect(runningSince(runs, 'nobody')).toBeNull();
  });

  test('the newest in-flight run wins when a seat has more than one', () => {
    const runs = [
      run({ id: 'old', startedAt: '2026-08-14T09:00:00.000Z' }),
      run({ id: 'new', startedAt: '2026-08-14T11:00:00.000Z' }),
    ];
    expect(runningSince(runs, 'a1')).toBe('2026-08-14T11:00:00.000Z');
  });

  test('runs the board never stamped are ignored rather than crashing', () => {
    expect(runningSince([run({ startedAt: null })], 'a1')).toBeNull();
  });

  test('the model line never disappears while a seat is running', () => {
    const src = read('components/BoardLive.tsx');
    // the model/adapter readout renders unconditionally — the operator, 2026-08-14:
    // "I want to be able to see the model still underneath the word of the
    // agent. I do not want that to disappear while it's running."
    const modelLine = src.indexOf("agent.model ?? agent.adapterType ?? 'unconfigured'");
    expect(modelLine).toBeGreaterThan(-1);
    // and it is not wrapped in the live ternary (the ternary now only owns the
    // right-hand Run/spinner column)
    expect(src).not.toMatch(/live \? \([^)]*agent\.model/s);
  });

  test('while live the Run control becomes a circular spinner with the elapsed clock under it', () => {
    const src = read('components/BoardLive.tsx');
    expect(src).toContain('Loader2');
    expect(src).toContain('animate-spin');
    // instant local feedback on click, before the 4s board poll catches up:
    // a click owns the control until its done tick has been seen
    expect(src).toMatch(/running \|\| owned/);
    // the clock derives from the seat's real in-flight run
    expect(src).toContain('runningSince(');
    expect(src).toContain('<Elapsed');
  });

  test('every seat wears its own glyph, colored by department', () => {
    const src = read('components/BoardLive.tsx');
    expect(src).toContain('SEAT_GLYPHS');
    // the known board seats all resolve to a distinct icon
    for (const pattern of ['conductor', 'tech', 'marketing', 'finance', 'sales', 'comm', 'forge', 'hermes', 'summar', 'reflect']) {
      expect(src.toLowerCase()).toContain(pattern);
    }
    // status overrides the department color: green while running, red on error
    expect(src).toMatch(/error.*var\(--err\)/s);
    expect(src).toMatch(/running.*var\(--ok\)/s);
  });

  test('Synthesizing supports a compact variant so it fits inside a seat chip', () => {
    const src = read('components/Synthesizing.tsx');
    expect(src).toContain('compact');
  });
});

/**
 * Seat chip order (the operator, 2026-08-18): "place the conductor in the middle of
 * the board where the Hermes worker is ... Switch the Hermes worker with the
 * conductor slot ... I want that to be in the middle because it's the
 * centralized agent."
 *
 * A screenshot of the live board pinned the geometry down: the top row is five
 * chips, Hermes Workers held slot 2 (dead centre) and the Conductor slot 4. So
 * this is a swap of exactly those two chips, and every other seat keeps the
 * position the board handed it.
 */
describe('orderSeats — Conductor holds the centre chip', () => {
  const seats = (...names: string[]) => names.map((n, i) => agent({ id: `id-${i}`, name: n }));
  // the real board order, as rendered in the operator's 2026-08-18 screenshot
  const BOARD = [
    'Reflection Coach', 'TECH', 'Hermes Workers', 'Communications', 'Conductor',
    'Summarizer', 'Forge', 'Finances', 'Sales', 'Marketing/Growth',
  ];

  test('the live board comes out with Conductor centred and Hermes in its old chip', () => {
    expect(orderSeats(seats(...BOARD)).map((s) => s.name)).toEqual([
      'Reflection Coach', 'TECH', 'Conductor', 'Communications', 'Hermes Workers',
      'Summarizer', 'Forge', 'Finances', 'Sales', 'Marketing/Growth',
    ]);
  });

  test('the Conductor lands in the centre column', () => {
    expect(orderSeats(seats(...BOARD))[SEAT_CENTRE_SLOT].name).toBe('Conductor');
  });

  /** The point of a swap: nothing else is allowed to move. */
  test('every other seat keeps the position the board gave it', () => {
    const out = orderSeats(seats(...BOARD)).map((s) => s.name);
    BOARD.forEach((name, i) => {
      if (name === 'Conductor' || i === SEAT_CENTRE_SLOT) return;
      expect(out[i], `${name} should not have moved`).toBe(name);
    });
  });

  /** The board reshuffles between polls, so the displaced seat varies. The
   *  invariant that must hold is the Conductor's slot, not who it trades with. */
  test('the Conductor is centred whatever order the board sends', () => {
    for (const order of [BOARD, [...BOARD].reverse(), [...BOARD].slice(3).concat(BOARD.slice(0, 3))]) {
      expect(orderSeats(seats(...order))[SEAT_CENTRE_SLOT].name).toBe('Conductor');
    }
  });

  test('no seat is dropped or duplicated', () => {
    const out = orderSeats(seats(...BOARD));
    expect(out).toHaveLength(BOARD.length);
    expect(new Set(out.map((s) => s.name)).size).toBe(BOARD.length);
  });

  test('a board with no Conductor is passed through untouched', () => {
    expect(orderSeats(seats('Zeta', 'Alpha', 'Mid')).map((s) => s.name)).toEqual(['Zeta', 'Alpha', 'Mid']);
  });

  test('a board too small to have a centre slot does not throw', () => {
    expect(orderSeats(seats('Conductor')).map((s) => s.name)).toEqual(['Conductor']);
    expect(orderSeats(seats('Forge', 'Conductor')).map((s) => s.name)).toEqual(['Forge', 'Conductor']);
    expect(orderSeats([])).toEqual([]);
  });

  test('a Conductor already centred is left alone', () => {
    const already = ['Forge', 'Sales', 'Conductor', 'TECH'];
    expect(orderSeats(seats(...already)).map((s) => s.name)).toEqual(already);
  });
});

describe('the seat grid actually uses the ordering', () => {
  test('BoardLive renders ordered seats, not the raw board array', () => {
    const src = read('components/BoardLive.tsx');
    expect(src).toMatch(/orderSeats\(data\.agents\)/);
    expect(src).not.toMatch(/data\.agents\.map\(\(a\) => \(\s*<SeatChip/);
  });

  /** The centre slot is only the centre if the grid is as wide as it claims. */
  test('the chip grid is still five wide at xl, which is what centres slot 2', () => {
    expect(read('components/BoardLive.tsx')).toMatch(/xl:grid-cols-5/);
  });
});
