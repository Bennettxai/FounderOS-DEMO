import { Hash } from 'lucide-react';
import { Badge } from '@/components/terminal';
import type { SlackClientCard } from '@/lib/slack-clients';

/**
 * Slack seen through the client roster: one card per CURRENT client. A card is
 * live when a real Slack thread matched; otherwise it says plainly that no
 * channel is linked. The old board invented a message, an
 * unread count and a #channel for every client and badged it demo data.
 * Heat is a status-only color; the waiting chip says whose court the ball is in.
 */

const HEAT_VAR: Record<NonNullable<SlackClientCard['heat']>, string> = {
  hot: 'var(--err)',
  warm: 'var(--warn)',
  cold: 'var(--text-3)',
};

const WAIT_LABEL: Record<SlackClientCard['waiting'], string> = {
  you: 'waiting on you',
  them: 'waiting on them',
  none: 'all clear',
};

function ago(iso: string, nowISO: string): string {
  const ms = Date.parse(nowISO) - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  if (ms < 60_000) return 'now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function ClientCard({ card, nowISO }: { card: SlackClientCard; nowISO: string }) {
  return (
    <div data-lens="r" className="pressable is-row flex flex-col rounded-2xl border border-os-border bg-os-surface px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: card.heat ? HEAT_VAR[card.heat] : 'var(--border-strong)' }}
          title={card.heat ? `${card.heat} activity` : 'no Slack thread'}
        />
        <span className="truncate text-[12.5px] font-semibold">{card.name}</span>
        {card.unread > 0 ? (
          <span className="ml-auto shrink-0">
            <Badge tone="accent">{card.unread}</Badge>
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-1.5 font-mono text-[9.5px] text-os-dim">
        <Hash className="h-3 w-3 shrink-0" strokeWidth={1.7} />
        <span className="truncate">{card.channel ? card.channel.replace(/^#/, '') : 'no channel linked'}</span>
        {card.lastTs && <span className="ml-auto shrink-0">{ago(card.lastTs, nowISO)}</span>}
      </div>
      <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-os-muted">
        {card.lastText || <span className="text-os-dim">No Slack thread yet. Invite the bot to their channel.</span>}
      </p>
      <div className="mt-2.5 flex items-center gap-2 border-t border-os-border pt-2">
        <span
          className={`font-mono text-[9px] uppercase tracking-[0.14em] ${
            card.waiting === 'you' ? 'text-os-warn' : 'text-os-dim'
          }`}
        >
          {WAIT_LABEL[card.waiting]}
        </span>
        <span className="ml-auto shrink-0">
          {card.live ? <Badge tone="ok">live</Badge> : <Badge ghost>quiet</Badge>}
        </span>
      </div>
    </div>
  );
}

export function SlackClientBoard({ cards, nowISO }: { cards: SlackClientCard[]; nowISO: string }) {
  if (cards.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-os-border-strong px-3 py-3 text-center font-mono text-[10.5px] text-os-dim">
        No current clients on the roster. Won deals in Attio (and anyone with a live Slack thread) land here.
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((card) => (
        <ClientCard key={card.id} card={card} nowISO={nowISO} />
      ))}
    </div>
  );
}
