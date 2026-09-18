import { describe, expect, test } from 'vitest';
import { classifyDeliverable, needsYou } from '@/lib/board-approvals';

/**
 * Mock 3a: "Needs you — ranked by the Conductor · people first, then
 * deadlines", each row carrying a kind glyph (✉ ◐ ! $) and a "why here · …"
 * clause.
 *
 * All three are derivations of what the agents already wrote in the filename,
 * so they live here — pure, with the row staying a renderer — rather than as
 * string-building inside the component.
 */
const f = (name: string, over: Partial<{ modifiedAt: string; title: string }> = {}) => ({
  id: `ws/${name}`,
  name,
  kind: 'file' as const,
  url: null,
  meta: 'ws',
  sizeBytes: 100,
  modifiedAt: over.modifiedAt ?? '2026-09-08T12:00:00.000Z',
  accessCode: '',
  title: over.title ?? name,
  summary: '',
});

describe('the kind glyph', () => {
  test('a staged reply is an envelope — an agent wrote it and cannot send it', () => {
    expect(classifyDeliverable(f('STAGED-note-42-COMMENT.json')).glyph).toBe('✉');
  });

  test('a gate is half-filled — work is paused mid-flight', () => {
    expect(classifyDeliverable(f('newsletter-send-api-plan-gate-2026-09-08.md')).glyph).toBe('◐');
  });

  test('a call only he can make is a bang', () => {
    expect(classifyDeliverable(f('sample-mentorship-decision-2026-09-08.md')).glyph).toBe('!');
  });

  test('money outranks the kind, because money is the one he must not miss', () => {
    expect(classifyDeliverable(f('STAGED-sample-refund-COMMENT.json')).glyph).toBe('$');
    expect(classifyDeliverable(f('vantage-invoice-decision-2026-09-08.md')).glyph).toBe('$');
  });

  test('the glyph tone is status, never decoration', () => {
    expect(classifyDeliverable(f('STAGED-a-COMMENT.json')).glyphTone).toBe('ok');
    expect(
      classifyDeliverable(
        f('STAGED-a-DELIVER-BEFORE-0900Z.json', { modifiedAt: '2026-09-08T05:00:00.000Z' }),
        Date.parse('2026-09-08T12:00:00.000Z'),
      ).glyphTone,
    ).toBe('err');
  });
});

describe('why here', () => {
  test('every queued row says in one clause why the Conductor surfaced it', () => {
    for (const name of [
      'STAGED-a-COMMENT.json',
      'b-decision-2026-09-08.md',
      'c-plan-gate-2026-09-08.md',
      'd-request-oracle-2026-09-08.md',
      'e-launch-draft-2026-09-08.md',
    ]) {
      const c = classifyDeliverable(f(name));
      expect(c.needsYou).toBe(true);
      expect(c.why.length).toBeGreaterThan(0);
      expect(c.why).toBe(c.why.toLowerCase());
    }
  });

  test('a blown deadline explains itself before its kind does', () => {
    const c = classifyDeliverable(
      f('STAGED-a-DELIVER-BEFORE-0900Z.json', { modifiedAt: '2026-09-08T05:00:00.000Z' }),
      Date.parse('2026-09-08T12:00:00.000Z'),
    );
    expect(c.why).toContain('deadline');
  });
});

describe('the Conductor rank: people first, then deadlines', () => {
  const now = Date.parse('2026-09-08T23:00:00.000Z');
  const files = [
    f('a-launch-draft-2026-09-08.md', { modifiedAt: '2026-09-08T23:00:00.000Z' }),
    f('b-plan-gate-2026-09-08.md', { modifiedAt: '2026-09-08T22:00:00.000Z' }),
    f('c-DELIVER-BEFORE-2330Z.json', { modifiedAt: '2026-09-08T21:00:00.000Z' }),
    f('STAGED-d-COMMENT.json', { modifiedAt: '2026-09-08T05:00:00.000Z' }),
    f('e-DELIVER-BEFORE-0900Z.json', { modifiedAt: '2026-09-08T05:00:00.000Z' }),
  ];

  test('overdue leads, then the ones a person is waiting on, then deadlines', () => {
    expect(needsYou(files, now).map((c) => c.name)).toEqual([
      'e-DELIVER-BEFORE-0900Z.json', // its deadline already passed
      'STAGED-d-COMMENT.json', // someone is waiting on a reply, old or not
      'c-DELIVER-BEFORE-2330Z.json', // a deadline still ahead
      'a-launch-draft-2026-09-08.md', // then newest first
      'b-plan-gate-2026-09-08.md',
    ]);
  });

  test('a staged reply outranks a fresher gate — that is the whole point', () => {
    const q = needsYou(files, now);
    const staged = q.findIndex((c) => c.ask === 'staged');
    const gate = q.findIndex((c) => c.ask === 'gate');
    expect(staged).toBeLessThan(gate);
    expect(q[staged].modifiedAt < q[gate].modifiedAt).toBe(true);
  });

  test('a bare deadline is a deadline, not a person', () => {
    expect(classifyDeliverable(f('c-DELIVER-BEFORE-2330Z.json')).person).toBe(false);
    expect(classifyDeliverable(f('STAGED-d-COMMENT.json')).person).toBe(true);
  });
});
