/**
 * Live funnel provider — Alex's real Attio pipeline mapped into the same
 * FunnelJourney shape the seeded funnel uses, so /funnel swaps sources at the
 * repo level exactly as designed. Honest by construction: returns null when
 * the key is missing or Attio is unreachable (the page falls back to seed and
 * says so), Closed Lost is excluded but counted, unknown stages are skipped.
 *
 * ICP fit is a transparent heuristic over the qualification fields Alex
 * actually fills in Attio (budget / pain points / timeline / description /
 * deal value) — it drives node size AND how tightly a lead orbits its hub.
 * Swap it for a real ICP model whenever he defines one.
 */
import { resolveAttioKey } from '@/lib/creds';
import { FUNNEL_STAGES } from '@/lib/funnel';
import {
  FunnelJourneySchema,
  type FunnelJourney,
  type FunnelStage,
  type FunnelTouch,
} from '@/lib/schemas';

/** The slice of Attio's /records/query deal shape we read. */
export type AttioDeal = {
  id: { record_id: string };
  created_at: string;
  web_url?: string;
  values: {
    name?: { value?: string }[];
    stage?: { status?: { title?: string }; active_from?: string }[];
    value?: { currency_value?: number }[];
    budget_range?: unknown[];
    pain_points?: unknown[];
    timeline?: unknown[];
    timeline_2?: unknown[];
    project_description?: unknown[];
    associated_people?: { target_record_id?: string }[];
    associated_company?: { target_record_id?: string }[];
  };
};

/** The person behind a deal, joined from the people/companies objects. */
export type AttioPersonSlice = {
  person: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  linkedin: string | null;
};

export type AttioContacts = {
  people: Map<string, AttioPersonSlice>;
  companies: Map<string, string>;
};

/** Alex's 10 Attio stages → the 5 canonical hubs. Closed Lost leaves the funnel. */
export const ATTIO_STAGE_MAP: Record<string, FunnelStage> = {
  'New Lead': 'first_touch',
  Contacted: 'engaged',
  Nurture: 'nurtured',
  Discovery: 'opted_in',
  'Technical Scoping': 'opted_in',
  'Generating Proposal': 'opted_in',
  'Proposal Sent': 'opted_in',
  Onboarding: 'converted',
  'Closed Won': 'converted',
};

/**
 * Venture heuristic for live deals (they carry no venture attribute yet):
 * company-flavored names read as Vantage client builds, bare person names as
 * Launchpad Cohort mentorship leads. Legible and wrong-at-the-edges by
 * design — add a venture attribute in Attio for the exact split.
 */
const COMPANY_HINTS =
  /\b(llc|inc|ltd|co|corp|company|solutions?|group|agency|tech|labs?|media|studio|consult\w*|clinic|dental|legal|law|realty|roofing|fitness|accounting|capital|ventures?|partners?|systems?|services?)\b|&/i;

export function classifyVenture(dealName: string): 'vantage' | 'launchpad-cohort' {
  return COMPANY_HINTS.test(dealName) ? 'vantage' : 'launchpad-cohort';
}

/**
 * Likelihood-to-buy relative to ICP, 20–100. Deliberately simple and legible:
 * each qualification field Alex filled is evidence of fit.
 */
export function icpScore(deal: AttioDeal): number {
  const has = (arr?: unknown[]) => Array.isArray(arr) && arr.length > 0;
  const v = deal.values;
  let score = 20;
  if (has(v.budget_range)) score += 20;
  if (has(v.pain_points)) score += 20;
  if (has(v.timeline) || has(v.timeline_2)) score += 15;
  if (has(v.project_description)) score += 10;
  if ((v.value?.[0]?.currency_value ?? 0) > 0) score += 15;
  return Math.min(100, score);
}

const day = (iso: string | undefined, fallback: string): string => (iso ?? fallback).slice(0, 10);

/** Pure mapper: raw Attio deals → validated journeys + honest exclusion counts.
 * `contacts` (when the join ran) fills who the lead actually is. */
export function mapAttioDeals(
  deals: AttioDeal[],
  now: Date,
  contacts?: AttioContacts,
): { journeys: FunnelJourney[]; closedLost: number; total: number } {
  let closedLost = 0;
  const journeys: FunnelJourney[] = [];

  for (const deal of deals) {
    const title = deal.values.stage?.[0]?.status?.title ?? '';
    if (title === 'Closed Lost') {
      closedLost++;
      continue;
    }
    const canonical = ATTIO_STAGE_MAP[title];
    if (!canonical) continue; // future/renamed stages must never crash the space

    const id = `attio-${deal.id.record_id}`;
    const name = deal.values.name?.[0]?.value ?? 'Unnamed deal';
    const createdAt = day(deal.created_at, '1970-01-01');
    const stageSince = day(deal.values.stage?.[0]?.active_from, deal.created_at);
    const hubIdx = FUNNEL_STAGES.findIndex((s) => s.id === canonical);
    const score = icpScore(deal);
    const amount = deal.values.value?.[0]?.currency_value ?? 0;
    const converted = canonical === 'converted';

    // Synthesize the transit: one touch per hub travelled, created_at at the
    // start, the real stage-entry date at the end (journeyMeta reads the last
    // touch, so stall = quiet time in the CURRENT Attio stage).
    const touches: FunnelTouch[] = FUNNEL_STAGES.slice(0, hubIdx + 1).map((s, i) => ({
      id: `${id}-t${i + 1}`,
      contactId: id,
      seq: i + 1,
      stage: s.id,
      channel: i === hubIdx && converted ? 'checkout' : 'crm',
      label:
        i === 0
          ? 'Deal created in Attio'
          : i === hubIdx
            ? `Attio stage: ${title}`
            : `Progressed to ${s.label}`,
      source: 'attio' as const,
      at: i === hubIdx ? stageSince : createdAt,
    }));

    const personRef = deal.values.associated_people?.[0]?.target_record_id;
    const companyRef = deal.values.associated_company?.[0]?.target_record_id;
    const who = (personRef && contacts?.people.get(personRef)) || null;
    const companyName = (companyRef && contacts?.companies.get(companyRef)) || null;

    try {
      journeys.push(
        FunnelJourneySchema.parse({
          id,
          name,
          venture: classifyVenture(name),
          status: canonical,
          product: converted ? title : null,
          amountUsd: amount > 0 ? amount : converted ? 0 : null,
          relationship: score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold',
          likelihood: score,
          url: deal.web_url ?? null,
          email: who?.email ?? null,
          phone: who?.phone ?? null,
          person: who?.person ?? null,
          company: companyName,
          role: who?.role ?? null,
          linkedin: who?.linkedin ?? null,
          createdAt,
          touches,
        }),
      );
    } catch {
      // a malformed row is skipped, never fatal
    }
  }

  // Freshest movement first — same ordering feel as the seeded funnel.
  journeys.sort((a, b) => (b.touches.at(-1)?.at ?? '').localeCompare(a.touches.at(-1)?.at ?? ''));
  void now;
  return { journeys, closedLost, total: deals.length };
}

/** Raw slices of the people/companies query responses (only what we read). */
type AttioPersonRecord = {
  id: { record_id: string };
  values: {
    name?: { full_name?: string }[];
    email_addresses?: { email_address?: string }[];
    phone_numbers?: { phone_number?: string }[];
    job_title?: { value?: string }[];
    linkedin?: { value?: string }[];
  };
};
type AttioCompanyRecord = { id: { record_id: string }; values: { name?: { value?: string }[] } };

async function queryByIds<T extends { id: { record_id: string } }>(
  object: 'people' | 'companies',
  ids: string[],
  key: string,
): Promise<T[]> {
  const out: T[] = [];
  // record_id $in is verified live — Attio 400s ("too many constraint
  // values") past 100 ids per filter, so chunk exactly there
  for (let i = 0; i < ids.length; i += 100) {
    const res = await fetch(`https://api.attio.com/v2/objects/${object}/records/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: { record_id: { $in: ids.slice(i, i + 100) } }, limit: 500 }),
      cache: 'no-store',
    });
    if (!res.ok) return out; // partial join beats no join — stay honest, never throw
    const body = (await res.json()) as { data?: T[] };
    out.push(...(body.data ?? []));
  }
  return out;
}

/**
 * Join the humans onto the pipeline: batch-fetch every person/company the
 * deals reference (2 requests per 200 ids). Null on any failure — the mapper
 * then renders deals without contact info rather than guessing.
 */
export async function fetchAttioContacts(deals: AttioDeal[], key: string): Promise<AttioContacts | null> {
  try {
    const personIds = [...new Set(deals.map((d) => d.values.associated_people?.[0]?.target_record_id).filter((x): x is string => !!x))];
    const companyIds = [...new Set(deals.map((d) => d.values.associated_company?.[0]?.target_record_id).filter((x): x is string => !!x))];
    const [people, companies] = await Promise.all([
      queryByIds<AttioPersonRecord>('people', personIds, key),
      queryByIds<AttioCompanyRecord>('companies', companyIds, key),
    ]);
    return {
      people: new Map(
        people.map((p) => [
          p.id.record_id,
          {
            person: p.values.name?.[0]?.full_name ?? null,
            email: p.values.email_addresses?.[0]?.email_address ?? null,
            phone: p.values.phone_numbers?.[0]?.phone_number ?? null,
            role: p.values.job_title?.[0]?.value ?? null,
            linkedin: p.values.linkedin?.[0]?.value ?? null,
          },
        ]),
      ),
      companies: new Map(companies.map((c) => [c.id.record_id, c.values.name?.[0]?.value ?? ''])),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch the live pipeline. Null = not available (no key / API error) — the
 * caller falls back to the seeded funnel and labels the page accordingly.
 */
export async function attioFunnelJourneys(
  now = new Date(),
): Promise<{ journeys: FunnelJourney[]; closedLost: number; total: number } | null> {
  // FUNNEL_PROVIDER=seed pins the seeded funnel (tests, offline demos).
  if ((process.env.FUNNEL_PROVIDER ?? 'attio') !== 'attio') return null;
  const key = resolveAttioKey();
  if (!key) return null;
  try {
    const deals: AttioDeal[] = [];
    for (let offset = 0; offset < 2000; offset += 500) {
      const res = await fetch('https://api.attio.com/v2/objects/deals/records/query', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 500, offset }),
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: AttioDeal[] };
      const page = body.data ?? [];
      deals.push(...page);
      if (page.length < 500) break;
    }
    const contacts = await fetchAttioContacts(deals, key);
    return mapAttioDeals(deals, now, contacts ?? undefined);
  } catch {
    return null;
  }
}
