import type { BrandDeal } from '@/lib/schemas';

/**
 * View model for the /brand-deals slab (the Slab "Deal Journeys" layout,
 * imported and fed by the Notion Brand Deals Hub instead of the
 * bdpilot daemon). Pure: every figure the slab shows is derived here from the
 * BrandDeal rows the connector already validated, so the component stays a
 * renderer and the numbers stay testable.
 *
 * Money rule: a deal is worth what was agreed, else its stated value, else
 * the brand's budget, else nothing. The suggested rate is our wish, not a
 * number the brand said, so it never counts.
 */

export type DealBucket = 'inbound' | 'talking' | 'producing' | 'billing' | 'paid' | 'declined' | 'paused' | 'other';

const BUCKET: Record<string, DealBucket> = {
  New: 'inbound',
  Negotiating: 'talking',
  Aligned: 'talking',
  Researching: 'producing',
  Filming: 'producing',
  Editing: 'producing',
  Delivered: 'producing',
  Invoiced: 'billing',
  Approved: 'billing',
  Paid: 'paid',
  Declined: 'declined',
  Paused: 'paused',
};

/** Notion lane to journey bucket. Unknown lanes are kept as `other` rather
 *  than dropped: hiding a deal is worse than an odd label. */
export function bucketOf(status: string): DealBucket {
  return BUCKET[status] ?? 'other';
}

export function dealUsd(d: BrandDeal): number {
  return d.amountAgreedUsd ?? d.dealValueUsd ?? d.budgetUsd ?? 0;
}

export function isOpen(d: BrandDeal): boolean {
  const b = bucketOf(d.status);
  return b !== 'paid' && b !== 'declined' && b !== 'paused';
}

export type Filter = 'all' | 'talks' | 'production' | 'paid' | 'declined' | 'tier-s';

export function matchesFilter(d: BrandDeal, f: Filter): boolean {
  const b = bucketOf(d.status);
  switch (f) {
    case 'all':
      return true;
    case 'talks':
      return b === 'inbound' || b === 'talking';
    case 'production':
      return b === 'producing' || b === 'billing';
    case 'paid':
      return b === 'paid';
    case 'declined':
      return b === 'declined' || b === 'paused';
    case 'tier-s':
      return (d.tier ?? '').trim().toUpperCase() === 'S';
  }
}

const SLASH: Record<string, Filter> = {
  '/talks': 'talks',
  '/production': 'production',
  '/paid': 'paid',
  '/declined': 'declined',
  '/s': 'tier-s',
  '/tier-s': 'tier-s',
};

/** A leading slash token is a filter; whatever follows is free text. An
 *  unknown token is echoed back (so the pill shows it) but filters nothing. */
export function parseQuery(q: string): { slash: string | null; token: Filter | null; text: string } {
  const t = q.trim();
  if (t.startsWith('/')) {
    const slash = t.split(/\s+/)[0];
    return { slash, token: SLASH[slash.toLowerCase()] ?? null, text: t.slice(slash.length).trim().toLowerCase() };
  }
  return { slash: null, token: null, text: t.toLowerCase() };
}

export function filterDeals(deals: BrandDeal[], opts: { filter: Filter; query: string }): BrandDeal[] {
  const { token, text } = parseQuery(opts.query);
  return deals.filter((d) => {
    if (!matchesFilter(d, opts.filter)) return false;
    if (token && !matchesFilter(d, token)) return false;
    if (text) {
      const hay = [d.brand, d.contactName, d.contactEmail, d.status, d.mainChannel, d.videoType, d.source, d.tier]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}

export type Volume = {
  openUsd: number;
  talksUsd: number;
  productionUsd: number;
  paidUsd: number;
  declinedUsd: number;
  quotedDeals: number;
  counts: { all: number; talks: number; production: number; paid: number; declined: number; tierS: number };
};

export function volume(deals: BrandDeal[]): Volume {
  const sum = (f: Filter) => deals.filter((d) => matchesFilter(d, f)).reduce((n, d) => n + dealUsd(d), 0);
  const count = (f: Filter) => deals.filter((d) => matchesFilter(d, f)).length;
  const talksUsd = sum('talks');
  const productionUsd = sum('production');
  return {
    openUsd: talksUsd + productionUsd,
    talksUsd,
    productionUsd,
    paidUsd: sum('paid'),
    declinedUsd: sum('declined'),
    quotedDeals: deals.filter((d) => dealUsd(d) > 0).length,
    counts: {
      all: deals.length,
      talks: count('talks'),
      production: count('production'),
      paid: count('paid'),
      declined: count('declined'),
      tierS: count('tier-s'),
    },
  };
}

export type FunnelStage = { label: string; value: number; usd: number; note: string; filter: Filter };

/** Four hero columns, each a working filter, each carrying its dollars. */
export function funnelStages(deals: BrandDeal[]): FunnelStage[] {
  const v = volume(deals);
  const declined = deals.filter((d) => bucketOf(d.status) === 'declined').length;
  const paused = deals.filter((d) => bucketOf(d.status) === 'paused').length;
  return [
    { label: 'All deals', value: v.counts.all, usd: deals.reduce((n, d) => n + dealUsd(d), 0), note: 'every deal in the hub', filter: 'all' },
    { label: 'In talks', value: v.counts.talks, usd: v.talksUsd, note: 'inbound and negotiating', filter: 'talks' },
    { label: 'In production', value: v.counts.production, usd: v.productionUsd, note: 'researching through invoiced', filter: 'production' },
    { label: 'Paid', value: v.counts.paid, usd: v.paidUsd, note: `${declined} declined · ${paused} paused`, filter: 'paid' },
  ];
}

const DAY = 86_400_000;
const utcDay = (t: number) => Math.floor(t / DAY) * DAY;
const label = (t: number) => {
  const d = new Date(t);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
};

/** Notion edits per day over the window, quiet days kept so the step line
 *  has real steps. Newest day last. */
export function activitySeries(deals: BrandDeal[], now: Date, days = 30): Array<{ label: string; count: number }> {
  const end = utcDay(now.getTime());
  const stamps = deals.map((d) => Date.parse(d.lastEdited)).filter((t) => !Number.isNaN(t)).map(utcDay);
  const out: Array<{ label: string; count: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const t = end - i * DAY;
    out.push({ label: label(t), count: stamps.filter((s) => s === t).length });
  }
  return out;
}

const SIZE_BUCKETS: Array<{ label: string; test: (usd: number) => boolean }> = [
  { label: '<1k', test: (n) => n < 1000 },
  { label: '1-3k', test: (n) => n >= 1000 && n < 3000 },
  { label: '3-5k', test: (n) => n >= 3000 && n < 5000 },
  { label: '5-10k', test: (n) => n >= 5000 && n < 10_000 },
  { label: '10k+', test: (n) => n >= 10_000 },
];

/** Deal-size distribution for the dot matrix; unpriced deals are not sized. */
export function sizeMatrix(deals: BrandDeal[]): Array<{ label: string; count: number }> {
  const priced = deals.map(dealUsd).filter((n) => n > 0);
  return SIZE_BUCKETS.map((b) => ({ label: b.label, count: priced.filter(b.test).length }));
}

/** What needs the operator this week: follow-ups due (overdue included) and
 *  deadlines inside the window, on open deals only, soonest first. */
export function dueSoon(deals: BrandDeal[], now: Date, days = 7): { followUps: BrandDeal[]; deadlines: BrandDeal[] } {
  const limit = now.getTime() + days * DAY;
  const due = (iso: string | null) => iso !== null && !Number.isNaN(Date.parse(iso)) && Date.parse(iso) <= limit;
  const byDate = (key: 'followUpDate' | 'deadline') => (a: BrandDeal, b: BrandDeal) => Date.parse(a[key]!) - Date.parse(b[key]!);
  const open = deals.filter(isOpen);
  return {
    followUps: open.filter((d) => due(d.followUpDate)).sort(byDate('followUpDate')),
    deadlines: open.filter((d) => due(d.deadline)).sort(byDate('deadline')),
  };
}

export function timeAgo(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((now.getTime() - then) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
