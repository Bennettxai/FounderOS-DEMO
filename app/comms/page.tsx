import { CalendarDays, Hash, Mail, MessageSquare, Mic, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { CommsTabs } from '@/components/CommsTabs';
import { CommsDigestPanel } from '@/components/CommsDigestPanel';
import { Rise } from '@/components/motion';
import { getDb } from '@/lib/data';
import type { DigestRunResult } from '@/lib/comms-digest-run';
import { gatherCommsLanes } from '@/lib/comms-lanes';
import { gatherRecordings } from '@/lib/recordings';
import { gatherSlackClientBoard } from '@/lib/slack-clients';
import { listChannels } from '@/lib/connectors/slack';
import { caldavAccounts, calendarStatus, upcomingEvents } from '@/lib/connectors/gcal';
import { Badge, Dot, SectionHead } from '@/components/terminal';

export const dynamic = 'force-dynamic';

const SOURCE_ICON: Record<string, LucideIcon> = {
  whatsapp: MessageSquare,
  email: Mail,
  slack: Hash,
  calendar: CalendarDays,
  plaud: Mic,
};

export default async function CommsPage() {
  const [{ lanes, emailState, whatsappState }, { cards: slackCards, status: slackState }, channels, calendar, weekEvents, recordings] =
    await Promise.all([
      gatherCommsLanes(),
      gatherSlackClientBoard(),
      listChannels(),
      calendarStatus(),
      upcomingEvents(undefined, { days: 7, limit: 200 }),
      gatherRecordings(30),
    ]);

  const calLegend = caldavAccounts().map((a) => ({ name: a.name, color: a.color }));
  const nowISO = new Date().toISOString();
  // Plaud is the fifth source: the recorder in the room, feeding the Recordings tab.
  const sources = [emailState, whatsappState, slackState, calendar, ...recordings.sources.filter((s) => s.id === 'plaud')];

  // The 09:00 cron writes this; reading the stored row keeps the page fast
  // (a live re-scrape of six connectors is ~20s cold).
  const stored = getDb().commsDigests.latest();
  let digestRun: DigestRunResult | null = null;
  if (stored) {
    try {
      digestRun = JSON.parse(stored.payload) as DigestRunResult;
    } catch {
      digestRun = null;
    }
  }
  const connectedSources = sources.filter((s) => s.state === 'connected').length;
  const totalUnread = lanes.reduce((sum, lane) => sum + lane.unread, 0);

  return (
    <div>
      <PageHeader
        eyebrow="by source"
        title="Comms"
        right={<Badge tone="accent">{totalUnread} unread</Badge>}
      />

      {/* Source status row */}
      <Rise as="section" i={1} className="mb-7">
        <SectionHead label="Sources" count={`${connectedSources}/${sources.length} connected`} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {sources.map((source) => {
            const Icon = SOURCE_ICON[source.id] ?? Mail;
            const ok = source.state === 'connected';
            return (
              <div key={source.id} data-lens="r" className="pressable is-row rounded-2xl border border-os-border bg-os-surface px-4 py-3.5">
                <div className="flex items-center gap-[9px]">
                  <Icon className={`h-[15px] w-[15px] shrink-0 ${ok ? 'text-os-accent' : 'text-os-dim'}`} strokeWidth={1.7} />
                  <span className="text-[13px] font-semibold">{source.name}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {ok && <Dot state="connected" pulse />}
                    <Badge
                      tone={ok ? 'ok' : source.state === 'error' ? 'err' : 'default'}
                      ghost={source.state === 'not_configured'}
                    >
                      {ok ? 'Connected' : source.state === 'error' ? 'Error' : 'Not configured'}
                    </Badge>
                  </span>
                </div>
                <p className="mt-[9px] font-mono text-[10.5px] leading-relaxed text-os-dim">{source.detail}</p>
              </div>
            );
          })}
        </div>
      </Rise>

      <Rise i={2}>
        <CommsDigestPanel
          initial={digestRun?.digest ?? null}
          sources={digestRun?.sources ?? []}
          generatedAt={stored?.generatedAt ?? null}
          initialRead={getDb().digestReads.keys()}
        />
      </Rise>

      {/* Swappable front: the messaging board (source lanes + Slack) or the 7-day meetings calendar */}
      <Rise i={3}>
        <CommsTabs
          lanes={lanes}
          slackCards={slackCards}
          channels={channels}
          events={weekEvents}
          accounts={calLegend}
          recordings={recordings}
          nowISO={nowISO}
        />
      </Rise>

      <Rise as="p" i={4} className="mt-4 rounded-xl border border-dashed border-os-border-strong px-3 py-3 text-center font-mono text-[10.5px] text-os-dim">
        Four inboxes (expand to read + reply) and WhatsApp as lanes · Slack per client + every current channel · meetings via CalDAV · recordings from Plaud + Fathom
      </Rise>
    </div>
  );
}
