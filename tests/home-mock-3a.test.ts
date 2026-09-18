import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Mock 3a (interaction rebrand handoff, artboard 3a): the operator console.
 *
 *   "header + state line; 4 pulse tiles (count-in 900 ms); Needs you queue
 *    ranked by the Conductor (item = kind glyph ✉ ◐ ! $, source, text, 'why
 *    here · …', primary action with async states, secondary/delegate, Snooze;
 *    handled items leave with a 2.6 s toast + undo; empty state 'Nothing needs
 *    you.'); Interject textarea auto-routed …; Done today ledger. Drop the
 *    ticker, connections strip and agents list from Home."
 *
 * The header, the tiles, the composer and the ledger were already there. The
 * queue is the delta: it rendered board FILES, and 3a wants the ask itself,
 * answerable in place.
 */
describe('/ mock-3a: the queue is the Conductor queue', () => {
  const list = read('components/NeedsYouList.tsx');

  test('the section says who ranked it and how', () => {
    expect(list).toContain('ranked by the Conductor');
    expect(list).toContain('people first, then deadlines');
  });

  test('a row leads with the kind glyph in its own box', () => {
    expect(list).toContain('c.glyph');
    expect(list).toContain('c.glyphTone');
  });

  test('a row says where it came from and why it is here', () => {
    expect(list).toContain('why here ·');
    expect(list).toContain('c.why');
  });

  test('the empty state is the mock line, not the old paragraph', () => {
    expect(list).toContain('Nothing needs you.');
    expect(list).toContain('the Conductor will surface the next thing here');
    expect(list).not.toContain('Nothing is waiting on you.');
  });

  test('it still derives from the deliverables payload rather than polling', () => {
    expect(list).toContain('needsYou(files)');
    expect(list).not.toContain('fetch(');
    expect(list).not.toContain('setInterval');
  });
});

describe('/ mock-3a: a row is answerable in place', () => {
  const list = read('components/NeedsYouList.tsx');
  const home = read('components/HomeNeedsYou.tsx');

  test('the primary action is the three-state async control', () => {
    expect(list).toContain('AsyncButton');
    expect(list).toContain('busyLabel');
    expect(list).toContain('doneLabel');
  });

  test('approve, dismiss and snooze are all on the row', () => {
    expect(list).toContain("'approved'");
    expect(list).toContain("'dismissed'");
    expect(list).toMatch(/snooze/i);
  });

  test('handling one raises a toast that can be undone', () => {
    expect(list).toContain('useToast');
    expect(list).toContain('undo');
  });

  test('undo really reverses it — the decision is cleared, not re-recorded', () => {
    expect(list).toMatch(/onDecide\([^)]*null/);
  });

  test('the console wires the row to the same decide() the review panel uses', () => {
    expect(home).toContain('onDecide');
    expect(home).toContain('decide(');
  });

  test('clicking a control does not also open the review panel', () => {
    expect(list).toContain('stopPropagation');
    expect(list).toContain('onOpen(c)');
  });
});

describe('/ mock-3a: the console itself', () => {
  const page = read('app/page.tsx');

  test('the four pulse tiles count in', () => {
    expect(page).toContain('CountUp');
    expect((page.match(/<CountUp/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test('the ticker, the connections strip and the agents list are gone', () => {
    expect(page).not.toContain('Ticker');
    expect(page).not.toContain('ConnectionsStrip');
    expect(page).not.toMatch(/agents\.map\(/);
  });

  test('the interject composer and the done ledger stay', () => {
    expect(page).toContain('InterjectComposer');
    expect(page).toContain('Done today');
  });
});

describe('/ mock-3a: radius rule', () => {
  const list = read('components/NeedsYouList.tsx');
  const page = read('app/page.tsx');

  test('floating surfaces use the rebrand radii, nothing animates a corner', () => {
    expect(list).not.toContain('rounded-2xl');
    expect(list).toContain('rounded-panel');
    expect(page).toContain('rounded-tile');
    expect(page).not.toContain('rounded-lg-t');
  });
});

/**
 * The visual pass, taken from the runnable design bundle rather than from the
 * spec prose. Its `turn3Vals()` is the source for every number below:
 *
 *   homeTiles = [
 *     {href:'#3f', label:'Systems',        bars: conn.map(...)},          // per-connector, state-coloured
 *     {href:'#1g', label:'Agents live',    bars: spark([4,6,5,8,7,9,6])},
 *     {href:'#1e', label:'Communications', bars: spark([12,9,14,8,11,7,7])},
 *     {href:'#3b', label:'G-Brain health', bars: 10 fixed 5px cells, lit i < score/10},
 *   ]
 *   spark = (arr) => arr.map(v => ({h: 3 + 15*(v/max) + 'px', bg:'#9c9c9c'}))
 *   heroTxt = ['3 agents live · 6 idle', '1 connector down',
 *              '7 inbound overnight · 3 need you', 'brain 78/100', '1 run failed']
 *
 * Data stays real: the arrays above are the mock's samples, the shapes are the
 * spec. Nothing here invents a number the repos cannot answer.
 */
describe('mock-3a: the pulse tiles are bar cells, not line sparks', () => {
  const home = read('app/page.tsx');
  const terminal = read('components/terminal.tsx');

  test('agents and comms use the bar-cell foot, not the line Spark', () => {
    expect(home).toContain('<SparkBars');
    // the line spark is what the artboard does NOT use on these two tiles
    const agentsTile = home.slice(home.indexOf('label="Agents live"'), home.indexOf('label="Communications"'));
    expect(agentsTile).toContain('SparkBars');
    expect(agentsTile).not.toMatch(/<Spark\s/);
  });

  test('SparkBars is the artboard formula: 3px floor, 15px of travel, flex cells', () => {
    expect(terminal).toContain('export function SparkBars');
    const fn = terminal.slice(terminal.indexOf('export function SparkBars'));
    expect(fn).toContain('3 + 15');
    expect(fn).toContain('var(--muted)');
  });

  test('G-Brain health is ten cells that light with the score, not one filled rail', () => {
    const meter = home.slice(home.indexOf('function HealthMeter'));
    expect(meter).toContain('CELLS = 10');
    expect(meter).toContain('var(--border)');
  });

  test('every tile carries the ↗ open affordance the artboard puts in its corner', () => {
    const tile = home.slice(home.indexOf('function StatTile'), home.indexOf('type DoneItem'));
    expect(tile).toContain('↗');
    expect(tile).toContain('aria-hidden');
    // the artboard draws it at rest in #5c5c5c; it was hover-only here
    expect(tile).not.toContain('opacity-0');
  });
});

describe('mock-3a: the state line carries the artboard facts, all of them real', () => {
  const pulse = read('lib/pulse-history.ts');

  test('idle agents ride alongside live ones, as "N live · N idle"', () => {
    expect(pulse).toContain('idle');
  });

  test('the brain score shows at every health, not only when it is bad', () => {
    const fn = pulse.slice(pulse.indexOf('export function stateOfWorld'));
    expect(fn).toMatch(/brain \$\{f\.health\}\/100|brain `|brain \$\{/);
  });
});

describe('mock-3a: the composer names its destinations', () => {
  const ij = read('components/InterjectComposer.tsx');

  test('chips read as routes, the way the artboard labels them', () => {
    expect(ij).toContain('→ G-Brain');
    expect(ij).toContain('→ Board');
    expect(ij).toContain('→ Agent');
  });

  test('there is no "auto" chip: auto is the unpinned state, and the hint says so', () => {
    expect(ij).not.toMatch(/label: 'auto'/);
    expect(ij).toContain('auto-routed · Enter sends');
  });

  test('send is the round ↑, 26px, white fill', () => {
    expect(ij).toContain('↑');
    expect(ij).toContain('rounded-full');
  });
});

describe('mock-3a: the ledger uses the artboard glyphs', () => {
  const home = read('app/page.tsx');

  test('a finished run is a ✓, a payment is a $', () => {
    expect(home).toContain("head: '✓'");
    expect(home).toContain("head: '$'");
  });

  test('the eyebrow is the artboard\'s', () => {
    expect(home).toContain('eyebrow="command center"');
  });
});
