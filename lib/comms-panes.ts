/**
 * Pure derivations behind the three-pane /comms messaging view (step 3 of the
 * interaction rebrand): the sources rail on the left, the message list in the
 * middle, the reader on the right. Everything here is pure so archive/snooze
 * can be optimistic — the previous lanes reference IS the undo state.
 */
import type { CommsLane, CommsLaneItem } from '@/lib/comms-lanes';
import type { SlackClientCard } from '@/lib/slack-clients';
import type { SlackChannel } from '@/lib/connectors/slack';
import type { ConnectorState } from '@/lib/connectors/types';

export type SourceKind = 'all' | 'email' | 'whatsapp' | 'slack-clients' | 'slack-channels';

export type CommsSource = {
  id: string;
  name: string;
  kind: SourceKind;
  unread: number;
  count: number;
  state?: ConnectorState;
};

export type PaneRow = CommsLaneItem & { laneId: string; laneName: string };

const byTsDesc = (a: PaneRow, b: PaneRow) => Date.parse(b.ts) - Date.parse(a.ts);

export function buildCommsSources({
  lanes,
  slackCards,
  channels,
}: {
  lanes: CommsLane[];
  slackCards: SlackClientCard[];
  channels: SlackChannel[];
}): CommsSource[] {
  const totalUnread = lanes.reduce((sum, l) => sum + l.unread, 0);
  const totalCount = lanes.reduce((sum, l) => sum + l.items.length, 0);
  return [
    { id: 'all', name: 'All', kind: 'all', unread: totalUnread, count: totalCount },
    ...lanes.map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.source as SourceKind,
      unread: l.unread,
      count: l.items.length,
      state: l.state,
    })),
    {
      id: 'slack-clients',
      name: 'Slack · clients',
      kind: 'slack-clients' as const,
      unread: slackCards.reduce((sum, c) => sum + c.unread, 0),
      count: slackCards.length,
    },
    {
      id: 'slack-channels',
      name: 'Slack · channels',
      kind: 'slack-channels' as const,
      unread: 0,
      count: channels.length,
    },
  ];
}

export function itemsForSource(lanes: CommsLane[], sourceId: string): PaneRow[] {
  if (sourceId === 'all') {
    return lanes
      .flatMap((l) => l.items.map((it) => ({ ...it, laneId: l.id, laneName: l.name })))
      .sort(byTsDesc);
  }
  const lane = lanes.find((l) => l.id === sourceId);
  if (!lane) return [];
  return lane.items.map((it) => ({ ...it, laneId: lane.id, laneName: lane.name }));
}

export function removeItem(lanes: CommsLane[], itemId: string): CommsLane[] {
  return lanes.map((l) => {
    if (!l.items.some((it) => it.id === itemId)) return l;
    const items = l.items.filter((it) => it.id !== itemId);
    return { ...l, items, unread: items.reduce((sum, it) => sum + it.unread, 0) };
  });
}
