import { describe, expect, test } from 'vitest';
import {
  DELIVERABLES_OPENED_KEY,
  markManyOpened,
  markOpened,
  parseOpenedMap,
  unseenStateOf,
} from '@/lib/deliverables-opened';

/**
 * the operator, 2026-08-22: "When I get a deliverable, can you put the dot of what I
 * haven't seen any updates to on the actual piece of content that was created
 * so I can know that that was created?"
 *
 * The tab already had badges, but they run off the SEEN map, which
 * `acknowledge()` marks wholesale the instant he opens the Deliverables tab.
 * A per-row dot driven off that store would therefore vanish on the very click
 * that was supposed to show it to him.
 *
 * So the dot gets its own store, keyed on the thing he actually did: OPENED
 * this item, at this revision. It answers one question per row, "have I seen
 * THIS version of THIS file", which is exactly what he asked for and also
 * covers the case he cares about second: an agent rewriting something he
 * already read.
 */
const rev = (r: string) => r;

describe('unseenStateOf - one answer per row', () => {
  test('never opened is new, so a file that just appeared is marked', () => {
    expect(unseenStateOf({}, 'ws/a.md', rev('file|t1|10'))).toBe('new');
  });

  test('opened at this exact revision is not marked at all', () => {
    const opened = markOpened({}, 'ws/a.md', rev('file|t1|10'));
    expect(unseenStateOf(opened, 'ws/a.md', rev('file|t1|10'))).toBeNull();
  });

  test('opened, then rewritten by the agent, is updated rather than new', () => {
    const opened = markOpened({}, 'ws/a.md', rev('file|t1|10'));
    expect(unseenStateOf(opened, 'ws/a.md', rev('file|t2|84'))).toBe('updated');
  });

  test('a different file is unaffected by what he opened', () => {
    const opened = markOpened({}, 'ws/a.md', rev('file|t1|10'));
    expect(unseenStateOf(opened, 'ws/b.md', rev('file|t1|10'))).toBe('new');
  });

  test('a null store means this browser has never looked: nothing is marked', () => {
    // Otherwise the first load after this ships is a wall of dots on 98 files,
    // which is the same unusable noise in a different colour.
    expect(unseenStateOf(null, 'ws/a.md', rev('file|t1|10'))).toBeNull();
  });
});

describe('markOpened - clearing one dot never clears the others', () => {
  test('opening one file leaves the rest marked', () => {
    const opened = markOpened(markOpened({}, 'ws/a.md', 'r1'), 'ws/b.md', 'r1');
    expect(unseenStateOf(opened, 'ws/a.md', 'r1')).toBeNull();
    expect(unseenStateOf(opened, 'ws/c.md', 'r1')).toBe('new');
  });

  test('re-opening after a rewrite adopts the new revision', () => {
    let opened = markOpened({}, 'ws/a.md', 'r1');
    expect(unseenStateOf(opened, 'ws/a.md', 'r2')).toBe('updated');
    opened = markOpened(opened, 'ws/a.md', 'r2');
    expect(unseenStateOf(opened, 'ws/a.md', 'r2')).toBeNull();
  });

  test('markManyOpened marks a whole batch at once, for a bulk action', () => {
    const opened = markManyOpened({}, [
      { id: 'ws/a.md', revision: 'r1' },
      { id: 'ws/b.md', revision: 'r1' },
    ]);
    expect(unseenStateOf(opened, 'ws/a.md', 'r1')).toBeNull();
    expect(unseenStateOf(opened, 'ws/b.md', 'r1')).toBeNull();
  });
});

describe('parseOpenedMap - storage is untrusted', () => {
  test('unparseable storage reads as never-looked, which can only suppress a dot', () => {
    expect(parseOpenedMap('not json')).toBeNull();
    expect(parseOpenedMap(null)).toBeNull();
    expect(parseOpenedMap('[1,2,3]')).toBeNull();
  });

  test('a well formed map round trips', () => {
    const map = markOpened({}, 'ws/a.md', 'r1');
    expect(parseOpenedMap(JSON.stringify(map))).toEqual(map);
  });

  test('non-string values are dropped rather than trusted', () => {
    expect(parseOpenedMap('{"a":"r1","b":7,"c":null}')).toEqual({ a: 'r1' });
  });

  test('it does not share a key with the tab badge store', () => {
    // Sharing would put us right back where we started: acknowledging the tab
    // would clear every row dot.
    expect(DELIVERABLES_OPENED_KEY).not.toBe('founder-os:deliverables-seen');
  });
});
