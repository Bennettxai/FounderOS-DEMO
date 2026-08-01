'use client';

import { useState } from 'react';
import { CalendarDays, MessageSquare } from 'lucide-react';
import { CommsGravity } from '@/components/CommsGravity';
import { WeekCalendar } from '@/components/WeekCalendar';
import type { CommsItem } from '@/lib/comms';
import type { ContactTag } from '@/lib/schemas';
import type { CalEvent } from '@/lib/connectors/gcal';

type Tab = 'messaging' | 'meetings';
type Account = { name: string; color: string };

/** The front of /comms: a swappable view between the message feed (default)
    and the 7-day meetings calendar. */
export function CommsTabs({
  feed,
  tags,
  events,
  accounts,
  nowISO,
  workKeywords = [],
}: {
  feed: CommsItem[];
  tags: ContactTag[];
  events: CalEvent[];
  accounts: Account[];
  nowISO: string;
  workKeywords?: string[];
}) {
  const [tab, setTab] = useState<Tab>('messaging');
  const unread = feed.reduce((sum, item) => sum + (item.unread ?? 0), 0);

  const TabButton = ({ id, icon: Icon, label, count }: { id: Tab; icon: typeof MessageSquare; label: string; count: number }) => {
    const active = tab === id;
    return (
      <button
        onClick={() => setTab(id)}
        className={`flex items-center gap-2 rounded-[5px] px-3.5 py-1.5 font-mono text-[12px] font-semibold transition-colors ${
          active ? 'bg-[var(--accent-soft)] text-os-accent' : 'text-os-dim hover:text-os-muted'
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
        <span className={`rounded-sm-t px-1.5 py-px text-[10px] ${active ? 'bg-os-accent text-os-ink' : 'bg-os-surface2 text-os-dim'}`}>
          {count}
        </span>
      </button>
    );
  };

  return (
    <div>
      <div className="mb-5 flex items-center gap-2 border-b border-os-border pb-3">
        <div className="inline-flex gap-1 rounded-md-t border border-os-border bg-os-surface p-1">
          <TabButton id="messaging" icon={MessageSquare} label="Messaging" count={unread} />
          <TabButton id="meetings" icon={CalendarDays} label="Meetings" count={events.length} />
        </div>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.15em] text-os-dim">
          {tab === 'messaging' ? `${unread} unread` : 'next 7 days'}
        </span>
      </div>

      {tab === 'messaging' ? (
        <CommsGravity initialFeed={feed} initialTags={tags} workKeywords={workKeywords} />
      ) : (
        <WeekCalendar events={events} accounts={accounts} nowISO={nowISO} />
      )}
    </div>
  );
}
