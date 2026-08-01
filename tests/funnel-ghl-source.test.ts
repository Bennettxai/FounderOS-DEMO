import { describe, expect, test } from 'vitest';
import { mapGhlOpportunities, type GhlPipeline, type GhlOpportunity } from '@/lib/funnel-ghl';
import { acquisitionFor } from '@/lib/funnel-radial';

const NOW = new Date('2026-07-04T12:00:00Z');

const PIPELINE: GhlPipeline = {
  id: 'pipe-1',
  name: 'LC Mentorship',
  stages: [
    { id: 's-new', name: 'New Lead', position: 0 },
    { id: 's-dm', name: 'DM Convo', position: 1 },
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

describe('GHL source attribution reaches the radial classifier', () => {
  test('threads the opportunity source into the entry-touch label', () => {
    const { journeys } = mapGhlOpportunities([PIPELINE], [opp({ source: 'Instagram DM' })], NOW);
    expect(journeys[0].touches[0].label).toBe('Opportunity created in GHL · via: Instagram DM');
    expect(acquisitionFor(journeys[0])).toBe('instagram');
  });

  test('no source → plain label → honest word_of_mouth', () => {
    const { journeys } = mapGhlOpportunities([PIPELINE], [opp({})], NOW);
    expect(journeys[0].touches[0].label).toBe('Opportunity created in GHL');
    expect(acquisitionFor(journeys[0])).toBe('word_of_mouth');
  });

  test('attribution mediums join the label; the LC opt-in form classifies as form', () => {
    const { journeys } = mapGhlOpportunities(
      [PIPELINE],
      [opp({ source: 'LC - Opt In', attributions: [{ medium: 'form' }, { medium: 'form' }] })],
      NOW,
    );
    expect(journeys[0].touches[0].label).toBe('Opportunity created in GHL · via: LC - Opt In, form');
    expect(acquisitionFor(journeys[0])).toBe('form');
  });

  test('unattributable mediums (csv import, zapier) and timestamp garbage stay word_of_mouth', () => {
    const { journeys } = mapGhlOpportunities(
      [PIPELINE],
      [
        opp({ id: 'o-csv', attributions: [{ medium: 'csv_import' }] }),
        opp({ id: 'o-zap', attributions: [{ medium: 'zapier' }] }),
        opp({ id: 'o-ts', source: '2026-02-06T13:18:53-06:00' }),
      ],
      NOW,
    );
    for (const j of journeys) expect(acquisitionFor(j)).toBe('word_of_mouth');
    const ts = journeys.find((j) => j.id === 'ghl-o-ts');
    expect(ts?.touches[0].label).toBe('Opportunity created in GHL'); // garbage filtered out
  });

  test('a utmSource beats a generic medium for attribution', () => {
    const { journeys } = mapGhlOpportunities(
      [PIPELINE],
      [opp({ attributions: [{ utmSource: 'youtube', medium: 'form' }] })],
      NOW,
    );
    expect(acquisitionFor(journeys[0])).toBe('youtube');
  });
});
