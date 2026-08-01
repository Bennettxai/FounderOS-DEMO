import { describe, expect, test } from 'vitest';
import { annotatePriorities, inboundLast24h, mergeFeed, type CommsItem } from '@/lib/comms';
import { calibratedDate } from '@/lib/connectors/whatsapp';
import type { ContactTag } from '@/lib/schemas';

describe('inboundLast24h', () => {
  const now = new Date('2026-06-13T12:00:00.000Z');
  const feed: CommsItem[] = [
    { source: 'whatsapp', title: 'A', preview: '', ts: '2026-06-13T11:00:00.000Z' }, // 1h ago
    { source: 'email', title: 'B', preview: '', ts: '2026-06-12T18:00:00.000Z' }, // 18h ago
    { source: 'slack', title: 'C', preview: '', ts: '2026-06-12T11:00:00.000Z' }, // 25h ago (out)
    { source: 'email', title: 'D', preview: '', ts: 'not-a-date' }, // unparseable (out)
  ];

  test('counts only messages within the trailing 24 hours', () => {
    expect(inboundLast24h(feed, now)).toBe(2);
  });

  test('is zero for an empty feed', () => {
    expect(inboundLast24h([], now)).toBe(0);
  });
});

describe('mergeFeed', () => {
  const items: CommsItem[] = [
    { source: 'email', title: 'Invoice #42', preview: 'Payment due', ts: '2026-06-10T10:00:00.000Z' },
    { source: 'whatsapp', title: 'LC EXECS', preview: 'Marco: closing call at 3', ts: '2026-06-11T09:00:00.000Z' },
    { source: 'slack', title: '#general', preview: 'standup posted', ts: '2026-06-11T08:00:00.000Z' },
  ];

  test('sorts newest first across sources', () => {
    expect(mergeFeed(items).map((i) => i.source)).toEqual(['whatsapp', 'slack', 'email']);
  });

  test('respects the limit', () => {
    expect(mergeFeed(items, 2)).toHaveLength(2);
  });

  test('drops items with invalid timestamps instead of corrupting order', () => {
    const withBad = [...items, { source: 'email' as const, title: 'bad', preview: '', ts: 'not-a-date' }];
    expect(mergeFeed(withBad).map((i) => i.title)).not.toContain('bad');
  });
});

describe('annotatePriorities', () => {
  const tags: ContactTag[] = [
    { person: 'Jane Doe', channel: 'whatsapp', tag: 'client', tier: 1 },
    { person: 'Acme Brand', channel: 'email', tag: 'brand', tier: 2 },
    { person: 'Max', channel: 'whatsapp', tag: 'friend', tier: 3 },
  ];

  test('matches sender case-insensitively and stamps the tier', () => {
    const items: CommsItem[] = [
      { source: 'whatsapp', title: 'jane doe', sender: 'jane doe', preview: 'hey', ts: '2026-06-12T01:00:00Z' },
      { source: 'email', title: 'Inbox — ACME Brand Team', sender: 'ACME Brand Team', preview: 'collab', ts: '2026-06-12T01:00:00Z' },
      { source: 'slack', title: '#general — randomuser', sender: 'randomuser', preview: 'hi', ts: '2026-06-12T01:00:00Z' },
    ];
    const [jane, acme, rando] = annotatePriorities(items, tags);
    expect(jane.priority).toBe(1);
    expect(acme.priority).toBe(2);
    expect(rando.priority).toBeUndefined();
  });

  test('short tag names only match exactly, not as substrings', () => {
    const items: CommsItem[] = [
      { source: 'whatsapp', title: 'Max', sender: 'Max', preview: '', ts: '2026-06-12T01:00:00Z' },
      { source: 'whatsapp', title: 'Maximilian Corp', sender: 'Maximilian Corp', preview: '', ts: '2026-06-12T01:00:00Z' },
    ];
    const [max, corp] = annotatePriorities(items, tags);
    expect(max.priority).toBe(3);
    expect(corp.priority).toBeUndefined();
  });

  test('the highest priority (lowest tier) wins when multiple tags match', () => {
    const both: ContactTag[] = [
      { person: 'Jane Doe', channel: 'email', tag: 'brand', tier: 2 },
      { person: 'Jane Doe', channel: 'whatsapp', tag: 'client', tier: 1 },
    ];
    const items: CommsItem[] = [
      { source: 'email', title: 'Jane Doe', sender: 'Jane Doe', preview: '', ts: '2026-06-12T01:00:00Z' },
    ];
    expect(annotatePriorities(items, both)[0].priority).toBe(1);
  });
});

describe('sendSlackMessage', () => {
  test('fails honestly without a token instead of pretending', async () => {
    const { sendSlackMessage } = await import('@/lib/connectors/slack');
    const res = await sendSlackMessage('general', 'hi', {});
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('SLACK_BOT_TOKEN');
  });
});

describe('calibratedDate', () => {
  // WhatsApp's ZLASTMESSAGEDATE unit varies by app version. We calibrate
  // against the largest raw value in the DB, which is "approximately now"
  // whenever WhatsApp is in active use.
  test('maps the max raw value to approximately now', () => {
    const now = Date.parse('2026-06-11T12:00:00.000Z');
    const maxRaw = 222_000_000_000;
    const d = calibratedDate(maxRaw, maxRaw, now);
    expect(Math.abs(d.getTime() - now)).toBeLessThan(60_000);
  });

  test('maps older raw values proportionally into the past', () => {
    const now = Date.parse('2026-06-11T12:00:00.000Z');
    const maxRaw = 222_000_000_000;
    // one "unit-day" earlier: raw lower by (maxRaw / elapsed-since-2001) * 86400s
    const CORE_DATA_EPOCH_MS = Date.parse('2001-01-01T00:00:00.000Z');
    const scale = maxRaw / ((now - CORE_DATA_EPOCH_MS) / 1000);
    const dayEarlier = maxRaw - scale * 86_400;
    const d = calibratedDate(dayEarlier, maxRaw, now);
    expect(Math.abs(d.getTime() - (now - 86_400_000))).toBeLessThan(120_000);
  });

  test('handles zero and negative raw values without throwing', () => {
    const d = calibratedDate(0, 222_000_000_000, Date.now());
    expect(d.getTime()).toBeGreaterThan(0);
  });
});
