'use client';

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowDownRight, ArrowUpRight, Search } from 'lucide-react';
import type { Campaign, DailyPoint } from '@/lib/adpilot';
import {
  aggregateAudience,
  aggregateCampaigns,
  aggregateDaily,
  aggregateGeo,
  campaignMetrics,
  type CampaignMetrics,
} from '@/lib/adpilot';

/**
 * The AdPilot command deck: campaigns chip → globe (naked over the page
 * grid, glowing stat widgets floating on the right) → snap-scrolling
 * campaign rail (built for N campaigns) → five composed widgets: Spend,
 * Delivery (dot-matrix: same visual language as the globe and the
 * reference boards), ROAS ring, Results, Audience. One shared selection
 * drives everything. Numerals ride the UI sans with tabular figures: mono
 * is retired from this page's face.
 */

const Globe = dynamic(() => import('@/components/adpilot/Globe').then((m) => m.Globe), {
  ssr: false,
  loading: () => <div className="h-[560px] w-full" />,
});

const nf = new Intl.NumberFormat('en-US');
const money = (v: number) => `$${nf.format(Math.round(v))}`;
const money2 = (v: number | null) => (v === null ? '-' : `$${v.toFixed(2)}`);
const times = (v: number | null) => (v === null ? '-' : `${v.toFixed(2)}x`);
const pct = (v: number | null) => (v === null ? '-' : `${(v * 100).toFixed(2)}%`);

/** The rail shows a type-to-filter affordance once campaigns outgrow it. */
const RAIL_FILTER_THRESHOLD = 10;

export function AdPilotDeck({ campaigns, syncedAt }: { campaigns: Campaign[]; syncedAt: string | null }) {
  const [selected, setSelected] = useState('all');
  const active = selected === 'all' ? campaigns : campaigns.filter((c) => c.id === selected);
  const empty = campaigns.length === 0;

  const metrics = useMemo(
    () => (active.length === 1 ? campaignMetrics(active[0]) : aggregateCampaigns(active)),
    [active],
  );
  const geo = useMemo(() => aggregateGeo(active), [active]);
  const audience = useMemo(() => (active.length === 1 ? active[0].audience : aggregateAudience(active)), [active]);
  const daily = useMemo(() => aggregateDaily(active), [active]);
  const liveCount = campaigns.filter((c) => c.status === 'active').length;

  return (
    <div>
      {/* Campaigns chip: floating glass, clear of the globe */}
      <div className="mb-6 flex justify-center">
        <div className="ap-chip flex items-center gap-2 px-5 py-2">
          <span className={`h-2 w-2 rounded-full ${liveCount > 0 ? 'bg-[var(--accent)]' : 'bg-os-dim'}`} />
          <span className="text-[13px] text-os-text">
            {empty ? 'No ad account connected' : `${liveCount} active campaign${liveCount === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      {/* The globe: no window; glowing stat widgets float on the right */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[820px] max-w-none -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(255,47,68,0.18), rgba(255,47,68,0.06) 46%, transparent 68%)' }}
        />
        <div className="pointer-events-none absolute right-0 top-10 z-10 flex w-48 flex-col gap-3">
          <StatFloat label="Total leads · 30 days" value={nf.format(metrics.leads)} />
          <StatFloat label="Booked calls" value={nf.format(metrics.bookings)} />
        </div>
        <Globe geo={geo} height={560} />
      </div>

      {empty ? (
        <div className="ap-panel mx-auto mt-4 max-w-xl px-4 py-6 text-center">
          <p className="text-[13px] text-os-muted">No ad account connected.</p>
          <p className="mt-1 text-[12px] text-os-dim">
            Campaigns arrive automatically once a Meta ad account is connected: nothing here is added by hand.
          </p>
        </div>
      ) : (
        <>
          <CampaignRail campaigns={campaigns} selected={selected} onSelect={setSelected} />

          {/* The metric deck: five composed widgets, room to breathe */}
          <div className="mt-5 grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <HeroSpend campaigns={campaigns} active={active} metrics={metrics} daily={daily} selected={selected} />
            </div>
            <div className="lg:col-span-8">
              <DeliveryMatrix campaigns={campaigns} selected={selected} />
            </div>
            <div className="lg:col-span-3">
              <RoasRing metrics={metrics} />
            </div>
            <div className="lg:col-span-4">
              <ResultsPanel metrics={metrics} />
            </div>
            <div className="lg:col-span-5">
              <AudiencePanel audience={audience} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** The glowing floaters beside the globe. */
function StatFloat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ap-frost px-4 py-3">
      <div className="relative text-[11.5px] text-os-dim">{label}</div>
      <div className="relative mt-0.5 text-[24px] font-light tabular-nums text-os-text">{value}</div>
    </div>
  );
}

/* ------------------------------ campaign rail ------------------------------ */

function CampaignRail({
  campaigns,
  selected,
  onSelect,
}: {
  campaigns: Campaign[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const showFilter = campaigns.length > RAIL_FILTER_THRESHOLD;
  const q = filter.trim().toLowerCase();
  const ordered = [...campaigns]
    .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'))
    .filter((c) => !q || c.name.toLowerCase().includes(q));

  const pill = (id: string, label: string, live: boolean | null) => {
    const isActive = selected === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => onSelect(id)}
        className={`pressable flex shrink-0 snap-start items-center gap-2 rounded-full border px-3.5 py-2 text-[12.5px] ${
          isActive
            ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-os-text'
            : 'border-[rgba(255,69,87,0.14)] text-os-dim hover:text-os-muted'
        }`}
      >
        {live !== null && <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-[var(--accent)]' : 'bg-os-dim'}`} />}
        <span className="max-w-[220px] truncate">{label}</span>
      </button>
    );
  };

  return (
    <div className="ap-panel mt-6 flex items-center gap-2 p-2">
      {pill('all', 'All campaigns', null)}
      <div className="h-6 w-px shrink-0 bg-[rgba(255,69,87,0.16)]" />
      <div
        ref={scrollRef}
        className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto"
        style={{
          scrollbarWidth: 'none',
          maskImage: 'linear-gradient(90deg, #000 92%, transparent)',
          WebkitMaskImage: 'linear-gradient(90deg, #000 92%, transparent)',
        }}
      >
        {ordered.map((c) => pill(c.id, c.name, c.status === 'active'))}
      </div>
      {showFilter && (
        <div className="flex shrink-0 items-center gap-1.5 pl-1">
          <Search className="h-3.5 w-3.5 text-os-dim" strokeWidth={1.7} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter"
            className="w-24 bg-transparent text-[12px] text-os-text outline-none placeholder:text-os-dim"
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------- hero spend -------------------------------- */

function windowDelta(daily: DailyPoint[], pick: (d: DailyPoint) => number): number | null {
  if (daily.length < 14) return null;
  const last7 = daily.slice(-7).reduce((s, d) => s + pick(d), 0);
  const prior7 = daily.slice(-14, -7).reduce((s, d) => s + pick(d), 0);
  if (prior7 <= 0) return null;
  return (last7 - prior7) / prior7;
}

function DeltaPill({ label, delta }: { label: string; delta: number | null }) {
  if (delta === null) return null;
  const up = delta >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="flex items-center gap-1 rounded-full border border-[rgba(255,69,87,0.18)] bg-black/30 px-2.5 py-1">
      <Icon className={`h-3 w-3 ${up ? 'text-[var(--accent)]' : 'text-os-dim'}`} strokeWidth={1.8} />
      <span className="text-[11px] tabular-nums text-os-muted">
        {up ? '+' : ''}
        {(delta * 100).toFixed(0)}% {label} · 7d
      </span>
    </span>
  );
}

function HeroSpend({
  campaigns,
  active,
  metrics,
  daily,
  selected,
}: {
  campaigns: Campaign[];
  active: Campaign[];
  metrics: CampaignMetrics;
  daily: DailyPoint[];
  selected: string;
}) {
  const maxSpend = Math.max(...campaigns.map((c) => c.spend), 1);
  return (
    <div className="ap-panel ap-glow h-full p-5">
      <div className="text-[12.5px] text-os-dim">Ad spend · 30 days</div>
      <div className="mt-1 text-[36px] font-light tabular-nums leading-none text-os-text">{money(metrics.spend)}</div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <DeltaPill label="spend" delta={windowDelta(daily, (d) => d.spend)} />
        <DeltaPill label="leads" delta={windowDelta(daily, (d) => d.leads)} />
      </div>
      <div className="mt-5 flex flex-col gap-3">
        {campaigns.map((c) => {
          const dimmed = selected !== 'all' && !active.some((a) => a.id === c.id);
          return (
            <div key={c.id} className={dimmed ? 'opacity-35' : ''}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12.5px] text-os-muted">{c.name}</span>
                <span className="text-[12px] tabular-nums text-os-text">{money(c.spend)}</span>
              </div>
              <div className="mt-1.5 h-[7px] overflow-hidden rounded-full bg-black/40">
                <div className="ap-hatch h-full rounded-full" style={{ width: `${(c.spend / maxSpend) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------- delivery matrix ----------------------------- */

/**
 * Spend per day as a dot matrix: one row per campaign, one dot per day,
 * intensity = that day's share of the campaign's peak. Same visual language
 * as the globe's landmass and the reference boards; reads pacing, weekend
 * dips, and pauses at a glance.
 */
function DeliveryMatrix({ campaigns, selected }: { campaigns: Campaign[]; selected: string }) {
  const rows = campaigns.filter((c) => (c.daily?.length ?? 0) > 0);
  if (rows.length === 0) {
    return (
      <div className="ap-panel flex h-full items-center justify-center p-5">
        <span className="text-[12px] text-os-dim">Daily delivery arrives with the ad-account sync.</span>
      </div>
    );
  }
  const dates = rows[0].daily!.map((d) => d.date);
  const peakAll = rows
    .flatMap((c) => c.daily!)
    .reduce((best, d) => (d.spend > best.spend ? d : best), { date: '', spend: 0 });

  return (
    <div className="ap-panel h-full p-5">
      <div className="flex items-baseline justify-between">
        <div className="text-[12.5px] text-os-dim">Delivery · spend per day</div>
        <div className="text-[11.5px] tabular-nums text-os-dim">
          {dates[0]?.slice(5)}: {dates[dates.length - 1]?.slice(5)}
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3.5">
        {rows.map((c) => {
          const dimmed = selected !== 'all' && selected !== c.id;
          const rowPeak = Math.max(...c.daily!.map((d) => d.spend), 1);
          return (
            <div key={c.id} className={dimmed ? 'opacity-30' : ''}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="truncate text-[12.5px] text-os-muted">{c.name}</span>
                <span className="text-[11px] tabular-nums text-os-dim">peak {money(rowPeak)}/d</span>
              </div>
              <div className="flex justify-between gap-[3px]">
                {c.daily!.map((d) => {
                  const t = d.spend / rowPeak;
                  return (
                    <span
                      key={d.date}
                      title={`${d.date} · $${nf.format(Math.round(d.spend))} · ${d.leads} leads`}
                      className="aspect-square w-full max-w-[13px] rounded-full"
                      style={{
                        background:
                          t <= 0.02 ? 'rgba(255,255,255,0.07)' : `rgba(255,69,87,${(0.1 + Math.pow(t, 1.7) * 0.88).toFixed(2)})`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[rgba(255,69,87,0.12)] pt-3">
        <span className="text-[11.5px] text-os-dim">
          Peak day {peakAll.date.slice(5)} · {money(peakAll.spend)}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-os-dim">
          quiet
          {[0.15, 0.45, 0.7, 1].map((t) => (
            <span key={t} className="h-[9px] w-[9px] rounded-full" style={{ background: `rgba(255,69,87,${0.1 + Math.pow(t, 1.7) * 0.88})` }} />
          ))}
          heavy
        </span>
      </div>
    </div>
  );
}

/* -------------------------------- ROAS ring -------------------------------- */

function RoasRing({ metrics }: { metrics: CampaignMetrics }) {
  const roas = metrics.roas;
  const CAP = 4;
  const R = 56;
  const C = 2 * Math.PI * R;
  const frac = roas === null ? 0 : Math.min(roas / CAP, 1);
  const tickAngle = (1 / CAP) * 360 - 90;
  return (
    <div className="ap-panel flex h-full flex-col items-center justify-center p-5">
      <div className="self-start text-[12.5px] text-os-dim">ROAS · revenue vs spend</div>
      <div className="relative mt-1">
        <svg width="150" height="150" viewBox="0 0 150 150">
          <circle cx="75" cy="75" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
          <circle
            cx="75"
            cy="75"
            r={R}
            fill="none"
            stroke="#ff4557"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(frac * C).toFixed(1)} ${C.toFixed(1)}`}
            transform="rotate(-90 75 75)"
          />
          <line x1="75" y1="11" x2="75" y2="21" stroke="#93a19d" strokeWidth="2" transform={`rotate(${tickAngle + 90} 75 75)`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-[27px] font-light tabular-nums ${roas !== null && roas >= 1 ? 'text-[var(--accent)]' : 'text-os-text'}`}>
            {times(roas)}
          </span>
          <span className="text-[10.5px] text-os-dim">break-even 1.00x</span>
        </div>
      </div>
      <div className="mt-1.5 flex gap-4 text-[11.5px] tabular-nums text-os-dim">
        <span>rev {money(metrics.revenue)}</span>
        <span>spend {money(metrics.spend)}</span>
      </div>
    </div>
  );
}

/* --------------------------------- results --------------------------------- */

function ResultsPanel({ metrics }: { metrics: CampaignMetrics }) {
  const items: [string, string][] = [
    ['Leads', nf.format(metrics.leads)],
    ['Bookings', nf.format(metrics.bookings)],
    ['Cost / lead', money2(metrics.cpl)],
    ['Cost / booking', money2(metrics.costPerBooking)],
    ['Cost / result', money2(metrics.costPerResult)],
    ['CTR', pct(metrics.ctr)],
  ];
  return (
    <div className="ap-panel h-full p-5">
      <div className="text-[12.5px] text-os-dim">Results</div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-center gap-2.5">
            <span className="h-8 w-[3px] shrink-0 rounded-full bg-[var(--accent)] opacity-70" />
            <div className="min-w-0">
              <div className="truncate text-[11.5px] text-os-dim">{label}</div>
              <div className="text-[20px] font-light tabular-nums text-os-text">{value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- audience -------------------------------- */

function AudiencePanel({ audience }: { audience: Campaign['audience'] }) {
  const groups: [string, Record<string, number>][] = [
    ['Age', audience.age],
    ['Gender', audience.gender],
    ['Placements', audience.placements],
  ];
  const SEGMENTS = 18;
  return (
    <div className="ap-panel h-full p-5">
      <div className="text-[12.5px] text-os-dim">Audience</div>
      <div className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {groups.map(([title, data]) => (
          <div key={title} className={title === 'Age' ? 'sm:row-span-2' : ''}>
            <div className="text-[11px] text-os-dim">{title}</div>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {Object.entries(data).map(([key, value]) => {
                const filled = Math.round((value / 100) * SEGMENTS);
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 truncate text-[12px] text-os-muted">{key}</span>
                    <div className="flex flex-1 gap-[2.5px]">
                      {Array.from({ length: SEGMENTS }, (_, i) => (
                        <span
                          key={i}
                          className="h-[10px] flex-1 rounded-[2px]"
                          style={{ background: i < filled ? 'rgba(255,69,87,0.85)' : 'rgba(255,255,255,0.06)' }}
                        />
                      ))}
                    </div>
                    <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-os-dim">{value.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
