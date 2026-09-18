import { describe, expect, test } from 'vitest';
import { isCurrentClient, slackClientBoard } from '@/lib/slack-clients';
import type { RosterClient } from '@/lib/schemas';
import type { SlackMessage } from '@/lib/connectors/slack';

/**
 * The Slack board shows current clients, not the whole roster.
 *
 * It used to render EVERY roster row, inventing a last message, an unread
 * count and a heat signal for anyone without a Slack match (hashed from the
 * client id, badged "demo"). Against a live CRM roster that is a page of deal
 * records' worth of fabricated chatter — cold leads included. Two rules now:
 * only current clients appear, and nothing is ever invented.
 */
const client = (over: Partial<RosterClient>): RosterClient => ({
  id: 'c1',
  name: 'Acme Co',
  venture: 'vantage',
  status: 'Closed Won',
  amountUsd: 1000,
  source: 'attio',
  ...over,
});

const msg = (over: Partial<SlackMessage>): SlackMessage => ({
  channel: 'acme-co',
  user: 'someone',
  text: 'hi',
  ts: String(Math.floor(Date.now() / 1000)),
  ...over,
});

describe('isCurrentClient', () => {
  test('won deals are current', () => {
    expect(isCurrentClient(client({ status: 'Closed Won' }))).toBe(true);
    expect(isCurrentClient(client({ status: 'active' }))).toBe(true);
    expect(isCurrentClient(client({ status: 'onboarding' }))).toBe(true);
  });

  test('cold pipeline and dead deals are not clients', () => {
    for (const status of ['New Lead', 'Contacted', 'Nurture', 'Closed Lost']) {
      expect(isCurrentClient(client({ status })), status).toBe(false);
    }
  });
});

describe('slackClientBoard', () => {
  const now = Date.now();

  test('cold leads are dropped even though they are on the roster', () => {
    const cards = slackClientBoard(
      [client({ id: 'won', name: 'Acme Co' }), client({ id: 'lead', name: 'Cold Lead Ltd', status: 'Contacted' })],
      [],
      now,
    );
    expect(cards.map((c) => c.id)).toEqual(['won']);
  });

  test('a lead with a REAL Slack channel counts as current after all', () => {
    const cards = slackClientBoard(
      [client({ id: 'lead', name: 'Talking Ltd', status: 'Contacted' })],
      [msg({ channel: 'talking-ltd', text: 'when can we start?' })],
      now,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].live).toBe(true);
    expect(cards[0].lastText).toBe('when can we start?');
  });

  test('a client with no Slack thread shows an honest empty card, never invented chatter', () => {
    const cards = slackClientBoard([client({ name: 'Quiet Co' })], [], now);
    expect(cards).toHaveLength(1);
    const c = cards[0];
    expect(c.live).toBe(false);
    expect(c.lastText).toBe(''); // nothing fabricated
    expect(c.unread).toBe(0);
    expect(c.lastTs).toBeNull();
    expect(c.waiting).toBe('none');
    expect(c.channel).toBeNull(); // no channel invented from the name
  });

  test('live cards carry the real channel and message', () => {
    const cards = slackClientBoard([client({ name: 'Acme Co' })], [msg({ text: 'invoice paid' })], now);
    expect(cards[0].live).toBe(true);
    expect(cards[0].channel).toBe('#acme-co');
    expect(cards[0].lastText).toBe('invoice paid');
  });

  test('live threads sort above quiet ones', () => {
    const cards = slackClientBoard(
      [client({ id: 'quiet', name: 'Quiet Co' }), client({ id: 'loud', name: 'Acme Co' })],
      [msg({ channel: 'acme-co' })],
      now,
    );
    expect(cards[0].id).toBe('loud');
  });

  test('no seeded placeholder roster leaks in', () => {
    expect(slackClientBoard([], [], now)).toEqual([]);
  });
});
