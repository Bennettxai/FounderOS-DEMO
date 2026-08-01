import { describe, expect, test } from 'vitest';
import { mergeTrakyoTouches, trakyoTouches, type TrakyoEvent } from '@/lib/funnel-trakyo';
import type { FunnelJourney } from '@/lib/schemas';

const journey = (id: string, name: string): FunnelJourney => ({
  id,
  name,
  venture: 'launchpad-cohort',
  status: 'engaged',
  product: null,
  amountUsd: null,
  relationship: 'warm',
  likelihood: 50,
  url: null,
  email: null,
  phone: null,
  person: null,
  company: null,
  role: null,
  linkedin: null,
  createdAt: '2026-06-01',
  touches: [
    {
      id: `${id}-t1`, contactId: id, seq: 1, stage: 'first_touch',
      channel: 'crm', label: 'Deal created in Attio', source: 'attio', at: '2026-06-01',
    },
    {
      id: `${id}-t2`, contactId: id, seq: 2, stage: 'engaged',
      channel: 'crm', label: 'Attio stage: Contacted', source: 'attio', at: '2026-06-10',
    },
  ],
});

describe('mergeTrakyoTouches', () => {
  test('swaps the synthetic first touch for the real attributed content touch', () => {
    const events: TrakyoEvent[] = [
      { lead: 'Reese Calder', label: 'IG reel: "3 AI offers that close themselves"', channel: 'organic', at: '2026-05-28' },
    ];
    const [merged] = mergeTrakyoTouches([journey('j1', 'Reese Calder')], events);
    expect(merged.touches[0].source).toBe('trakyo');
    expect(merged.touches[0].channel).toBe('organic');
    expect(merged.touches[0].label).toContain('IG reel');
    expect(merged.touches[0].at).toBe('2026-05-28');
    // the rest of the journey is untouched
    expect(merged.touches[1].source).toBe('attio');
  });

  test('matching is name-normalized (case + spacing)', () => {
    const events: TrakyoEvent[] = [{ lead: '  reese CALDER ', label: 'YT long-form', channel: 'organic', at: '2026-05-20' }];
    const [merged] = mergeTrakyoTouches([journey('j1', 'Reese Calder')], events);
    expect(merged.touches[0].source).toBe('trakyo');
  });

  test('journeys without an attributed event pass through unchanged', () => {
    const original = journey('j2', 'Someone Else');
    const [merged] = mergeTrakyoTouches([original], [
      { lead: 'Reese Calder', label: 'x', channel: 'organic', at: '2026-05-28' },
    ]);
    expect(merged).toEqual(original);
  });
});

describe('trakyoTouches', () => {
  test('returns an honest empty set until Trakyo ships an API', async () => {
    expect(await trakyoTouches()).toEqual([]);
  });
});
