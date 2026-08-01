import { describe, expect, test } from 'vitest';
import { mapAttioDeals, icpScore, classifyVenture, ATTIO_STAGE_MAP, type AttioDeal } from '@/lib/funnel-live';
import { FunnelJourneySchema } from '@/lib/schemas';

const NOW = new Date('2026-07-02T12:00:00Z');

/** Minimal raw deal in Attio's /records/query shape (only fields we read). */
const rawDeal = (over: {
  id?: string;
  name?: string;
  stage?: string;
  stageSince?: string;
  createdAt?: string;
  value?: number;
  budget?: string | null;
  pain?: string | null;
  timeline?: string | null;
  description?: string | null;
}): AttioDeal => ({
  id: { record_id: over.id ?? 'rec-1' },
  created_at: over.createdAt ?? '2026-04-09T01:23:52.868Z',
  web_url: `https://app.attio.com/vantage/deals/record/${over.id ?? 'rec-1'}`,
  values: {
    name: [{ value: over.name ?? 'Reese Calder' }],
    stage: [{ status: { title: over.stage ?? 'Contacted' }, active_from: over.stageSince ?? '2026-06-05T00:00:00Z' }],
    value: [{ currency_value: over.value ?? 0 }],
    budget_range: over.budget ? [{ value: over.budget }] : [],
    pain_points: over.pain ? [{ value: over.pain }] : [],
    timeline: over.timeline ? [{ value: over.timeline }] : [],
    project_description: over.description ? [{ value: over.description }] : [],
  },
});

describe('icpScore', () => {
  test('bare lead scores the base; fully qualified lead with value caps at 100', () => {
    const bare = icpScore(rawDeal({}));
    expect(bare).toBe(20);
    const full = icpScore(
      rawDeal({ budget: '10-20k', pain: 'manual intake', timeline: 'Q3', description: 'AI intake build', value: 12000 }),
    );
    expect(full).toBe(100);
  });

  test('partial qualification lands between the tiers', () => {
    const some = icpScore(rawDeal({ budget: '5k', pain: 'no-shows' }));
    expect(some).toBe(60); // 20 + 20 + 20
  });
});

describe('mapAttioDeals', () => {
  test('maps every pipeline stage onto a canonical hub', () => {
    expect(ATTIO_STAGE_MAP['New Lead']).toBe('first_touch');
    expect(ATTIO_STAGE_MAP['Contacted']).toBe('engaged');
    expect(ATTIO_STAGE_MAP['Nurture']).toBe('nurtured');
    expect(ATTIO_STAGE_MAP['Discovery']).toBe('opted_in');
    expect(ATTIO_STAGE_MAP['Technical Scoping']).toBe('opted_in');
    expect(ATTIO_STAGE_MAP['Generating Proposal']).toBe('opted_in');
    expect(ATTIO_STAGE_MAP['Proposal Sent']).toBe('opted_in');
    expect(ATTIO_STAGE_MAP['Onboarding']).toBe('converted');
    expect(ATTIO_STAGE_MAP['Closed Won']).toBe('converted');
  });

  test('maps a deal to a valid journey: touches carry created + stage-since dates', () => {
    const { journeys } = mapAttioDeals([
      rawDeal({ id: 'rec-a', name: 'Reese Calder', stage: 'Contacted', createdAt: '2026-04-09T01:23:52Z', stageSince: '2026-06-05T09:00:00Z' }),
    ], NOW);
    expect(journeys).toHaveLength(1);
    const j = FunnelJourneySchema.parse(journeys[0]);
    expect(j.status).toBe('engaged');
    expect(j.touches[0].stage).toBe('first_touch');
    expect(j.touches[0].at).toBe('2026-04-09');
    expect(j.touches.at(-1)?.stage).toBe('engaged');
    expect(j.touches.at(-1)?.at).toBe('2026-06-05'); // journeyMeta stall reads this
    expect(j.touches.every((t) => t.source === 'attio')).toBe(true);
    expect(j.url).toContain('app.attio.com');
  });

  test('a won deal converts with its value; relationship tiers follow the score', () => {
    const { journeys } = mapAttioDeals([
      rawDeal({ id: 'rec-w', name: 'Big Win', stage: 'Closed Won', value: 15000, budget: 'x', pain: 'x', timeline: 'x', description: 'x' }),
      rawDeal({ id: 'rec-c', name: 'Bare Lead', stage: 'New Lead' }),
    ], NOW);
    const won = journeys.find((j) => j.id === 'attio-rec-w');
    expect(won?.status).toBe('converted');
    expect(won?.amountUsd).toBe(15000);
    expect(won?.relationship).toBe('hot'); // score 100
    const bare = journeys.find((j) => j.id === 'attio-rec-c');
    expect(bare?.relationship).toBe('cold'); // score 20
  });

  test('Closed Lost deals are excluded and counted honestly', () => {
    const { journeys, closedLost } = mapAttioDeals([
      rawDeal({ id: 'rec-l', stage: 'Closed Lost' }),
      rawDeal({ id: 'rec-k', stage: 'Contacted' }),
    ], NOW);
    expect(journeys.map((j) => j.id)).toEqual(['attio-rec-k']);
    expect(closedLost).toBe(1);
  });

  test('unknown stages are skipped rather than crashing the space', () => {
    const { journeys } = mapAttioDeals([rawDeal({ id: 'rec-x', stage: 'Some Future Stage' })], NOW);
    expect(journeys).toEqual([]);
  });
});

describe('classifyVenture', () => {
  test('person-name deals read as Launchpad Cohort mentorship leads', () => {
    expect(classifyVenture('Reese Calder')).toBe('launchpad-cohort');
    expect(classifyVenture('Tayla Nguyen')).toBe('launchpad-cohort');
    expect(classifyVenture('NAYL AHMADULIN')).toBe('launchpad-cohort');
  });

  test('company-flavored deals read as Vantage client builds', () => {
    expect(classifyVenture('Orbit Labs')).toBe('vantage');
    expect(classifyVenture('Harbor Dental')).toBe('vantage');
    expect(classifyVenture('Lin & Co Accounting')).toBe('vantage');
    expect(classifyVenture('Fields Roofing LLC')).toBe('vantage');
  });

  test('mapAttioDeals stamps the heuristic venture on every journey', () => {
    const { journeys } = mapAttioDeals([
      rawDeal({ id: 'rec-p', name: 'Reese Calder', stage: 'Contacted' }),
      rawDeal({ id: 'rec-c', name: 'Orbit Labs', stage: 'Contacted' }),
    ], NOW);
    expect(journeys.find((j) => j.id === 'attio-rec-p')?.venture).toBe('launchpad-cohort');
    expect(journeys.find((j) => j.id === 'attio-rec-c')?.venture).toBe('vantage');
  });
});

describe('Attio contact join — the person behind the deal (AC52)', () => {
  const dealWithRefs = (): AttioDeal => ({
    ...rawDeal({ id: 'rec-9', name: 'Calder Holdings automation' }),
    values: {
      ...rawDeal({ id: 'rec-9' }).values,
      associated_people: [{ target_record_id: 'person-1' }],
      associated_company: [{ target_record_id: 'company-1' }],
    },
  });
  const contacts = {
    people: new Map([
      [
        'person-1',
        {
          person: 'Reese Calder',
          email: 'reese@example.com',
          phone: '+15550100442',
          role: 'Executive leadership (C-level)',
          linkedin: 'https://linkedin.com/in/reesecalder-example',
        },
      ],
    ]),
    companies: new Map([['company-1', 'Calder Holdings LLC']]),
  };

  test('joined contacts fill person, email, phone, role, company, linkedin', () => {
    const { journeys } = mapAttioDeals([dealWithRefs()], NOW, contacts);
    expect(journeys).toHaveLength(1);
    const j = journeys[0];
    expect(j.person).toBe('Reese Calder');
    expect(j.email).toBe('reese@example.com');
    expect(j.phone).toBe('+15550100442');
    expect(j.role).toBe('Executive leadership (C-level)');
    expect(j.company).toBe('Calder Holdings LLC');
    expect(j.linkedin).toBe('https://linkedin.com/in/reesecalder-example');
    expect(FunnelJourneySchema.parse(j)).toBeTruthy();
  });

  test('a deal whose refs are missing from the index stays honestly null', () => {
    const orphan: AttioDeal = {
      ...rawDeal({ id: 'rec-10' }),
      values: { ...rawDeal({ id: 'rec-10' }).values, associated_people: [{ target_record_id: 'nobody' }] },
    };
    const { journeys } = mapAttioDeals([orphan], NOW, contacts);
    expect(journeys[0].person).toBeNull();
    expect(journeys[0].email).toBeNull();
    expect(journeys[0].company).toBeNull();
  });

  test('calling without contacts keeps the pre-join behavior (back-compat)', () => {
    const { journeys } = mapAttioDeals([dealWithRefs()], NOW);
    expect(journeys[0].person).toBeNull();
    expect(journeys[0].email).toBeNull();
  });
});
