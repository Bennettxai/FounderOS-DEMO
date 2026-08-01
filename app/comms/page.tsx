import { CalendarDays, Hash, Mail, MessageSquare, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { CommsTabs } from '@/components/CommsTabs';
import { gatherCommsFeed } from '@/lib/comms-feed';
import { annotatePriorities } from '@/lib/comms';
import { DEFAULT_WORK_KEYWORDS, parseWorkKeywords } from '@/lib/comms-gravity';
import { emailStatus } from '@/lib/connectors/email';
import { slackStatus } from '@/lib/connectors/slack';
import { whatsappStatus } from '@/lib/connectors/whatsapp';
import { calendarStatus, caldavAccounts, upcomingEvents } from '@/lib/connectors/gcal';
import { getDb } from '@/lib/data';
import { Badge, Dot, SectionHead } from '@/components/terminal';

export const dynamic = 'force-dynamic';

const SOURCE_ICON: Record<string, LucideIcon> = {
  whatsapp: MessageSquare,
  email: Mail,
  slack: Hash,
  calendar: CalendarDays,
};

export default async function CommsPage() {
  const [rawFeed, email, slack, whatsapp, calendar, weekEvents] = await Promise.all([
    gatherCommsFeed(),
    emailStatus(),
    slackStatus(),
    whatsappStatus(),
    calendarStatus(),
    upcomingEvents(undefined, { days: 7, limit: 200 }),
  ]);
  const tags = getDb().contactTags.all();
  const feed = annotatePriorities(rawFeed, tags);
  // Generic defaults ship in code; Alex's real work brands live in
  // COMMS_WORK_KEYWORDS (.env.local, gitignored) so they never reach the demo.
  const workKeywords = [...DEFAULT_WORK_KEYWORDS, ...parseWorkKeywords(process.env.COMMS_WORK_KEYWORDS)];
  const calLegend = caldavAccounts().map((a) => ({ name: a.name, color: a.color }));
  const nowISO = new Date().toISOString();
  const sources = [whatsapp, email, slack, calendar];
  const connectedSources = sources.filter((s) => s.state === 'connected').length;
  const totalUnread = feed.reduce((sum, item) => sum + (item.unread ?? 0), 0);

  return (
    <div>
      <PageHeader
        eyebrow="unified inbox"
        title="Comms"
        right={<Badge tone="accent">{totalUnread} unread</Badge>}
      />

      {/* Source status row */}
      <section className="mb-7">
        <SectionHead label="Sources" count={`${connectedSources}/${sources.length} connected`} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {sources.map((source) => {
            const Icon = SOURCE_ICON[source.id] ?? Mail;
            const ok = source.state === 'connected';
            return (
              <div key={source.id} className="hoverable rounded-lg-t border border-os-border bg-os-surface px-4 py-3.5">
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
      </section>

      {/* Swappable front: messaging feed (default) ↔ 7-day meetings calendar */}
      <CommsTabs feed={feed} tags={tags} events={weekEvents} accounts={calLegend} nowISO={nowISO} workKeywords={workKeywords} />

      <p className="mt-4 rounded-md-t border border-dashed border-os-border-strong px-3 py-3 text-center font-mono text-[10.5px] text-os-dim">
        WhatsApp · 4 inboxes · Slack live · calendar via CalDAV — one operator feed
      </p>
    </div>
  );
}
