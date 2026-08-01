import { describe, expect, test } from 'vitest';
import { openDb } from '@/lib/db';

function db() {
  return openDb(':memory:');
}

describe('contactTags repo', () => {
  test('upsert + all round-trips a tagged person with tier', () => {
    const d = db();
    d.contactTags.upsert({ person: 'Jane Doe', channel: 'whatsapp', tag: 'client', tier: 1 });
    d.contactTags.upsert({ person: 'Max Friend', channel: 'imessage', tag: 'friend', tier: 3 });
    const all = d.contactTags.all();
    expect(all).toHaveLength(2);
    expect(all.find((t) => t.person === 'Jane Doe')).toMatchObject({ tag: 'client', tier: 1, channel: 'whatsapp' });
  });

  test('upsert replaces the tag for the same person+channel instead of duplicating', () => {
    const d = db();
    d.contactTags.upsert({ person: 'Jane Doe', channel: 'whatsapp', tag: 'lead', tier: 2 });
    d.contactTags.upsert({ person: 'Jane Doe', channel: 'whatsapp', tag: 'client', tier: 1 });
    const all = d.contactTags.all();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ tag: 'client', tier: 1 });
  });

  test('tier is capped at 3 — the red/yellow/green ladder', () => {
    const d = db();
    expect(() => d.contactTags.upsert({ person: 'X', channel: 'email', tag: 'x', tier: 4 })).toThrow();
    expect(() => d.contactTags.upsert({ person: 'X', channel: 'email', tag: 'x', tier: 0 })).toThrow();
  });

  test('remove deletes a tag by person+channel', () => {
    const d = db();
    d.contactTags.upsert({ person: 'Jane Doe', channel: 'whatsapp', tag: 'client', tier: 1 });
    d.contactTags.remove('Jane Doe', 'whatsapp');
    expect(d.contactTags.all()).toHaveLength(0);
  });

  test('byTier filters and orders by tier ascending then person', () => {
    const d = db();
    d.contactTags.upsert({ person: 'B Client', channel: 'email', tag: 'client', tier: 1 });
    d.contactTags.upsert({ person: 'A Student', channel: 'whatsapp', tag: 'student', tier: 1 });
    d.contactTags.upsert({ person: 'C Friend', channel: 'whatsapp', tag: 'friend', tier: 3 });
    expect(d.contactTags.byTier(1).map((t) => t.person)).toEqual(['A Student', 'B Client']);
    expect(d.contactTags.all().map((t) => t.tier)).toEqual([1, 1, 3]);
  });
});
