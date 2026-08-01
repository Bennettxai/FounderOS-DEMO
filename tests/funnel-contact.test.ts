import { describe, expect, test } from 'vitest';
import { lastMessageFor } from '@/lib/funnel-contact';
import type { CommsItem } from '@/lib/comms';

const item = (over: Partial<CommsItem>): CommsItem => ({
  source: 'email',
  title: 'Re: quick question',
  preview: 'sounds good, talk Friday',
  ts: '2026-07-01T10:00:00Z',
  ...over,
});

describe('lastMessageFor', () => {
  test('matches by email against replyTo or sender, case-insensitive', () => {
    const items = [
      item({ replyTo: 'jordan.blake@example.com', ts: '2026-06-30T10:00:00Z' }),
      item({ sender: 'someone@else.com', ts: '2026-07-01T10:00:00Z' }),
    ];
    const hit = lastMessageFor({ name: 'Jordan Blake', email: 'jordan.blake@example.com' }, items);
    expect(hit?.replyTo).toBe('jordan.blake@example.com');
  });

  test('falls back to name matching in sender/title and picks the newest', () => {
    const items = [
      item({ source: 'whatsapp', sender: 'Jordan Blake', ts: '2026-06-20T10:00:00Z', preview: 'older' }),
      item({ source: 'whatsapp', title: 'Jordan Blake — LC group', ts: '2026-06-28T10:00:00Z', preview: 'newer' }),
    ];
    const hit = lastMessageFor({ name: 'Jordan Blake', email: null }, items);
    expect(hit?.preview).toBe('newer');
  });

  test('short names never fuzzy-match — no false positives for "Sam"', () => {
    const items = [item({ sender: 'Samantha Corp Billing' })];
    expect(lastMessageFor({ name: 'Sam', email: null }, items)).toBeNull();
  });

  test('returns null when nothing matches', () => {
    expect(lastMessageFor({ name: 'Nobody Here', email: 'x@y.z' }, [item({})])).toBeNull();
  });
});
