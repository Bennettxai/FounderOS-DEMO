import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Mock 1g (interaction rebrand handoff, artboard 1g): "/agents — numbers count
 * in, Run ▸ → spinner + elapsed → ✓, click a task to review it in place".
 *
 * Three things change on this screen. The tab strip stops jumping (it becomes
 * the shared sliding-indicator strip). The seat Run control gains the missing
 * done phase, so a click answers in the same frame instead of waiting for the
 * next 4s board poll. And a task card becomes a lens row you can open in place
 * to approve or dismiss, writing to the SAME persisted decision store the
 * deliverables queue already uses (namespaced `board:<issueId>`), so the call
 * survives a reload and follows him between machines.
 */
describe('/agents mock-1g: the tab strip never jumps', () => {
  const tabs = read('components/AgentsTabs.tsx');

  test('it uses the shared sliding-indicator strip at the mock width', () => {
    expect(tabs).toContain('SlidingTabs');
    expect(tabs).toContain('tabWidth={150}');
  });

  test('the hand-rolled per-tab bottom border is gone', () => {
    expect(tabs).not.toContain('border-b-2');
  });

  test('the badges stay round and keep meaning status', () => {
    expect(tabs).toContain('rounded-full');
    expect(tabs).toContain('bg-os-warn');
    expect(tabs).toContain('bg-os-err');
    expect(tabs).toContain('bg-os-ok');
  });

  test('the embed moves onto the rebrand radius', () => {
    expect(tabs).toContain('rounded-panel');
    expect(tabs).not.toContain('rounded-lg ');
  });
});

describe('/agents mock-1g: the board numbers count in on lens rows', () => {
  const board = read('components/BoardLive.tsx');

  test('stat values still count up', () => {
    expect(board).toContain("from '@/components/CountUp'");
    expect(board).toContain('<CountUp');
  });

  test('stat tiles and seat chips are lens rows', () => {
    expect(board).toContain('pressable is-row');
    expect(board).toContain('data-lens="r"');
  });

  test('the run feed rows are lens rows that enter', () => {
    expect(board).toContain('animate-enter');
    // the feed row, not just the task card
    expect(board).toMatch(/pressable is-row[^`"]*items-baseline|items-baseline[^`"]*pressable is-row/);
  });
});

describe('/agents mock-1g: seat Run is idle → busy + elapsed → done', () => {
  const board = read('components/BoardLive.tsx');

  test('the idle Play button is replaced by the three-state control', () => {
    expect(board).toContain('AsyncButton');
    expect(board).toContain('showElapsed');
    expect(board).toContain('▸');
    expect(board).not.toContain('<Play ');
  });

  test('the board-truth running branch survives (spinner + real elapsed)', () => {
    expect(board).toContain('Loader2');
    expect(board).toContain('<Elapsed since={');
  });

  test('the run still hits the real board route', () => {
    expect(board).toContain('/api/board/agents/');
    expect(board).toContain("method: 'POST'");
  });
});

describe('/agents mock-1g: a task opens in place to approve or dismiss', () => {
  const card = read('components/BoardTaskCard.tsx');
  const board = read('components/BoardLive.tsx');

  test('the card is a keyboard-operable row, not a nested button', () => {
    expect(card.startsWith("'use client'")).toBe(true);
    expect(card).toContain('role="button"');
    expect(card).toContain('tabIndex={0}');
    expect(card).toContain('onKeyDown');
    expect(card).toContain("'Enter'");
    expect(card).toContain("' '");
    // Approve and Dismiss are siblings, which is fine. What is forbidden is a
    // <button> opening while another is still open: a button inside a button is
    // invalid markup browsers silently unnest, and a 1.05 control scale inside a
    // 1.02 row scale is the same mistake in the lens vocabulary.
    let depth = 0;
    const jsx = card.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const tok of jsx.match(/<button|<\/button>/g) ?? []) {
      if (tok === '<button') {
        expect(depth).toBe(0);
        depth += 1;
      } else depth -= 1;
    }
    expect(depth).toBe(0);
  });

  test('it is a lens row and the action row is a lens control that does not re-toggle', () => {
    expect(card).toContain('pressable is-row');
    expect(card).toContain('data-lens="r"');
    expect(card).toContain('stopPropagation');
    expect(card).toContain('animate-enter');
  });

  test('approve and dismiss write to the real persisted decision store', () => {
    expect(card).toContain('Approve');
    expect(card).toContain('Dismiss');
    expect(card).toContain('/api/board/deliverables/decision');
    expect(card).toContain("method: 'POST'");
    expect(card).toContain('boardTaskDecisionId');
    expect(card).toContain("'approved'");
    expect(card).toContain("'dismissed'");
  });

  test('an approved card wears the ok edge and says so', () => {
    expect(card).toContain('var(--ok) 35%');
    expect(card).toContain('approved');
  });

  test('the board renders the card instead of an inert div', () => {
    expect(board).toContain('BoardTaskCard');
  });
});

describe('/agents mock-1g: decisions ride the live payload', () => {
  test('the payload type carries them and namespaces board tasks', () => {
    const lib = read('lib/board-live.ts');
    expect(lib).toContain('decisions: DeliverableDecision[]');
    expect(lib).toContain('boardTaskDecisionId');
    expect(lib).toContain('board:');
  });

  test('both the first paint and the poll read them from the repo layer', () => {
    for (const p of ['app/agents/page.tsx', 'app/api/board/live/route.ts']) {
      const src = read(p);
      expect(src).toContain('deliverableDecisions.all()');
      expect(src).toContain('decisions');
    }
  });
});

describe('/agents mock-1g: rebrand radius tokens', () => {
  const board = read('components/BoardLive.tsx');
  const card = read('components/BoardTaskCard.tsx');

  test('the premium-pass structural radii are gone from the board', () => {
    expect(board).not.toContain('rounded-lg-t');
    expect(board).not.toContain('rounded-sm-t');
    expect(card).not.toContain('rounded-sm-t');
  });

  test('the panel uses panel and every inner box uses ctl', () => {
    expect(board).toContain('rounded-panel');
    expect(board).toContain('rounded-ctl');
    expect(card).toContain('rounded-ctl');
  });

  test('nothing animates border-radius', () => {
    for (const src of [board, card]) {
      expect(src).not.toContain('transition-all');
      expect(src).not.toMatch(/transition-\[[^\]]*border-radius/);
    }
  });
});
