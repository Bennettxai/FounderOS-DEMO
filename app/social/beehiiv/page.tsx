import Link from 'next/link';
import { ArrowLeft, ExternalLink, Mail } from 'lucide-react';
import { getNewsletters, newsletterSummary } from '@/lib/newsletters';
import { beehiivSubscribers } from '@/lib/connectors/beehiiv';
import { NewsletterList } from '@/components/NewsletterList';

export const dynamic = 'force-dynamic';

const fmt = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-US'));
const pct = (n: number) => `${n.toFixed(1)}%`;

export default async function BeehiivDashboardPage() {
  const [newsletters, subscribers] = await Promise.all([getNewsletters(), beehiivSubscribers()]);
  const summary = newsletterSummary(newsletters);
  const live = subscribers != null; // a real key resolved a subscriber count

  return (
    <div>
      <Link
        href="/social"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-os-muted transition-colors hover:text-os-text"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All platforms
      </Link>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Mail className="h-4 w-4 text-os-accent" />
            <span className="font-mono text-[9.5px] uppercase tracking-[0.32em] text-os-dim">Beehiiv</span>
          </div>
          <h1 className="text-[25px] font-bold uppercase leading-[1.1] tracking-[0.06em]">Newsletter</h1>
          <p className="mt-1 font-mono text-[11px] text-os-dim">
            {live ? 'live via Beehiiv API' : 'seeded preview · add BEEHIIV_API_KEY for live'}
          </p>
        </div>
        <a
          href="https://app.beehiiv.com"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-os-border px-3 py-1.5 text-xs text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text"
        >
          Open Beehiiv
          <ExternalLink className="h-3 w-3" />
        </a>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-os-border bg-os-surface p-5">
          <div className="text-xs uppercase tracking-wider text-os-muted">Subscribers</div>
          <div className="mt-2 text-3xl font-bold tracking-tight">{fmt(subscribers)}</div>
        </div>
        <div className="rounded-xl border border-os-border bg-os-surface p-5">
          <div className="text-xs uppercase tracking-wider text-os-muted">Newsletters sent</div>
          <div className="mt-2 text-3xl font-bold tracking-tight">{fmt(summary.count)}</div>
        </div>
        <div className="rounded-xl border border-os-border bg-os-surface p-5">
          <div className="text-xs uppercase tracking-wider text-os-muted">Avg open rate</div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-os-ok">{pct(summary.avgOpenRate)}</div>
        </div>
        <div className="rounded-xl border border-os-border bg-os-surface p-5">
          <div className="text-xs uppercase tracking-wider text-os-muted">Best open rate</div>
          <div className="mt-2 text-3xl font-bold tracking-tight">{pct(summary.bestOpenRate)}</div>
        </div>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-os-muted">Past newsletters</h2>
          <span className="font-mono text-[10px] text-os-dim">click any issue to expand its analytics</span>
        </div>
        <NewsletterList newsletters={newsletters} />
      </section>
    </div>
  );
}
