import Link from 'next/link';
import { Instagram, Linkedin, Music2, Youtube } from 'lucide-react';
import { XLogo } from '@/components/XLogo';

/** Any icon that takes a className: the lucide set and the hand-rolled X mark
    both satisfy it, and the map does not care which it is holding. */
type PlatformIcon = React.ComponentType<{ className?: string }>;
import { getDb } from '@/lib/data';
import { buildSocialDashboard, syncFromZernioConfig, audienceGrowthPct, PLATFORM_LABELS } from '@/lib/social';
import { agentRunVolume } from '@/lib/analytics';
import { splitMetrics, sparkSeries, type MetricTile } from '@/lib/operating-metrics';
import { gatherOperatingMetrics } from '@/lib/analytics-refresh';
import type { SocialPlatform } from '@/lib/schemas';
import type { PieItem } from '@/lib/social-chart';
import { PageHeader } from '@/components/PageHeader';
import { Badge, Label, SectionHead, Spark } from '@/components/terminal';
import { SharePie } from '@/components/SharePie';
import { formatFollowers, GrowthBadge, MiniBars } from '@/components/SocialStats';
import { RunVolumeCard } from '@/components/RunVolumeCard';
import { Rise } from '@/components/motion';

export const dynamic = 'force-dynamic';

const PLATFORM_ICONS: Record<SocialPlatform, PlatformIcon> = {
  instagram: Instagram,
  tiktok: Music2,
  twitter: XLogo,
  youtube: Youtube,
  linkedin: Linkedin,
};

// Value + small-unit split per tile (compact for audience, $ for money).
function tileValue(value: number, unit: string): { main: string; small: string } {
  if (unit === 'usd') return { main: `$${value.toLocaleString('en-US')}`, small: '' };
  if (unit === 'followers') return { main: formatFollowers(value), small: '' };
  return { main: value.toLocaleString('en-US'), small: unit };
}

// Deterministic rising bars per channel — fallback until a platform has
// enough real snapshot history (two points) to draw the truth.
function barsFor(seed: string): number[] {
  const base = [...seed].reduce((s, c) => s + c.charCodeAt(0), 0);
  return Array.from({ length: 12 }, (_, i) => 4 + i * 1.3 + ((base + i * 7) % 5));
}

const fmtCount = (n: number) => n.toLocaleString('en-US');

function MetricCard({ tile, spark }: { tile: MetricTile; spark: number[] }) {
  const up = tile.delta > 0;
  const flat = tile.delta === 0;
  const { main, small } = tileValue(tile.value, tile.unit);
  return (
    <div data-lens="r" className="pressable is-row flex flex-col gap-2.5 rounded-lg-t border border-os-border bg-os-surface px-[18px] py-4">
      <div className="flex items-center justify-between gap-2">
        <Label>{tile.label}</Label>
        <span className={`font-mono text-[10px] font-semibold ${flat ? 'text-os-dim' : up ? 'text-os-ok' : 'text-os-err'}`}>
          {flat ? '' : up ? '▲ +' : '▼ '}
          {flat ? '' : tile.delta}
          {!flat && tile.deltaPct ? '%' : ''}
        </span>
      </div>
      <div className="flex items-baseline gap-2 font-mono text-[28px] font-semibold leading-none tracking-[-0.02em]">
        {main}
        {small && <small className="text-[11px] font-normal tracking-normal text-os-dim">{small}</small>}
      </div>
      <div className="flex items-end justify-between gap-2">
        <Spark data={spark} w={96} h={26} />
        <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-os-dim">{tile.source}</span>
      </div>
    </div>
  );
}

/** A titled card that hosts one share donut — the Distribution row's unit. */
function PieCard({
  title, sub, items, total, centerLabel, format, ariaLabel,
}: {
  title: string;
  sub: string;
  items: PieItem[];
  total: number;
  centerLabel: string;
  format: (v: number) => string;
  ariaLabel: string;
}) {
  return (
    <div className="rounded-lg-t border border-os-border bg-os-surface p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <Label>{title}</Label>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-os-dim">{sub}</span>
      </div>
      <SharePie
        framed={false}
        stacked
        donutPx={158}
        items={items}
        total={total}
        centerLabel={centerLabel}
        format={format}
        ariaLabel={ariaLabel}
      />
    </div>
  );
}

export default async function AnalyticsPage() {
  const db = getDb();
  syncFromZernioConfig(db);
  const today = new Date().toISOString().slice(0, 10);

  // Real agent-run activity — powers the agent-runs tile, the volume chart, and
  // the run-distribution pies.
  const runs = db.agentRuns.recent(2000);
  const runVolume = agentRunVolume(runs, today, 30);

  // Real audience — Zernio snapshot totals + true 7d growth.
  const dash = buildSocialDashboard(db);
  const totalFollowers = dash.totalFollowers;
  const audience7d = audienceGrowthPct(db, 7);

  // Every tile is a real connector read, or honest pending (value === null) —
  // the same sweep the /api/analytics/refresh cron snapshots every 15 min.
  const { inputs, subs } = await gatherOperatingMetrics(db);
  const { live, pending } = splitMetrics(inputs);

  // Real sparklines from snapshot history (per-day last value); a tile with
  // fewer than two captured days keeps the deterministic placeholder shape.
  const sparkOf = (id: string, value: number) =>
    sparkSeries(
      db.metricSnapshots.history(id, 7, today).map((h) => h.value),
      id,
      value,
    );

  // ---- Distribution pies (all real: live snapshots + the real run log) ----

  // Audience share by channel — every social platform plus the email list.
  const audienceItems: PieItem[] = dash.platforms.map((p) => ({
    key: p.platform,
    label: PLATFORM_LABELS[p.platform],
    value: p.followers,
  }));
  if (subs) audienceItems.push({ key: 'email', label: 'Email list', value: subs });
  const audienceReach = totalFollowers + (subs ?? 0);

  // Agent runs by agent — top handful, the long tail folded into "Other".
  const agentName = new Map(db.agents.all().map((a) => [a.id, a.name]));
  const byAgent = new Map<string, number>();
  for (const r of runs) byAgent.set(r.agentId, (byAgent.get(r.agentId) ?? 0) + 1);
  const rankedAgents = [...byAgent.entries()].sort((a, b) => b[1] - a[1]);
  const runsByAgentItems: PieItem[] = rankedAgents
    .slice(0, 6)
    .map(([id, n]) => ({ key: id, label: agentName.get(id) ?? id, value: n }));
  const tailRuns = rankedAgents.slice(6).reduce((s, [, n]) => s + n, 0);
  if (tailRuns > 0) runsByAgentItems.push({ key: 'other', label: 'Other agents', value: tailRuns });

  // By-platform bars: real follower snapshots (last 12 captures) once a
  // platform has two, else the deterministic placeholder.
  const realBarsByPlatform = new Map<SocialPlatform, number[]>();
  for (const p of dash.platforms) {
    const snaps = db.social.snapshots(p.platform).map((s) => s.followers).slice(-12);
    if (snaps.length >= 2) realBarsByPlatform.set(p.platform, snaps);
  }

  // Run outcomes — reliability at a glance.
  const okRuns = runs.filter((r) => r.ok).length;
  const outcomeItems: PieItem[] = [
    { key: 'ok', label: 'Succeeded', value: okRuns },
    { key: 'fail', label: 'Failed', value: runs.length - okRuns },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="operating metrics"
        title="Analytics"
        right={<Badge tone="accent">{live.length} live · {pending.length} pending</Badge>}
      />

      {/* Live metric tiles */}
      {live.length > 0 && (
        <Rise as="section" i={1} className="mb-6 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4 ultra:grid-cols-6">
          {live.map((tile) => (
            <MetricCard key={tile.id} tile={tile} spark={sparkOf(tile.id, tile.value)} />
          ))}
        </Rise>
      )}

      {/* Distribution — share donuts across audience, agents, run outcomes */}
      <Rise as="section" i={2} className="mb-6">
        <SectionHead label="Distribution" count="share of totals" />
        <div className="grid gap-3.5 lg:grid-cols-3">
          {audienceReach > 0 && (
            <PieCard
              title="Audience share"
              sub={`${formatFollowers(audienceReach)} reach`}
              items={audienceItems}
              total={audienceReach}
              centerLabel="total reach"
              format={formatFollowers}
              ariaLabel="Audience share by channel"
            />
          )}
          {runs.length > 0 && (
            <PieCard
              title="Agent runs · by agent"
              sub={`${fmtCount(runs.length)} runs`}
              items={runsByAgentItems}
              total={runs.length}
              centerLabel="agent runs"
              format={fmtCount}
              ariaLabel="Agent runs by agent"
            />
          )}
          {runs.length > 0 && (
            <PieCard
              title="Run outcomes"
              sub={`${Math.round((okRuns / runs.length) * 100)}% ok`}
              items={outcomeItems}
              total={runs.length}
              centerLabel="run outcomes"
              format={fmtCount}
              ariaLabel="Agent run outcomes"
            />
          )}
        </div>
      </Rise>

      {/* Agent run volume (real log) + awaiting-credentials sidebar */}
      <Rise as="section" i={3} className="mb-6 grid gap-3.5 xl:grid-cols-3">
        <RunVolumeCard data={runVolume} />

        <div className="flex flex-col rounded-lg-t border border-os-border bg-os-surface p-5">
          <Label>Awaiting credentials</Label>
          <div className="mt-3 flex flex-1 flex-col gap-2">
            {pending.length === 0 ? (
              <div className="flex flex-1 items-center justify-center font-mono text-[11px] text-os-dim">
                all connectors live ✓
              </div>
            ) : (
              pending.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-sm-t border border-os-border bg-os-surface2 px-3.5 py-3"
                >
                  <span className="dot off" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold text-os-muted">{m.label}</div>
                    <div className="mt-0.5 font-mono text-[9.5px] text-os-dim">{m.source}</div>
                  </div>
                  <span className="shrink-0 font-mono text-[16px] font-semibold text-os-dim">—</span>
                </div>
              ))
            )}
          </div>
          <Link
            href="/integrations"
            data-lens="c"
            className="pressable is-dark mt-3 flex items-center justify-center gap-1.5 rounded-ctl border border-os-border bg-os-surface2 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-os-muted"
          >
            wire connectors → flip to live
          </Link>
        </div>
      </Rise>

      {/* Audience by platform — real Zernio snapshot data */}
      <Rise as="section" i={4}>
        <SectionHead label="Audience · by platform" count={`${formatFollowers(totalFollowers)} total`} link="Open Social" href="/social" />
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 ultra:grid-cols-4">
          {dash.platforms.map((p) => {
            const Icon = PLATFORM_ICONS[p.platform];
            const share = totalFollowers > 0 && p.followers != null ? (p.followers / totalFollowers) * 100 : 0;
            return (
              <Link
                key={p.platform}
                href={`/social/${p.platform}`}
                data-lens="r" className="pressable is-row group rounded-lg-t border border-os-border bg-os-surface p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center lens-child rounded-ctl bg-os-surface2 group-hover:bg-os-accent group-hover:[&>svg]:text-os-ink">
                      <Icon className="h-4 w-4 text-os-text" />
                    </div>
                    <div>
                      <div className="text-sm font-bold">{PLATFORM_LABELS[p.platform]}</div>
                      <div className="font-mono text-[10px] text-os-dim">{p.handle}</div>
                    </div>
                  </div>
                  <GrowthBadge label="7d" value={p.growth.d7} />
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div className="font-mono text-[24px] font-semibold tracking-[-0.02em]">
                    {formatFollowers(p.followers)}
                  </div>
                  <MiniBars bars={realBarsByPlatform.get(p.platform) ?? barsFor(p.platform)} />
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded-sm-t bg-os-surface2">
                  <div className="h-full bg-os-accent opacity-60" style={{ width: `${share}%` }} />
                </div>
                <div className="mt-1.5 font-mono text-[9.5px] text-os-dim">{share.toFixed(0)}% of reach</div>
              </Link>
            );
          })}
        </div>
      </Rise>
    </div>
  );
}
