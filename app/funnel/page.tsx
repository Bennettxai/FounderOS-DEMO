import Link from 'next/link';
import { getDb } from '@/lib/data';
import {
  attentionQueue,
  funnelSummary,
  journeyMeta,
  splitFunnelJourneys,
  decayFactor,
  DECAY_DAYS,
  FUNNEL_STAGES,
  CHANNEL_GLYPHS,
} from '@/lib/funnel';
import { funnelSpaceModel } from '@/lib/funnel';
import { funnelRadialModel } from '@/lib/funnel-radial';
import { attioFunnelJourneys } from '@/lib/funnel-live';
import { ghlFunnelJourneys } from '@/lib/funnel-ghl';
import { mergeTrakyoTouches, trakyoTouches } from '@/lib/funnel-trakyo';
import { lastMessageFor } from '@/lib/funnel-contact';
import { gatherCommsFeed } from '@/lib/comms-feed';
import type { CommsItem } from '@/lib/comms';
import { attioStatus } from '@/lib/connectors/attio';
import { ghlStatus } from '@/lib/connectors/ghl';
import { trakyoStatus } from '@/lib/connectors/trakyo';
import { metaAdsStatus } from '@/lib/connectors/meta-ads';
import { getVenture } from '@/lib/ventures';
import { FunnelRadialLazy, FunnelSpaceLazy } from '@/components/FunnelGraphsLazy';
import { Badge, SectionHead } from '@/components/terminal';
import {
  FunnelStageSchema,
  FunnelVentureSchema,
  type FunnelJourney,
  type FunnelStage,
  type FunnelTouch,
  type FunnelVenture,
} from '@/lib/schemas';
import type { ConnectorStatus } from '@/lib/connectors/types';

export const dynamic = 'force-dynamic';

const VENTURE_TABS: { id: FunnelVenture | 'all'; label: string }[] = [
  { id: 'all', label: 'All clients' },
  { id: 'vantage', label: 'Vantage' },
  { id: 'launchpad-cohort', label: 'Launchpad Cohort' },
];

function usd(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

function ventureColor(id: FunnelVenture): string {
  return getVenture(id)?.color ?? 'var(--accent)';
}

/** Compact source check: ✓ when connected, ○ when pending — detail on hover. */
function SourceCheck({ status, live, count }: { status: ConnectorStatus; live?: boolean; count?: number }) {
  const ok = status.state === 'connected';
  return (
    <span
      title={status.detail}
      className={`inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.12em] ${
        ok ? (live ? 'text-os-ok' : 'text-os-muted') : 'text-os-dim'
      }`}
    >
      {ok ? '✓' : '○'} {status.name}
      {live && count != null ? ` ${count}` : ''}
    </span>
  );
}

function TouchChip({ touch }: { touch: FunnelTouch }) {
  return (
    <span
      className="inline-flex max-w-[260px] items-center gap-1.5 rounded-sm-t border border-os-border bg-os-surface2 px-2 py-1"
      title={`${touch.stage} · via ${touch.source} · ${touch.at}`}
    >
      <span className="shrink-0 font-mono text-[10px] text-os-accent">{CHANNEL_GLYPHS[touch.channel] ?? '·'}</span>
      <span className="truncate text-[11px] text-os-muted">{touch.label}</span>
      <span className="shrink-0 font-mono text-[9.5px] text-os-dim">{touch.at.slice(5)}</span>
    </span>
  );
}

const RELATIONSHIP_VAR: Record<FunnelJourney['relationship'], string> = {
  hot: 'var(--funnel-hot)',
  warm: 'var(--funnel-warm)',
  cold: 'var(--funnel-cold)',
};

/** Compact outreach links — only the channels this lead actually has. */
function ContactActions({ journey }: { journey: FunnelJourney }) {
  const digits = journey.phone?.replace(/[^\d]/g, '');
  const isGhl = journey.url?.includes('gohighlevel');
  return (
    <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide">
      {journey.email && (
        <a href={`mailto:${journey.email}`} title={journey.email} className="text-os-muted hover:text-os-accent">
          email
        </a>
      )}
      {digits && (
        <a
          href={`https://wa.me/${digits}`}
          target="_blank"
          rel="noopener noreferrer"
          title={journey.phone ?? undefined}
          className="text-os-muted hover:text-os-accent"
        >
          wa
        </a>
      )}
      {journey.phone && (
        <a href={`sms:${journey.phone}`} title={journey.phone} className="text-os-muted hover:text-os-accent">
          sms
        </a>
      )}
      {journey.url && (
        <a
          href={journey.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-os-dim hover:text-os-accent"
        >
          {isGhl ? 'ghl↗' : 'attio↗'}
        </a>
      )}
      {!journey.email && !journey.phone && !journey.url && <span className="text-os-dim">—</span>}
    </span>
  );
}

/** One attention row — clicking it pins that lead's dossier in the canvas. */
function AttentionRow({
  journey,
  now,
  href,
}: {
  journey: FunnelJourney;
  now: Date;
  href: string;
}) {
  const meta = journeyMeta(journey, now);
  const decay = decayFactor(meta.daysSinceLastTouch, journey.status);
  const stageLabel = FUNNEL_STAGES.find((s) => s.id === journey.status)?.label ?? journey.status;
  return (
    <Link
      href={href}
      className="group flex items-baseline gap-2 border-t border-os-border px-2.5 py-1.5 transition-colors hover:bg-os-surface2"
    >
      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold group-hover:text-os-accent">
        {journey.person ?? journey.name}
      </span>
      {journey.company && (
        <span className="hidden max-w-[120px] truncate text-[10.5px] text-os-dim sm:inline">{journey.company}</span>
      )}
      <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-wide text-os-dim">{stageLabel}</span>
      <span
        className="shrink-0 font-mono text-[10px]"
        style={
          decay > 0
            ? { color: `color-mix(in oklab, var(--err) ${Math.round(Math.sqrt(decay) * 85)}%, var(--text-2))` }
            : { color: 'var(--text-3)' }
        }
      >
        {meta.daysSinceLastTouch}d
      </span>
      <span className="shrink-0 font-mono text-[10px] text-os-muted">{journey.likelihood}%</span>
      {(journey.amountUsd ?? 0) > 0 && (
        <span className="shrink-0 font-mono text-[10px] text-os-muted">{usd(journey.amountUsd ?? 0)}</span>
      )}
    </Link>
  );
}

const agoDays = (ts: string, now: Date): string => {
  const d = Math.max(0, Math.floor((now.getTime() - Date.parse(ts)) / 86_400_000));
  return d === 0 ? 'today' : `${d}d ago`;
};

/** Two table rows per client: the formatted data line, then their touches. */
function JourneyTableRows({
  journey,
  now,
  lastMsg,
}: {
  journey: FunnelJourney;
  now: Date;
  /** undefined = lookup not run (no segment selected) · null = no thread found */
  lastMsg?: CommsItem | null;
}) {
  const stageLabel = FUNNEL_STAGES.find((s) => s.id === journey.status)?.label ?? journey.status;
  const converted = journey.status === 'converted';
  const meta = journeyMeta(journey, now);
  const decay = decayFactor(meta.daysSinceLastTouch, journey.status);
  const entrySource = journey.touches[0]?.source;
  const lane =
    entrySource === 'attio' || entrySource === 'ghl'
      ? 'crm'
      : journey.touches[0]?.channel === 'ads'
        ? 'ads'
        : 'organic';
  return (
    <>
      <tr className="border-t border-os-border">
        <td className="px-3 py-2.5">
          <span className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: ventureColor(journey.venture) }}
              title={getVenture(journey.venture)?.label}
            />
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-semibold" title={journey.name}>
                {journey.person ?? journey.name}
              </span>
              {journey.company && (
                <span className="block truncate text-[10px] text-os-dim">{journey.company}</span>
              )}
            </span>
          </span>
        </td>
        <td className="px-3 py-2.5 font-mono text-[10.5px] uppercase tracking-wide">
          <span className={converted ? 'text-os-ok' : meta.state === 'stalled' ? 'text-os-err' : 'text-os-muted'}>
            {stageLabel}
          </span>
        </td>
        <td
          className={`px-3 py-2.5 font-mono text-[11px] ${meta.state === 'stalled' && decay === 0 ? 'text-os-err' : 'text-os-dim'}`}
          style={
            decay > 0
              ? { color: `color-mix(in oklab, var(--err) ${Math.round(Math.sqrt(decay) * 85)}%, var(--text-2))` }
              : undefined
          }
        >
          {meta.daysSinceLastTouch}d
        </td>
        <td className="px-3 py-2.5 font-mono text-[10.5px] capitalize" style={{ color: RELATIONSHIP_VAR[journey.relationship] }}>
          {journey.relationship}
        </td>
        <td className="px-3 py-2.5 font-mono text-[11px] text-os-muted">{journey.likelihood}%</td>
        <td className="px-3 py-2.5 font-mono text-[10.5px] uppercase tracking-wide text-os-dim">{lane}</td>
        <td className="max-w-[220px] px-3 py-2.5">
          {converted ? (
            <span className="block truncate font-mono text-[10.5px] text-os-ok" title={journey.product ?? undefined}>
              {usd(journey.amountUsd ?? 0)}
              {journey.product ? ` · ${journey.product}` : ''}
            </span>
          ) : (
            <span className="font-mono text-[10.5px] text-os-dim">—</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <ContactActions journey={journey} />
        </td>
      </tr>
      <tr>
        <td colSpan={8} className="px-3 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {journey.touches.map((t, i) => (
              <span key={t.id} className="flex items-center gap-1.5">
                {i > 0 && <span className="font-mono text-[10px] text-os-dim">→</span>}
                <TouchChip touch={t} />
              </span>
            ))}
            {!converted && <span className="font-mono text-[10px] text-os-dim">→ …</span>}
            {lastMsg !== undefined && (
              <span className="ml-auto flex min-w-0 items-center gap-1.5 font-mono text-[10px]">
                <span className="shrink-0 uppercase tracking-wide text-os-dim">last msg</span>
                {lastMsg ? (
                  <span className="min-w-0 truncate text-os-muted" title={lastMsg.preview}>
                    via {lastMsg.source} · {agoDays(lastMsg.ts, now)} · “{lastMsg.preview.slice(0, 60)}”
                  </span>
                ) : (
                  <span className="text-os-dim">no thread on record</span>
                )}
              </span>
            )}
          </div>
        </td>
      </tr>
    </>
  );
}

export default async function FunnelPage({
  searchParams,
}: {
  searchParams?: { venture?: string; view?: string; stage?: string; layout?: string; lead?: string };
}) {
  const parsed = FunnelVentureSchema.safeParse(searchParams?.venture);
  const venture = parsed.success ? parsed.data : undefined;
  const view = searchParams?.view === 'archive' ? 'archive' : 'live';
  const stageParsed = FunnelStageSchema.safeParse(searchParams?.stage);
  const stage = stageParsed.success ? stageParsed.data : undefined;
  // Two ways to see the same journeys: hubs left → right, or the circle
  // running outside → in (acquisition wedges around the rim, purchase center).
  const layout = searchParams?.layout === 'radial' ? 'radial' : 'flow';
  const href = (
    v: FunnelVenture | undefined,
    w: 'live' | 'archive',
    s: FunnelStage | undefined = stage,
    l: 'flow' | 'radial' = layout,
    leadId?: string,
  ) => {
    const params = new URLSearchParams();
    if (v) params.set('venture', v);
    if (w === 'archive') params.set('view', 'archive');
    if (s) params.set('stage', s);
    if (l === 'radial') params.set('layout', 'radial');
    if (leadId) params.set('lead', leadId);
    const qs = params.toString();
    return qs ? `/funnel?${qs}` : '/funnel';
  };

  const now = new Date();
  // Live-first: Attio ∪ GHL when keys resolve (either alone works); seed
  // otherwise. Trakyo's attributed touches merge in the moment its API exists.
  const [attioLive, ghlLive] = await Promise.all([attioFunnelJourneys(now), ghlFunnelJourneys(now)]);
  const liveJourneys = [...(attioLive?.journeys ?? []), ...(ghlLive?.journeys ?? [])];
  const isLive = liveJourneys.length > 0;
  const excludedCount = (attioLive?.closedLost ?? 0) + (ghlLive?.excluded ?? 0);
  const liveLabel = [
    attioLive && attioLive.journeys.length > 0 ? `Attio ${attioLive.total}` : null,
    ghlLive && ghlLive.journeys.length > 0 ? `GHL ${ghlLive.total}` : null,
  ]
    .filter(Boolean)
    .join(' + ');
  const allJourneys = isLive
    ? mergeTrakyoTouches(liveJourneys, await trakyoTouches()).filter((j) => !venture || j.venture === venture)
    : getDb().funnel.journeys(venture);
  // Quiet past DECAY_DAYS → out of the space, into the archive tab.
  const { active: journeys, archived } = splitFunnelJourneys(allJourneys, now);
  const summary = funnelSummary(journeys);
  const radial = layout === 'radial' ? funnelRadialModel(journeys, now) : null;
  const spaceNodes = layout === 'flow' ? funnelSpaceModel(journeys, now) : null;
  // ?lead= (attention-rail clicks) pins that lead's dossier in the canvas
  const lead = journeys.some((j) => j.id === searchParams?.lead) ? searchParams?.lead : undefined;
  const attention = attentionQueue(journeys, now);

  // Segment select: the table narrows to one stage; with a bounded row set we
  // can afford the live comms lookup (last message per lead, honest on miss).
  const tableJourneys = stage ? journeys.filter((j) => j.status === stage) : journeys;
  const stageCounts = new Map<FunnelStage, number>();
  for (const j of journeys) stageCounts.set(j.status, (stageCounts.get(j.status) ?? 0) + 1);
  let commsFeed: CommsItem[] | null = null;
  if (stage && tableJourneys.length > 0) {
    commsFeed = await gatherCommsFeed(200).catch(() => null);
  }
  const [attio, ghl, trakyo, metaAds] = await Promise.all([
    attioStatus(),
    ghlStatus(),
    trakyoStatus(),
    metaAdsStatus(),
  ]);

  return (
    <div>
      {/* Camera-ready: two slim rows, then the space owns the viewport. */}
      <header className="mb-2 flex items-end justify-between gap-4">
        <h1 className="text-[25px] font-bold uppercase leading-[1.1] tracking-[0.06em]">Funnel</h1>
        <div className="flex shrink-0 items-center gap-2">
          {isLive ? (
            <Badge tone="ok">live · {liveLabel}</Badge>
          ) : (
            <Badge tone="warn" ghost>
              demo data
            </Badge>
          )}
          <Badge tone="accent">
            {summary.converted}/{summary.clients} converted · {usd(summary.revenueUsd)}
          </Badge>
        </div>
      </header>

      {/* one control line: venture filter · synced sources · view toggle */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-1.5">
          {VENTURE_TABS.map((tab) => {
            const active = (venture ?? 'all') === tab.id;
            return (
              <Link
                key={tab.id}
                href={href(tab.id === 'all' ? undefined : (tab.id as FunnelVenture), view)}
                title={tab.id !== 'all' && isLive ? 'Live split = deal-name heuristic; add a venture attribute in Attio for exact' : undefined}
                className={`rounded-sm-t border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                  active
                    ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-os-accent'
                    : 'border-os-border text-os-dim hover:border-os-border-strong hover:text-os-muted'
                }`}
              >
                {tab.id !== 'all' && (
                  <span
                    className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                    style={{ background: ventureColor(tab.id as FunnelVenture) }}
                  />
                )}
                {tab.label}
              </Link>
            );
          })}
        </span>
        <span className="h-3 w-px bg-os-border" />
        <span className="flex items-center gap-2.5" title={isLive ? `${excludedCount} lost/closed-lost excluded` : undefined}>
          <SourceCheck status={attio} live={Boolean(attioLive?.journeys.length)} count={attioLive?.total} />
          <SourceCheck status={ghl} live={Boolean(ghlLive?.journeys.length)} count={ghlLive?.total} />
          <SourceCheck status={trakyo} />
          <SourceCheck status={metaAds} />
        </span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide">
          <Link
            href={href(venture, 'live', stage, 'flow')}
            title="Open space left → right — every lead orbits the stage it's in now"
            className={layout === 'flow' && view === 'live' ? 'text-os-accent' : 'text-os-dim hover:text-os-muted'}
          >
            flow
          </Link>
          <span className="text-os-dim">·</span>
          <Link
            href={href(venture, 'live', stage, 'radial')}
            title="Circle, outside → in — center is the purchase"
            className={layout === 'radial' && view === 'live' ? 'text-os-accent' : 'text-os-dim hover:text-os-muted'}
          >
            radial
          </Link>
          <span className="mx-1 h-3 w-px bg-os-border" />
          <Link
            href={href(venture, 'live')}
            className={view === 'live' ? 'text-os-accent' : 'text-os-dim hover:text-os-muted'}
          >
            live funnel
          </Link>
          <span className="text-os-dim">·</span>
          <Link
            href={href(venture, 'archive')}
            className={view === 'archive' ? 'text-os-accent' : 'text-os-dim hover:text-os-muted'}
          >
            archive ({archived.length})
          </Link>
        </span>
      </div>

      {/* The space — every node is a client travelling toward conversion.
          Leads quiet past DECAY_DAYS decay into the archive tab. */}
      <section>
        <div className="rounded-lg-t border border-os-border bg-os-surface p-2">
          {view === 'archive' ? (
            archived.length === 0 ? (
              <p className="py-6 text-center font-mono text-[11.5px] text-os-dim">
                Nothing decayed — no lead has sat quiet past {DECAY_DAYS} days.
              </p>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-os-dim">
                    <th className="px-3 pb-1 pt-2 font-normal">Lead</th>
                    <th className="px-3 pb-1 pt-2 font-normal">Reached</th>
                    <th className="px-3 pb-1 pt-2 font-normal">Quiet</th>
                    <th className="px-3 pb-1 pt-2 font-normal">Likelihood</th>
                    <th className="px-3 pb-1 pt-2 font-normal">Last touch</th>
                    <th className="px-3 pb-1 pt-2 font-normal" />
                  </tr>
                </thead>
                <tbody>
                  {archived.map((j) => {
                    const meta = journeyMeta(j, now);
                    const last = j.touches[j.touches.length - 1];
                    return (
                      <tr key={j.id} className="border-t border-os-border text-os-dim">
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2">
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full opacity-60"
                              style={{ background: ventureColor(j.venture) }}
                            />
                            <span className="truncate text-[12px] text-os-muted">{j.name}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide">
                          {FUNNEL_STAGES.find((s) => s.id === j.status)?.label ?? j.status}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10.5px]">{meta.daysSinceLastTouch}d</td>
                        <td className="px-3 py-2 font-mono text-[10.5px]">{j.likelihood}%</td>
                        <td className="max-w-[300px] truncate px-3 py-2 text-[11px]" title={last?.label}>
                          {last?.label ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {j.url && (
                            <a
                              href={j.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-[9.5px] uppercase tracking-wide text-os-dim hover:text-os-accent"
                            >
                              attio ↗
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : radial ? (
            <FunnelRadialLazy model={radial} initialLeadId={lead} />
          ) : spaceNodes ? (
            <FunnelSpaceLazy nodes={spaceNodes} summary={summary} initialLeadId={lead} />
          ) : null}
        </div>
      </section>

      {/* What to act on today — the funnel answering a question. Every row
          click pins that lead's dossier in the canvas above. */}
      {view === 'live' && (attention.pushNow.length > 0 || attention.saveNow.length > 0) && (
        <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg-t border border-os-border bg-os-surface">
            <div className="flex items-baseline justify-between px-2.5 py-2">
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.22em] text-os-accent">
                push now
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wide text-os-dim">
                hot + moving — close them
              </span>
            </div>
            {attention.pushNow.length === 0 ? (
              <p className="border-t border-os-border px-2.5 py-2 font-mono text-[10px] text-os-dim">
                no hot leads in motion right now
              </p>
            ) : (
              attention.pushNow.map((j) => (
                <AttentionRow key={j.id} journey={j} now={now} href={href(venture, view, stage, layout, j.id)} />
              ))
            )}
          </div>
          <div className="rounded-lg-t border border-os-border bg-os-surface">
            <div className="flex items-baseline justify-between px-2.5 py-2">
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.22em] text-os-err">
                save now
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wide text-os-dim">
                fading toward the archive — highest likelihood first
              </span>
            </div>
            {attention.saveNow.length === 0 ? (
              <p className="border-t border-os-border px-2.5 py-2 font-mono text-[10px] text-os-dim">
                nothing fading — every lead is fresh
              </p>
            ) : (
              attention.saveNow.map((j) => (
                <AttentionRow key={j.id} journey={j} now={now} href={href(venture, view, stage, layout, j.id)} />
              ))
            )}
          </div>
        </section>
      )}

      {/* The same clients as formatted data — pick a segment, contact them */}
      <section className="mt-8">
        <SectionHead label="Journey data" count={`${tableJourneys.length}`} />
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Link
            href={href(venture, view, undefined)}
            className={`rounded-sm-t border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
              !stage
                ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-os-accent'
                : 'border-os-border text-os-dim hover:border-os-border-strong hover:text-os-muted'
            }`}
          >
            All segments
          </Link>
          {FUNNEL_STAGES.map((s, i) => {
            const active = stage === s.id;
            return (
              <Link
                key={s.id}
                href={href(venture, view, active ? undefined : s.id)}
                className={`rounded-sm-t border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                  active
                    ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-os-accent'
                    : 'border-os-border text-os-dim hover:border-os-border-strong hover:text-os-muted'
                }`}
              >
                <span
                  className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                  style={{ background: `var(--funnel-s${i})` }}
                />
                {s.label} ({stageCounts.get(s.id) ?? 0})
              </Link>
            );
          })}
          {stage && !commsFeed && tableJourneys.length > 0 && (
            <span className="font-mono text-[10px] text-os-dim">comms feed unavailable — last messages hidden</span>
          )}
        </div>
        {tableJourneys.length === 0 ? (
          <p className="rounded-lg-t border border-dashed border-os-border bg-os-surface px-4 py-5 text-center font-mono text-[11.5px] text-os-dim">
            No leads in this segment.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg-t border border-os-border bg-os-surface">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-os-dim">
                  <th className="px-3 pb-1 pt-3 font-normal">Client</th>
                  <th className="px-3 pb-1 pt-3 font-normal">Stage</th>
                  <th className="px-3 pb-1 pt-3 font-normal">Quiet</th>
                  <th className="px-3 pb-1 pt-3 font-normal">Relationship</th>
                  <th className="px-3 pb-1 pt-3 font-normal">Likelihood</th>
                  <th className="px-3 pb-1 pt-3 font-normal">Entry</th>
                  <th className="px-3 pb-1 pt-3 font-normal">Value</th>
                  <th className="px-3 pb-1 pt-3 font-normal">Contact</th>
                </tr>
              </thead>
              <tbody>
                {tableJourneys.map((j) => (
                  <JourneyTableRows
                    key={j.id}
                    journey={j}
                    now={now}
                    lastMsg={commsFeed ? lastMessageFor(j, commsFeed) : undefined}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
