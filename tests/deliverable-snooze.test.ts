import { describe, expect, test } from 'vitest';
import {
  DELIVERABLES_SNOOZE_KEY,
  SNOOZE_MS,
  isSnoozed,
  parseSnoozeMap,
  pruneSnoozed,
  snoozeItem,
  unsnooze,
} from '@/lib/deliverable-snooze';

/**
 * Snooze (interaction rebrand handoff, artboard 3a): the third control on a
 * Needs you row. "Not now" is a real answer and it is NOT a decision — an
 * approve or a dismiss is recorded on the board and seen by the agent that
 * wrote the file, and neither of those is what he means when he skips one.
 *
 * So snooze deliberately does not go through DECISION_KINDS. It is a hold on
 * HIS view, in HIS browser, on the same storage discipline as
 * lib/deliverables-opened: no per-user server state exists, and anything
 * unreadable reads as "not snoozed", which can only ever show him more work
 * rather than silently hide it.
 */
describe('snoozing a queue row', () => {
  const now = Date.parse('2026-09-08T12:00:00.000Z');

  test('a snoozed row is held, and comes back by itself', () => {
    const map = snoozeItem({}, 'ws/a.md', now);
    expect(isSnoozed(map, 'ws/a.md', now)).toBe(true);
    expect(isSnoozed(map, 'ws/a.md', now + SNOOZE_MS - 1)).toBe(true);
    expect(isSnoozed(map, 'ws/a.md', now + SNOOZE_MS)).toBe(false);
  });

  test('a row nobody snoozed is never held', () => {
    expect(isSnoozed({}, 'ws/a.md', now)).toBe(false);
  });

  test('undo puts it straight back', () => {
    const map = snoozeItem({}, 'ws/a.md', now);
    expect(isSnoozed(unsnooze(map, 'ws/a.md'), 'ws/a.md', now)).toBe(false);
  });

  test('expired holds are dropped so the store cannot grow forever', () => {
    const map = { 'ws/old.md': now - 1, 'ws/live.md': now + 1000 };
    expect(pruneSnoozed(map, now)).toEqual({ 'ws/live.md': now + 1000 });
  });

  test('an unreadable store reads as nothing snoozed, never as everything', () => {
    expect(parseSnoozeMap(null)).toEqual({});
    expect(parseSnoozeMap('not json')).toEqual({});
    expect(parseSnoozeMap('[1,2,3]')).toEqual({});
    expect(parseSnoozeMap('{"ws/a.md":"soon"}')).toEqual({});
    expect(parseSnoozeMap('{"ws/a.md":123}')).toEqual({ 'ws/a.md': 123 });
  });

  test('it has its own key, separate from seen and opened', () => {
    expect(DELIVERABLES_SNOOZE_KEY).toBe('founder-os:deliverables-snoozed');
  });
});
