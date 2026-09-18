import { describe, expect, test, beforeAll } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { entryKey, replyTarget } from '@/lib/comms-digest';
import type { DigestEntry } from '@/lib/comms-digest';

/**
 * Marking the morning report down to nothing (the operator, 2026-08-18: "give me
 * the option to mark out a message if I've read it so I can just go through
 * the whole list and get it down to nothing").
 *
 * The key has to survive a re-run of the digest: the 09:00 job rebuilds the
 * report from scratch every morning and "run now" rebuilds it on demand, so a
 * key tied to array position or a random id would resurrect everything he
 * already cleared.
 */
const entry = (over: Partial<DigestEntry> = {}): DigestEntry => ({
  tier: 'people',
  rank: 2,
  reason: 'a person wrote to you',
  source: 'email',
  sender: 'someone@example.com',
  title: 'Personal — someone',
  preview: 'hello there',
  ts: '2026-08-18T09:00:00.000Z',
  ...over,
});

describe('entryKey', () => {
  test('is stable across rebuilds of the same message', () => {
    expect(entryKey(entry())).toBe(entryKey(entry()));
  });

  test('distinguishes two messages from the same sender at different times', () => {
    expect(entryKey(entry())).not.toBe(entryKey(entry({ ts: '2026-08-18T10:00:00.000Z' })));
  });

  test('distinguishes the same text on different channels', () => {
    expect(entryKey(entry())).not.toBe(entryKey(entry({ source: 'whatsapp' })));
  });

  test('does not change when the ranking does — clearing survives a re-tune', () => {
    expect(entryKey(entry({ tier: 'call', rank: 0, reason: 'x' }))).toBe(entryKey(entry()));
  });
});

describe('replyTarget', () => {
  test('email gets a real reply lane', () => {
    const t = replyTarget(entry({ source: 'email', replyTo: 'a@b.com' }));
    expect(t.kind).toBe('email');
    expect(t.href).toContain('a@b.com');
  });

  test('a WhatsApp thread deep-links to the actual conversation', () => {
    const t = replyTarget(entry({ source: 'whatsapp', sender: 'Mom', replyTo: '447700900000' }));
    expect(t.kind).toBe('whatsapp');
    expect(t.href).toBe('https://wa.me/447700900000');
  });

  test('a WhatsApp group has no dialable number, so no fake link', () => {
    const t = replyTarget(entry({ source: 'whatsapp', sender: 'Cohort (18)' }));
    expect(t.href).toBeNull();
  });

  test('slack points at the channel', () => {
    const t = replyTarget(entry({ source: 'slack', replyTo: 'general' }));
    expect(t.kind).toBe('slack');
  });
});

describe('digestReads repo', () => {
  let db: FounderDb;
  beforeAll(() => {
    db = openDb(':memory:');
  });

  test('marking, listing and clearing round-trips', () => {
    db.digestReads.mark('k1');
    db.digestReads.mark('k2');
    expect(new Set(db.digestReads.keys())).toEqual(new Set(['k1', 'k2']));
    db.digestReads.unmark('k1');
    expect(db.digestReads.keys()).toEqual(['k2']);
  });

  test('marking the same key twice is idempotent', () => {
    db.digestReads.mark('dup');
    db.digestReads.mark('dup');
    expect(db.digestReads.keys().filter((k) => k === 'dup')).toHaveLength(1);
  });
});
