import { ArrowUpRight, Mail, CalendarCheck, Minus } from 'lucide-react';
import { CopyLink } from '@/components/CopyLink';
import { LeadMagnetRowActions } from '@/components/LeadMagnetRowActions';
import type { LeadMagnet } from '@/lib/schemas';

/**
 * Lead magnets, as a Notion-style database (the operator is retiring Notion
 * and running this out of the OS). A property table, not
 * cards: name + offer, status pill, what it captures, where the leads land,
 * and the campaign it was built for. Every row opens the real page.
 */
const STATUS: Record<LeadMagnet['status'], { dot: string; text: string }> = {
  live: { dot: 'bg-os-ok', text: 'text-os-ok' },
  draft: { dot: 'bg-os-muted', text: 'text-os-muted' },
  paused: { dot: 'bg-os-warn', text: 'text-os-warn' },
  archived: { dot: 'bg-os-dim', text: 'text-os-dim' },
};

const CAPTURES = {
  email: { Icon: Mail, label: 'Email' },
  booking: { Icon: CalendarCheck, label: 'Booking' },
  none: { Icon: Minus, label: 'None' },
} as const;

const dateLabel = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const host = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export function LeadMagnets({
  rows,
  showCopy = false,
  manage = false,
}: {
  rows: LeadMagnet[];
  showCopy?: boolean;
  /** row controls (status, delete) — the full page, not the dashboard card */
  manage?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg-t border border-os-border bg-os-surface px-4 py-3 font-mono text-[10.5px] text-os-dim">
        No lead magnets yet. Every landing page we ship lands here.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg-t border border-os-border bg-os-surface">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr className="border-b border-os-border">
            {[
              'Name',
              'Status',
              'Captures',
              'Leads to',
              'Source',
              'Live',
              ...(showCopy ? ['Link'] : []),
              ...(manage ? ['Manage'] : []),
            ].map((h) => (
              <th
                key={h}
                className="px-4 py-2.5 text-left font-mono text-[9.5px] uppercase tracking-[0.18em] text-os-dim"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const s = STATUS[m.status];
            const c = CAPTURES[m.captures];
            return (
              <tr key={m.id} className="group border-b border-os-border last:border-b-0 hover:bg-os-surface2">
                <td className="px-4 py-3 align-top">
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-[13px] font-semibold text-os-text hover:text-os-accent"
                  >
                    {m.name}
                    <ArrowUpRight className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  </a>
                  <div className="mt-0.5 max-w-[380px] text-[11.5px] leading-snug text-os-muted">{m.offer}</div>
                  <div className="mt-1 font-mono text-[10px] text-os-dim">{host(m.url)}</div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 shrink-0 ${s.dot}`} />
                    <span className={`font-mono text-[10.5px] uppercase tracking-wider ${s.text}`}>{m.status}</span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <span className="inline-flex items-center gap-1.5 rounded-sm-t border border-os-border bg-os-bg px-2 py-0.5 font-mono text-[10px] text-os-muted">
                    <c.Icon className="h-3 w-3" /> {c.label}
                  </span>
                </td>
                <td className="px-4 py-3 align-top text-[11.5px] leading-snug text-os-muted">{m.destination}</td>
                <td className="px-4 py-3 align-top text-[11.5px] leading-snug text-os-muted">{m.source}</td>
                <td className="whitespace-nowrap px-4 py-3 align-top font-mono text-[10.5px] text-os-dim">
                  {dateLabel(m.launchedAt)}
                </td>
                {showCopy && (
                  <td className="whitespace-nowrap px-4 py-3 align-top">
                    <CopyLink url={m.url} />
                  </td>
                )}
                {manage && (
                  <td className="whitespace-nowrap px-4 py-3 align-top">
                    <LeadMagnetRowActions id={m.id} status={m.status} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
