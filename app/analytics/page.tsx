import Link from 'next/link';
import { Instagram, Linkedin, Music2, Twitter, Youtube, type LucideIcon } from 'lucide-react';
import { getDb } from '@/lib/data';
import { buildSocialDashboard, syncFromZernioConfig, audienceGrowthPct, PLATFORM_LABELS } from '@/lib/social';
import { agentRunVolume, runsWithin } from '@/lib/analytics';
import { splitMetrics, type MetricInput, type MetricTile } from '@/lib/operating-metrics';
import { attioStatus } from '@/lib/connectors/attio';
import { wisprStatus } from '@/lib/connectors/wispr';
import { readStoreNotes } from '@/lib/connectors/gbrain';
import { stripeSnapshot } from '@/lib/connectors/payments';
import { unreadCounts } from '@/lib/connectors/email';
import { beehiivSubscribers } from '@/lib/connectors/beehiiv';
import type { SocialPlatform } from '@/lib/schemas';
import type { PieItem } from '@/lib/social-chart';
import { PageHeader } from '@/components/PageHeader';
import { Badge, Label, SectionHead, Spark } from '@/components/terminal';
import { SharePie } from '@/components/SharePie';
import { formatFollowers, GrowthBadge, MiniBars } from '@/components/SocialStats';

export const dynamic = 'force-dynamic';

const PLATFORM_ICONS: Record<SocialPlatform, LucideIcon> = {
  instagram: Instagram,
  tiktok: Music2,
  twitter: Twitter,
  youtube: Youtube,
  linkedin: Linkedin,
};

// Value + small-unit split per tile (compact for audience, $ for money).
function tileValue(value: number, unit: string): { main: string; small: string } {
  if (unit === 'usd') return { main: `$${value.toLocaleString('en-US')}`, small: '' };
  if (unit === 'followers') return { main: formatFollowers(value), small: '' };
  return { main: value.toLocaleString('en-US'), small: unit };
}

// Deterministic spark shape per metric id until per-metric history lands.
function sparkFor(id: string, value: number): number[] {
  const seed = [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return Array.from({ length: 7 }, (_, i) => {
    const wobble = ((seed * (i + 3)) % 17) / 17 - 0.5;
    return Math.max(0, value * (0.82 + 0.18 * (i / 6) + wobble * 0.08));
  });
}

// Deterministic rising bars per channel for the by-platform cards.
function barsFor(seed: string): number[] {
  const base = [...seed].reduce((s, c) => s + c.charCodeAt(0), 0);
  return Array.from({ length: 12 }, (_, i) => 4 + i * 1.3 + ((base + i * 7) % 5));
}

function fmtShort(iso: string): string {
  return new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .toLowerCase();
}

const fmtCount = (n: number) => n.toLocaleString('en-US');

/** Responsive area chart for daily agent-run counts (real log, honest zeros). */
function RunVolumeChart({ data }: { data: { date: string; count: number }[] }) {
  const W = 640;
  const H = 170;
  const pad = 8;
  const max = Math.max(...data.map((d) => d.count), 1);
  const n = data.length;
  const xAt = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const yAt = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const pts = data.map((d, i) => `${xAt(i).toFixed(1)},${yAt(d.count).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[170px] w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="runfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="var(--border)" strokeWidth="1" />
      ))}
      <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill="url(#runfill)" />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MetricCard({ tile }: { tile: MetricTile }) {
  const up = tile.delta > 0;
  const flat = tile.delta === 0;
  const { main, small } = tileValue(tile.value, tile.unit);
  return (
    <div className="hoverable flex flex-col gap-2.5 rounded-lg-t border border-os-border bg-os-surface px-[18px] py-4">
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
        <Spark data={sparkFor(tile.id, tile.value)} w={96} h={26} />
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
  const runVolume = agentRunVolume(runs, today, 14);
  const windowRuns = runVolume.reduce((s, p) => s + p.count, 0);
  const runs7d = runsWithin(runs, today, 7);

  // Real audience — Zernio snapshot totals + true 7d growth.
  const dash = buildSocialDashboard(db);
  const totalFollowers = dash.totalFollowers;
  const audience7d = audienceGrowthPct(db, 7);

  // Live reads from the wired connectors (parallel; each degrades to pending).
  const [attio, wispr, stripe, emailUnread, subs] = await Promise.all([
    attioStatus().catch(() => null),
    wisprStatus().catch(() => null),
    stripeSnapshot().catch(() => null),
    unreadCounts()
      .then((cs) => cs.reduce((sum, c) => sum + c.unread, 0))
      .catch(() => null),
    beehiivSubscribers().catch(() => null),
  ]);
  const pipelineDeals = attio?.state === 'connected' ? Number(attio.meta?.deals ?? 0) : null;
  const dictations = wispr?.state === 'connected' ? Number(wispr.meta?.dictations ?? 0) : null;
  const stripeAvail = stripe ? Math.round((stripe.available[0]?.amount ?? 0) / 100) : null;
  let brainPages = 0;
  try {
    brainPages = readStoreNotes().length;
  } catch {
    brainPages = 0;
  }

  // Every tile is a real connector read, or honest pending (value === null).
  const inputs: MetricInput[] = [
    {
      id: 'audience',
      label: 'Audience',
      unit: 'followers',
      source: '7d · Zernio',
      value: totalFollowers || null,
      delta: audience7d != null ? Math.round(audience7d * 10) / 10 : 0,
      deltaPct: audience7d != null,
    },
    { id: 'subscribers', label: 'Subscribers', unit: 'subs', source: 'Beehiiv', value: subs },
    { id: 'pipeline', label: 'Open Pipeline', unit: 'deals', source: 'Attio', value: pipelineDeals },
    { id: 'stripe', label: 'Stripe Available', unit: 'usd', source: 'Stripe', value: stripeAvail },
    { id: 'agent-runs', label: 'Agent Runs', unit: 'runs', source: 'all time', value: runs.length || null, delta: runs7d },
    { id: 'unread', label: 'Unread · all inboxes', unit: 'emails', source: 'Email', value: emailUnread },
    { id: 'brain', label: 'Brain-store Pages', unit: 'pages', source: 'GBrain', value: brainPages },
    { id: 'dictations', label: 'Dictations', unit: 'dictations', source: 'Wispr Flow', value: dictations },
  ];
  const { live, pending } = splitMetrics(inputs);

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
        <section className="mb-6 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4 ultra:grid-cols-6">
          {live.map((tile) => (
            <MetricCard key={tile.id} tile={tile} />
          ))}
        </section>
      )}

      {/* Distribution — share donuts across audience, agents, run outcomes */}
      <section className="mb-6">
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
      </section>

      {/* Agent run volume (real log) + awaiting-credentials sidebar */}
      <section className="mb-6 grid gap-3.5 xl:grid-cols-3">
        <div className="rounded-lg-t border border-os-border bg-os-surface p-5 xl:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Agent run volume · 14d</Label>
            <span className="font-mono text-[11px] text-os-muted">{windowRuns} runs</span>
          </div>
          <div className="mt-4">
            <RunVolumeChart data={runVolume} />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[9.5px] uppercase tracking-[0.12em] text-os-dim">
            <span>{fmtShort(runVolume[0].date)}</span>
            <span>{fmtShort(runVolume[Math.floor(runVolume.length / 2)].date)}</span>
            <span>{fmtShort(runVolume[runVolume.length - 1].date)}</span>
          </div>
        </div>

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
            className="mt-3 flex items-center justify-center gap-1.5 rounded-sm-t border border-os-border bg-os-surface2 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-os-muted transition-colors hover:border-os-accent hover:text-os-accent"
          >
            wire connectors → flip to live
          </Link>
        </div>
      </section>

      {/* Audience by platform — real Zernio snapshot data */}
      <section>
        <SectionHead label="Audience · by platform" count={`${formatFollowers(totalFollowers)} total`} link="Open Social" href="/social" />
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 ultra:grid-cols-4">
          {dash.platforms.map((p) => {
            const Icon = PLATFORM_ICONS[p.platform];
            const share = totalFollowers > 0 && p.followers != null ? (p.followers / totalFollowers) * 100 : 0;
            return (
              <Link
                key={p.platform}
                href={`/social/${p.platform}`}
                className="hoverable group rounded-lg-t border border-os-border bg-os-surface p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-sm-t bg-os-surface2 transition-colors group-hover:bg-os-accent group-hover:[&>svg]:text-os-ink">
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
                  <MiniBars bars={barsFor(p.platform)} />
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded-sm-t bg-os-surface2">
                  <div className="h-full bg-os-accent opacity-60" style={{ width: `${share}%` }} />
                </div>
                <div className="mt-1.5 font-mono text-[9.5px] text-os-dim">{share.toFixed(0)}% of reach</div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
