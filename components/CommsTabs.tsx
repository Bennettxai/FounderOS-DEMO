'use client';

import { useState } from 'react';
import { CommsThreePane } from '@/components/CommsThreePane';
import { SlidingTabs } from '@/components/SlidingTabs';
import { RecordingsBoard } from '@/components/RecordingsBoard';
import { WeekCalendar } from '@/components/WeekCalendar';
import type { CommsLane } from '@/lib/comms-lanes';
import type { SlackClientCard } from '@/lib/slack-clients';
import type { SlackChannel } from '@/lib/connectors/slack';
import type { CalEvent } from '@/lib/connectors/gcal';
import type { RecordingsBoard as RecordingsData } from '@/lib/recordings-format';

type Tab = 'messaging' | 'meetings' | 'recordings';
type Account = { name: string; color: string };

/** The front of /comms: a swappable view between the three-pane messaging
    view (sources rail / list / reader — interaction rebrand step 3; Slack
    clients and channels are sources on the rail now), the 7-day meetings
    calendar, and the recordings list (Plaud in the room + Fathom on calls).
    The old lane board lives on in CommsBoard, the unified feed in
    CommsGravity, both for an easy revert. */
export function CommsTabs({
  lanes,
  slackCards,
  channels,
  events,
  accounts,
  recordings,
  nowISO,
}: {
  lanes: CommsLane[];
  slackCards: SlackClientCard[];
  channels: SlackChannel[];
  events: CalEvent[];
  accounts: Account[];
  recordings: RecordingsData;
  nowISO: string;
}) {
  const [tab, setTab] = useState<Tab>('messaging');
  const unread = lanes.reduce((sum, lane) => sum + lane.unread, 0);

  return (
    <div>
      <div className="mb-5 flex items-center gap-2 border-b border-os-border pb-3">
        <SlidingTabs<Tab>
          tabs={[
            { id: 'messaging', label: 'Messaging', count: unread },
            { id: 'meetings', label: 'Meetings', count: events.length },
            { id: 'recordings', label: 'Recordings', count: recordings.recordings.length },
          ]}
          value={tab}
          onChange={setTab}
          variant="pill"
          tabWidth={120}
        />
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.15em] text-os-dim">
          {tab === 'messaging' ? `${unread} unread` : tab === 'meetings' ? 'next 7 days' : 'plaud + fathom · newest first'}
        </span>
      </div>

      {tab === 'messaging' ? (
        <CommsThreePane lanes={lanes} slackCards={slackCards} channels={channels} nowISO={nowISO} />
      ) : tab === 'meetings' ? (
        <WeekCalendar events={events} accounts={accounts} nowISO={nowISO} />
      ) : (
        <RecordingsBoard recordings={recordings.recordings} sources={recordings.sources} nowISO={nowISO} />
      )}
    </div>
  );
}
