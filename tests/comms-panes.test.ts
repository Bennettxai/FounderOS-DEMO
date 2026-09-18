import { describe, expect, test } from 'vitest';
import { buildCommsSources, itemsForSource, removeItem } from '@/lib/comms-panes';
import type { CommsLane } from '@/lib/comms-lanes';
import type { SlackClientCard } from '@/lib/slack-clients';
import type { SlackChannel } from '@/lib/connectors/slack';

const item = (id: string, ts: string, unread = 0, extra: Record<string, unknown> = {}) => ({
  id,
  sender: `sender-${id}`,
  preview: `preview ${id}`,
  ts,
  unread,
  ...extra,
});

const lanes: CommsLane[] = [
  {
    id: 'inbox-1',
    name: 'Ops',
    source: 'email',
    state: 'connected',
    detail: 'ops inbox',
    items: [item('a', '2026-09-07T10:00:00.000Z', 1, { replyTo: 'a@x.com' }), item('b', '2026-09-07T08:00:00.000Z', 1)],
    unread: 2,
  },
  {
    id: 'inbox-2',
    name: 'Personal',
    source: 'email',
    state: 'error',
    detail: 'auth failed',
    items: [],
    unread: 0,
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    source: 'whatsapp',
    state: 'connected',
    detail: 'live',
    items: [item('w1', '2026-09-07T09:00:00.000Z', 1)],
    unread: 1,
  },
];

const slackCards: SlackClientCard[] = [
  { id: 'c1', name: 'Acme', channel: '#acme', lastText: 'hi', lastTs: '2026-09-07T09:30:00.000Z', unread: 3, heat: 'hot', waiting: 'you', live: true },
  { id: 'c2', name: 'Globex', channel: null, lastText: '', lastTs: null, unread: 0, heat: null, waiting: 'none', live: false },
];

const channels: SlackChannel[] = [
  { id: 'ch1', name: 'general', isMember: true, isPrivate: false, members: 8, topic: '' },
  { id: 'ch2', name: 'ops', isMember: true, isPrivate: true, members: 3, topic: 'ops' },
];

describe('buildCommsSources', () => {
  const sources = buildCommsSources({ lanes, slackCards, channels });

  test('rail order: All, each lane, slack clients, slack channels', () => {
    expect(sources.map((s) => s.id)).toEqual(['all', 'inbox-1', 'inbox-2', 'whatsapp', 'slack-clients', 'slack-channels']);
  });

  test('All aggregates unread across message lanes only (slack keeps its own counts)', () => {
    const all = sources.find((s) => s.id === 'all')!;
    expect(all.unread).toBe(3); // 2 + 0 + 1
    expect(all.count).toBe(3); // a, b, w1
  });

  test('lane sources carry name, unread and connector state', () => {
    const inbox1 = sources.find((s) => s.id === 'inbox-1')!;
    expect(inbox1.name).toBe('Ops');
    expect(inbox1.unread).toBe(2);
    expect(inbox1.state).toBe('connected');
    const inbox2 = sources.find((s) => s.id === 'inbox-2')!;
    expect(inbox2.state).toBe('error');
  });

  test('slack sources count clients and channels honestly', () => {
    const clients = sources.find((s) => s.id === 'slack-clients')!;
    expect(clients.count).toBe(2);
    expect(clients.unread).toBe(3);
    const chans = sources.find((s) => s.id === 'slack-channels')!;
    expect(chans.count).toBe(2);
    expect(chans.unread).toBe(0);
  });
});

describe('itemsForSource', () => {
  test('all merges every lane sorted newest first, each row stamped with its lane', () => {
    const rows = itemsForSource(lanes, 'all');
    expect(rows.map((r) => r.id)).toEqual(['a', 'w1', 'b']);
    expect(rows[0].laneId).toBe('inbox-1');
    expect(rows[1].laneId).toBe('whatsapp');
  });

  test('a lane id returns just that lane in its own order', () => {
    const rows = itemsForSource(lanes, 'inbox-1');
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(rows.every((r) => r.laneId === 'inbox-1')).toBe(true);
  });

  test('an unknown or slack source yields no message rows', () => {
    expect(itemsForSource(lanes, 'slack-clients')).toEqual([]);
  });
});

describe('removeItem', () => {
  test('drops the row, recomputes unread, and leaves the input untouched for undo', () => {
    const next = removeItem(lanes, 'a');
    const inbox1 = next.find((l) => l.id === 'inbox-1')!;
    expect(inbox1.items.map((i) => i.id)).toEqual(['b']);
    expect(inbox1.unread).toBe(1);
    // purity: the original lanes still hold the row — that reference IS the undo state
    expect(lanes.find((l) => l.id === 'inbox-1')!.items).toHaveLength(2);
  });

  test('removing an id that is not there returns the lanes unchanged', () => {
    const next = removeItem(lanes, 'nope');
    expect(next.map((l) => l.items.length)).toEqual(lanes.map((l) => l.items.length));
  });
});
