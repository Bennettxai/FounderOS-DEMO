import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Step 3 of the interaction rebrand: the /comms messaging tab is a three-pane
 * mail view — sources rail (200px) / message list (1fr) / reader (380px) —
 * instead of five side-by-side lane columns. The old board stays on disk
 * (CommsBoard) for an easy revert, same deal as CommsGravity.
 */
describe('/comms three-pane messaging view', () => {
  const pane = read('components/CommsThreePane.tsx');
  const tabs = read('components/CommsTabs.tsx');

  test('the grid is sources / list / reader at the spec widths', () => {
    expect(pane).toContain('200px_minmax(0,1fr)_380px');
  });

  test('panes derive from the pure comms-panes layer, not ad-hoc filtering', () => {
    expect(pane).toMatch(/from '@\/lib\/comms-panes'/);
    expect(pane).toContain('buildCommsSources');
    expect(pane).toContain('itemsForSource');
    expect(pane).toContain('removeItem');
  });

  test('reply goes out for real through the existing SMTP route', () => {
    expect(pane).toContain("'/api/comms/reply'");
    expect(pane).toMatch(/account/);
  });

  test('archive and snooze are optimistic with an undo toast', () => {
    expect(pane).toMatch(/toast\.ok\([^)]*\)/); // shared Toaster api, undo callback included
    expect(pane).toMatch(/[Aa]rchive/);
    expect(pane).toMatch(/[Ss]nooze/);
    expect(pane).toMatch(/[Dd]elegate/);
  });

  test('the list handles the step-3 keys: arrows move, e archives, d delegates', () => {
    expect(pane).toContain('ArrowDown');
    expect(pane).toContain('ArrowUp');
    expect(pane).toMatch(/'e'/);
    expect(pane).toMatch(/'d'/);
  });

  test('selected row gets the left indicator bar, unread rows a pop dot', () => {
    expect(pane).toMatch(/animate-pop/);
  });

  test('CommsTabs mounts the three-pane view and retires the lane board from the tab', () => {
    expect(tabs).toContain('CommsThreePane');
    expect(tabs).not.toContain('<CommsBoard');
  });

  test('the Slack client board and channel grid live inside a source, not below the board', () => {
    expect(pane).toContain('SlackClientBoard');
    expect(pane).toMatch(/slack-channels/);
  });
});

/**
 * Step 9 of the interaction rebrand: the full keyboard on the message list
 * (j/k aliases, s snooze, r reply, z undo, 1-6 source switch, Esc clear),
 * a .kbd legend in the empty reader, and an empty list that says what is
 * empty, why, and one way out (undo last / all sources).
 */
describe('/comms step-9 keyboard + empty states', () => {
  const pane = read('components/CommsThreePane.tsx');

  test('j/k move like the arrows', () => {
    expect(pane).toMatch(/'j'/);
    expect(pane).toMatch(/'k'/);
  });

  test('s snoozes, r opens the reply composer, z undoes the last dismiss', () => {
    expect(pane).toMatch(/'s'/);
    expect(pane).toMatch(/'r'/);
    expect(pane).toMatch(/'z'/);
    expect(pane).toContain('lastUndo');
  });

  test('digits 1-6 switch source by rail order, Esc clears the selection', () => {
    expect(pane).toMatch(/\^\[1-6\]\$/);
    expect(pane).toContain('Escape');
  });

  test('the empty reader renders the key legend with .kbd chips', () => {
    expect(pane).toMatch(/className="kbd"/);
    expect(pane).toMatch(/snooze/i);
    expect(pane).toMatch(/undo/i);
  });

  test('an emptied source offers a way out: undo last / all sources', () => {
    expect(pane).toMatch(/undo last/i);
    expect(pane).toMatch(/all sources/i);
  });
});

/**
 * Mock 1e polish (the operator, 2026-09-07): the list carries a header line naming
 * the source and sort, the rail carries the 1-6 hint plus a footer note saying
 * where Slack channels and Recordings went, the reader leads with a
 * SOURCE · time eyebrow over the sender with a "from" line under it, and the
 * Reply action is the filled primary while Archive/Delegate/Snooze stay quiet.
 */
describe('/comms mock-1e polish', () => {
  const pane = read('components/CommsThreePane.tsx');

  test('the message list has a source / sort header line', () => {
    expect(pane).toMatch(/newest first/);
  });

  test('the rail carries the 1-6 hint and the moved-things footer note', () => {
    expect(pane).toMatch(/1-6/);
    expect(pane).toMatch(/moved under the Slack source/);
    expect(pane).toMatch(/Recordings has its own tab/);
  });

  test('the reader leads with a source-and-time eyebrow and a from line', () => {
    expect(pane).toMatch(/row\.laneName.*·.*ago\(|ago\(.*·.*row\.laneName/s);
    expect(pane).toMatch(/from /);
  });

  test('Reply is the filled primary action', () => {
    // the action-bar Reply button carries the filled treatment, not an outline
    expect(pane).toMatch(/bg-os-text text-os-ink[\s\S]{0,320}Reply/);
  });
});
