import { describe, expect, test } from 'vitest';
import { slackClientBoard } from '@/lib/slack-clients';
import type { RosterClient } from '@/lib/schemas';
import type { SlackMessage } from '@/lib/connectors/slack';

const NOW = Date.parse('2026-07-27T12:00:00.000Z');

const client = (id: string, name: string): RosterClient => ({
  id,
  name,
  venture: 'vantage',
  status: 'active',
  amountUsd: 1000,
  source: 'funnel',
});

const HEATS = new Set(['hot', 'warm', 'cold']);
const WAITS = new Set(['you', 'them', 'none']);

// 2026-08-18: the seeded-card assertions that used to live here are gone with
// the seeding. the operator asked for real clients only, so a client with no Slack
// thread now renders an honest empty card. See slack-clients-real.test.ts.

describe('slackClientBoard', () => {
  test('a client whose name matches a channel gets a LIVE card from the message', () => {
    const clients = [client('c1', 'Acme Corp')];
    const messages: SlackMessage[] = [
      { channel: 'acme-corp', user: 'U123', text: 'Can you review the SOW?', ts: '1785499200.000100' },
    ];
    const [card] = slackClientBoard(clients, messages, NOW);
    expect(card.live).toBe(true);
    expect(card.lastText).toBe('Can you review the SOW?');
    expect(card.name).toBe('Acme Corp');
  });

  test('an unmatched client renders empty and is still deterministic', () => {
    const clients = [client('c2', 'Globex')];
    const a = slackClientBoard(clients, [], NOW)[0];
    const b = slackClientBoard(clients, [], NOW)[0];
    expect(a.live).toBe(false);
    expect(a).toEqual(b); // no Math.random / Date.now inside
    expect(a.channel).toBeNull();
    expect(a.lastText).toBe('');
  });

  test('one card per current client, with in-enum values where present', () => {
    const clients = [client('c1', 'Acme Corp'), client('c2', 'Globex'), client('c3', 'Initech')];
    const cards = slackClientBoard(clients, [], NOW);
    expect(cards).toHaveLength(3);
    for (const c of cards) {
      if (c.heat !== null) expect(HEATS.has(c.heat)).toBe(true);
      expect(WAITS.has(c.waiting)).toBe(true);
      expect(c.unread).toBeGreaterThanOrEqual(0);
    }
  });
});
