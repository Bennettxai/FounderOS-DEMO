'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import type { Newsletter } from '@/lib/newsletters';

const fmt = (n: number) => n.toLocaleString('en-US');
const pct = (n: number) => `${n.toFixed(n < 10 ? 2 : 1)}%`;
const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** A labeled metric cell inside the expanded analytics grid. */
function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' | 'err' }) {
  const color = tone === 'ok' ? 'text-os-ok' : tone === 'warn' ? 'text-os-warn' : tone === 'err' ? 'text-os-err' : 'text-os-text';
  return (
    <div className="rounded-sm-t border border-os-border bg-os-bg px-3 py-2.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-os-dim">{label}</div>
      <div className={`mt-1 font-mono text-[17px] font-semibold leading-none tracking-[-0.02em] ${color}`}>{value}</div>
      {sub && <div className="mt-1 font-mono text-[9.5px] text-os-dim">{sub}</div>}
    </div>
  );
}

/**
 * The expandable newsletter list: each past send is a row showing its open
 * rate and audience collapsed; clicking it unfolds the full send analytics
 * (delivery, opens, clicks, unsubscribes, spam, web). Newest first.
 */
export function NewsletterList({ newsletters }: { newsletters: Newsletter[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (newsletters.length === 0) {
    return <p className="rounded-lg-t border border-os-border bg-os-surface px-4 py-6 text-center font-mono text-[11px] text-os-dim">No newsletters yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {newsletters.map((n) => {
        const expanded = openId === n.id;
        return (
          <div key={n.id} className="overflow-hidden rounded-lg-t border border-os-border bg-os-surface">
            <button
              onClick={() => setOpenId(expanded ? null : n.id)}
              aria-expanded={expanded}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-os-surface2"
            >
              <span className="shrink-0 text-os-dim">
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{n.title}</span>
                <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.12em] text-os-dim">
                  {dateLabel(n.publishedAt)} · {fmt(n.recipients)} sent
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono text-[17px] font-semibold leading-none tracking-[-0.02em] text-os-accent">
                  {pct(n.openRate)}
                </span>
                <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.14em] text-os-dim">open rate</span>
              </span>
            </button>

            {expanded && (
              <div className="border-t border-os-border px-4 pb-4 pt-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  <Metric label="Recipients" value={fmt(n.recipients)} />
                  <Metric label="Delivered" value={fmt(n.delivered)} sub={pct(n.deliveryRate) + ' delivery'} tone="ok" />
                  <Metric label="Open rate" value={pct(n.openRate)} sub={fmt(n.opens) + ' opens'} tone="ok" />
                  <Metric label="Click rate" value={pct(n.clickRate)} sub={fmt(n.clicks) + ' clicks'} />
                  <Metric label="Unsubscribes" value={fmt(n.unsubscribes)} sub={pct(n.unsubscribeRate)} tone={n.unsubscribeRate > 1 ? 'warn' : undefined} />
                  <Metric label="Spam reports" value={fmt(n.spamReports)} tone={n.spamReports > 0 ? 'warn' : undefined} />
                  <Metric label="Web views" value={fmt(n.webViews)} />
                  <Metric label="Delivered %" value={pct(n.deliveryRate)} />
                </div>
                {n.webUrl && (
                  <a
                    href={n.webUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-sm-t border border-os-border px-2.5 py-1 font-mono text-[10.5px] text-os-accent transition-colors hover:border-os-border-strong"
                  >
                    Read the issue <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
