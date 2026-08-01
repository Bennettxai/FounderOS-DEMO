import { describe, expect, test } from 'vitest';
import { mapGhlOpportunities, type GhlPipeline, type GhlOpportunity } from '@/lib/funnel-ghl';
import { FunnelJourneySchema } from '@/lib/schemas';

const NOW = new Date('2026-07-02T12:00:00Z');

const PIPELINE: GhlPipeline = {
  id: 'pipe-1',
  name: 'LC Mentorship',
  stages: [
    { id: 's-new', name: 'New Lead', position: 0 },
    { id: 's-dm', name: 'DM Convo', position: 1 },
    { id: 's-vsl', name: 'Watched VSL', position: 2 },
    { id: 's-book', name: 'Call Booked', position: 3 },
    { id: 's-show', name: 'Showed Up', position: 4 },
  ],
};

const opp = (over: Partial<GhlOpportunity>): GhlOpportunity => ({
  id: 'opp-1',
  name: 'Kai Rivera',
  pipelineId: 'pipe-1',
  pipelineStageId: 's-new',
  status: 'open',
  monetaryValue: 0,
  createdAt: '2026-06-01T10:00:00.000Z',
  lastStatusChangeAt: '2026-06-28T10:00:00.000Z',
  ...over,
});

describe('mapGhlOpportunities', () => {
  test('maps stage position onto the canonical hubs by pipeline fraction', () => {
    const { journeys } = mapGhlOpportunities([PIPELINE], [
      opp({ id: 'o1', pipelineStageId: 's-new' }), // fraction 0
      opp({ id: 'o2', pipelineStageId: 's-dm' }), // 0.25
      opp({ id: 'o3', pipelineStageId: 's-vsl' }), // 0.5
      opp({ id: 'o4', pipelineStageId: 's-show' }), // 1
    ], NOW);
    const byId = Object.fromEntries(journeys.map((j) => [j.id, j.status]));
    expect(byId['ghl-o1']).toBe('first_touch');
    expect(byId['ghl-o2']).toBe('engaged');
    expect(byId['ghl-o3']).toBe('nurtured');
    expect(byId['ghl-o4']).toBe('opted_in');
  });

  test('produces valid journeys: LC venture, ghl source, stall-ready last-touch date', () => {
    const { journeys } = mapGhlOpportunities([PIPELINE], [opp({ id: 'o1', pipelineStageId: 's-dm' })], NOW);
    const j = FunnelJourneySchema.parse(journeys[0]);
    expect(j.venture).toBe('launchpad-cohort');
    expect(j.touches.every((t) => t.source === 'ghl')).toBe(true);
    expect(j.touches[0].at).toBe('2026-06-01'); // created
    expect(j.touches.at(-1)?.at).toBe('2026-06-28'); // last stage change → decay clock
  });

  test('carries the contact channel data and deep-links the GHL contact page', () => {
    const { journeys } = mapGhlOpportunities([PIPELINE], [
      opp({
        id: 'o1',
        contactId: 'CUeK123',
        contact: { name: 'Jordan Blake', email: 'jordan.blake@example.com', phone: '+15550100199' },
      }),
    ], NOW, 'loc_abc');
    const j = journeys[0];
    expect(j.email).toBe('jordan.blake@example.com');
    expect(j.phone).toBe('+15550100199');
    expect(j.url).toBe('https://app.gohighlevel.com/v2/location/loc_abc/contacts/detail/CUeK123');
  });

  test('won opportunities convert with their value; lost and abandoned are excluded but counted', () => {
    const { journeys, excluded } = mapGhlOpportunities([PIPELINE], [
      opp({ id: 'won', status: 'won', monetaryValue: 6800, pipelineStageId: 's-show' }),
      opp({ id: 'lost', status: 'lost' }),
      opp({ id: 'gone', status: 'abandoned' }),
    ], NOW);
    expect(journeys.map((j) => j.id)).toEqual(['ghl-won']);
    expect(journeys[0].status).toBe('converted');
    expect(journeys[0].amountUsd).toBe(6800);
    expect(excluded).toBe(2);
  });

  test('unknown pipeline or stage ids are skipped, never fatal', () => {
    const { journeys } = mapGhlOpportunities([PIPELINE], [
      opp({ id: 'ok' }),
      opp({ id: 'ghost-pipe', pipelineId: 'nope' }),
      opp({ id: 'ghost-stage', pipelineStageId: 'nope' }),
    ], NOW);
    expect(journeys.map((j) => j.id)).toEqual(['ghl-ok']);
  });

  test('nurture-named stages map to the nurtured hub regardless of pipeline position', () => {
    const pipeline: GhlPipeline = {
      id: 'pipe-1',
      name: 'Main Pipeline',
      stages: [
        { id: 's-a', name: 'Webinar Meetings' },
        { id: 's-b', name: '30 Minute - voice call' },
        { id: 's-n', name: 'Nurture 2 Weeks>' }, // late position, but semantically nurture
        { id: 's-z', name: 'Student Onboarded' },
      ],
    };
    const { journeys } = mapGhlOpportunities([pipeline], [
      opp({ id: 'o-n', pipelineId: 'pipe-1', pipelineStageId: 's-n' }),
    ], NOW);
    expect(journeys[0].status).toBe('nurtured');
  });

  test('likelihood grows with pipeline depth and money on the table', () => {
    const { journeys } = mapGhlOpportunities([PIPELINE], [
      opp({ id: 'shallow', pipelineStageId: 's-new' }),
      opp({ id: 'deep', pipelineStageId: 's-show', monetaryValue: 5000 }),
    ], NOW);
    const shallow = journeys.find((j) => j.id === 'ghl-shallow')!;
    const deep = journeys.find((j) => j.id === 'ghl-deep')!;
    expect(deep.likelihood).toBeGreaterThan(shallow.likelihood);
    expect(shallow.likelihood).toBeGreaterThanOrEqual(0);
    expect(deep.likelihood).toBeLessThanOrEqual(100);
  });
});
