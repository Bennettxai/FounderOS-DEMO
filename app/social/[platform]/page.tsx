import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getDb } from '@/lib/data';
import { PLATFORM_LABELS, platformDetail, syncFromZernioConfig } from '@/lib/social';
import type { SocialPlatform } from '@/lib/schemas';
import { formatFollowers, formatPct, GrowthBadge } from '@/components/SocialStats';
import { FollowerBarChart } from '@/components/FollowerBarChart';

export const dynamic = 'force-dynamic';

export default function SocialPlatformPage({ params }: { params: { platform: string } }) {
  const db = getDb();
  syncFromZernioConfig(db);
  const detail = platformDetail(db, params.platform as SocialPlatform);
  if (!detail) notFound();

  const { account, followers, growth, snapshots } = detail;
  const newestFirst = [...snapshots].reverse();

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
          <h1 className="text-[25px] font-bold uppercase leading-[1.1] tracking-[0.06em]">{PLATFORM_LABELS[account.platform]}</h1>
          <p className="mt-1 text-sm text-os-muted">{account.handle}</p>
        </div>
        {account.url && (
          <a
            href={account.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-os-border px-3 py-1.5 text-xs text-os-muted transition-colors hover:border-os-border-bright hover:text-os-text"
          >
            Open profile
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 ultra:grid-cols-5">
        <div className="rounded-xl border border-os-border bg-os-surface p-5">
          <div className="text-xs uppercase tracking-wider text-os-muted">Followers</div>
          <div className="mt-2 text-3xl font-bold tracking-tight">{formatFollowers(followers)}</div>
        </div>
        {(
          [
            ['Growth · 7d', growth.d7],
            ['Growth · 30d', growth.d30],
            ['Growth · 60d', growth.d60],
            ['Growth · all time', growth.allTime],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-os-border bg-os-surface p-5">
            <div className="text-xs uppercase tracking-wider text-os-muted">{label}</div>
            <div className={`mt-2 text-3xl font-bold tracking-tight ${value === null ? 'text-os-dim' : ''}`}>
              {formatPct(value)}
            </div>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-xl border border-os-border bg-os-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-os-muted">
            Follower history
          </h2>
          <div className="flex gap-1.5">
            <GrowthBadge label="7d" value={growth.d7} />
            <GrowthBadge label="30d" value={growth.d30} />
            <GrowthBadge label="60d" value={growth.d60} />
            <GrowthBadge label="all" value={growth.allTime} />
          </div>
        </div>
        {/* the diagram: one bar per snapshot — hover for exact count + change */}
        <FollowerBarChart series={snapshots.map((s) => ({ date: s.capturedAt, followers: s.followers }))} />
        {newestFirst.length > 0 && (
          <div className="mt-2 flex items-center gap-3 font-mono text-[9.5px] uppercase tracking-[0.08em] text-os-dim">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-3 bg-os-ok" /> gained vs prev
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-3 bg-os-err" /> dipped
            </span>
            <span className="ml-auto">
              {newestFirst.length} snapshots · latest {newestFirst[0].capturedAt} · {newestFirst[0].source}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
