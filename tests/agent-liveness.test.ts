import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * the operator, 2026-08-14: "I want the agents to feel alive when I'm using them."
 * A working agent must not simply turn green — the green travels around its
 * border — and a task being worked must breathe rather than sit on a colour.
 */
describe('agent liveness', () => {
  const css = read('app/globals.css');
  const board = read('components/BoardLive.tsx');

  test('the green orbits the border rather than sitting still', () => {
    expect(css).toMatch(/@property --agent-angle/);
    expect(css).toMatch(/conic-gradient\(\s*from var\(--agent-angle\)/);
    expect(css).toMatch(/@keyframes agent-orbit/);
    // masked to the 1px edge, so it reads as a border and not a filled card
    expect(css).toMatch(/mask-composite: exclude/);
  });

  test('a live agent seat gets the orbit, an idle one does not', () => {
    expect(board).toMatch(/live \? ' agent-live' : ''/);
  });

  test('a task being worked breathes, and its dot flashes with it', () => {
    expect(css).toMatch(/@keyframes task-breathe/);
    expect(css).toMatch(/@keyframes task-dot-flash/);
    // the card became its own client component when tasks got Approve/Dismiss
    const card = read('components/BoardTaskCard.tsx');
    expect(card).toMatch(/working && !approved \? 'task-live' : 'border-os-border'/);
    expect(card).toMatch(/working && !approved \? 'bg-os-ok task-live-dot'/);
  });

  test('a task counts as live because its assignee is actually running', () => {
    expect(board).toMatch(/const working = !!i\.assigneeName && agentRunning\.has\(i\.assigneeName\)/);
  });

  test('every liveness animation is disabled under reduced motion', () => {
    const guard = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)', css.indexOf('agent-orbit')));
    for (const cls of ['.agent-live::before', '.task-live', '.task-live-dot']) {
      expect(guard).toContain(cls);
    }
  });

  test('it degrades to a solid edge where @property is unsupported', () => {
    // the class carries its own border-color, so the orbit is an enhancement
    const block = css.slice(css.indexOf('.agent-live {'), css.indexOf('.agent-live::before'));
    expect(block).toMatch(/border-color:/);
  });
});

/**
 * The run feed used to stop short of the bottom of the screen, leaving dead
 * space, and threw away most of the runs it had already fetched.
 */
describe('/agents run feed fills its column', () => {
  test('the board column is given the row height, like the chat column beside it', () => {
    const page = read('app/agents/page.tsx');
    const board = page.indexOf('xl:col-start-1 xl:row-start-1 xl:h-full');
    expect(board).toBeGreaterThan(-1);
  });

  test('the feed no longer discards runs it already fetched', () => {
    const board = read('components/BoardLive.tsx');
    expect(board).not.toMatch(/orderRuns\(data\.runs\)\.slice\(0, 14\)/);
    expect(board).toMatch(/orderRuns\(data\.runs\)\.slice\(0, 120\)/);
  });
});

/**
 * the operator: "I don't only want to be able to see four emails from each inbox."
 * The cap was at FETCH time, so no amount of scrolling could reveal more.
 */
describe('comms depth', () => {
  test('inboxes pull far more than a screenful', () => {
    expect(read('lib/connectors/email.ts')).toMatch(/limitPerInbox = 40/);
    expect(read('lib/comms-lanes.ts')).toMatch(/latestEmails\(40\)/);
  });

  test('whatsapp does too', () => {
    expect(read('lib/connectors/whatsapp.ts')).toMatch(/recentChats\(limit = 40\)/);
    expect(read('lib/comms-lanes.ts')).toMatch(/recentChats\(40\)/);
  });

  test('the lane scrolls with the viewport instead of a fixed 460px box', () => {
    const comms = read('components/CommsBoard.tsx');
    expect(comms).not.toMatch(/max-h-\[460px\]/);
    expect(comms).toMatch(/max-h-\[calc\(100dvh-19rem\)\]/);
  });
});
