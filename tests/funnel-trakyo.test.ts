import { afterEach, describe, expect, test } from 'vitest';
import {
  mapTrakyoLeads,
  mergeTrakyoTouches,
  trakyoAcquisition,
  trakyoTouches,
  type TrakyoEvent,
} from '@/lib/funnel-trakyo';
import type { FunnelJourney } from '@/lib/schemas';

/** Event shorthand — identity lists default from the lead, source defaults to
 *  an unclassifiable custom link. */
const event = (e: Partial<TrakyoEvent> & Pick<TrakyoEvent, 'lead' | 'label' | 'at'>): TrakyoEvent => ({
  channel: 'organic',
  names: [e.lead],
  emails: [],
  sourceType: 'custom',
  sourceName: null,
  ...e,
});

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
    const events = [event({ lead: 'Riley Monroe', label: 'IG reel: "3 AI offers that close themselves"', at: '2026-05-28' })];
    const [merged] = mergeTrakyoTouches([journey('j1', 'Riley Monroe')], events);
    expect(merged.touches[0].source).toBe('trakyo');
    expect(merged.touches[0].channel).toBe('organic');
    expect(merged.touches[0].label).toContain('IG reel');
    expect(merged.touches[0].at).toBe('2026-05-28');
    // the rest of the journey is untouched
    expect(merged.touches[1].source).toBe('attio');
  });

  test('matching is name-normalized (case + spacing)', () => {
    const events = [event({ lead: '  Riley Monroe ', names: ['  Riley Monroe '], label: 'YT long-form', at: '2026-05-20' })];
    const [merged] = mergeTrakyoTouches([journey('j1', 'Riley Monroe')], events);
    expect(merged.touches[0].source).toBe('trakyo');
  });

  test('matches by email when Trakyo and the CRM disagree on the name', () => {
    const j = { ...journey('j1', 'Riley Monroe — Vantage build'), email: 'drew@example.com' };
    const events = [event({ lead: 'D. monroe', label: 'YT long-form', at: '2026-05-20', emails: ['DREW@example.com'] })];
    const [merged] = mergeTrakyoTouches([j], events);
    expect(merged.touches[0].source).toBe('trakyo');
  });

  test("stamps the wedge Trakyo attributed — the touch carries `acquisition`, not a keyword guess", () => {
    const events = [event({ lead: 'Riley Monroe', label: 'How the operator console works', at: '2026-05-28', sourceType: 'youtube', sourceName: 'YouTube' })];
    const [merged] = mergeTrakyoTouches([journey('j1', 'Riley Monroe')], events);
    expect(merged.touches[0].acquisition).toBe('youtube');
    // untouched CRM touches carry no acquisition stamp
    expect(merged.touches[1].acquisition).toBeUndefined();
  });

  test('journeys without an attributed event pass through unchanged', () => {
    const original = journey('j2', 'Someone Else');
    const [merged] = mergeTrakyoTouches([original], [event({ lead: 'Riley Monroe', label: 'x', at: '2026-05-28' })]);
    expect(merged).toEqual(original);
  });
});

describe('trakyoAcquisition — the wedge a Trakyo first touch justifies', () => {
  test('structural types map directly: youtube stays youtube, meta_ad is the IG/FB machine', () => {
    expect(trakyoAcquisition(event({ lead: 'x', label: 'anything at all', at: '2026-05-01', sourceType: 'youtube' }))).toBe('youtube');
    expect(trakyoAcquisition(event({ lead: 'x', label: 'anything at all', at: '2026-05-01', sourceType: 'meta_ad' }))).toBe('instagram');
  });

  test('custom sources classify on the source name first, then the content label', () => {
    expect(trakyoAcquisition(event({ lead: 'x', label: 'June 16th Webinar', at: '2026-05-01', sourceName: 'Instagram' }))).toBe('instagram');
    expect(trakyoAcquisition(event({ lead: 'x', label: 'FounderOS launch', at: '2026-05-01', sourceName: 'thefounderos-waitlist-launch' }))).toBe('form');
  });

  test('referrer traffic falls to the platform keyword or honestly to word of mouth', () => {
    expect(trakyoAcquisition(event({ lead: 'x', label: 'instagram.com', at: '2026-05-01', sourceType: 'referrer' }))).toBe('instagram');
    expect(trakyoAcquisition(event({ lead: 'x', label: 'June 16th - the operator', at: '2026-05-01', sourceType: 'custom', sourceName: 'June 16th - the operator' }))).toBe('word_of_mouth');
  });
});

/** Mirrors GET /v1/leads. Names, emails and content are invented: real lead PII
 *  never belongs in a fixture (this repo syncs to a public demo). */
const LEADS = {
  object: 'list',
  data: [
    {
      object: 'lead',
      id: 'lead_1',
      identifiers: { names: ['Ada Example'], emails: ['ada@example.com'], phones: [] },
      first_touch: {
        type: 'youtube',
        name: 'YouTube',
        source_name: 'YouTube',
        content_item: { name: 'How the operator console works' },
        occurred_at: '2026-07-14T10:12:00+00:00',
      },
    },
    {
      object: 'lead',
      id: 'lead_2',
      identifiers: { names: [], emails: ['no-name@example.com'], phones: [] },
      first_touch: {
        type: 'referrer',
        name: 'instagram.com',
        source_name: null,
        content_item: null,
        occurred_at: '2026-07-02T08:00:00+00:00',
      },
    },
    {
      object: 'lead',
      id: 'lead_3',
      identifiers: { names: ['No Attribution'], emails: [], phones: [] },
      first_touch: null,
    },
    {
      object: 'lead',
      id: 'lead_4',
      identifiers: { names: ['Paid Person'], emails: ['paid@example.com'], phones: [] },
      first_touch: {
        type: 'meta_ad',
        name: 'Meta Ads',
        source_name: 'Meta Ads',
        content_item: { name: 'Cold traffic: stop selling hours' },
        occurred_at: '2026-07-20T09:00:00+00:00',
      },
    },
  ],
};

describe('mapTrakyoLeads', () => {
  test('turns an attributed lead into a first-touch event carrying its real source', () => {
    const [first] = mapTrakyoLeads(LEADS);
    expect(first).toEqual({
      lead: 'Ada Example',
      names: ['Ada Example'],
      emails: ['ada@example.com'],
      label: 'How the operator console works',
      channel: 'organic',
      at: '2026-07-14',
      sourceType: 'youtube',
      sourceName: 'YouTube',
    });
  });

  test('meta_ad first touches are honestly ads, not organic — the payload carries provenance now', () => {
    const paid = mapTrakyoLeads(LEADS).find((e) => e.lead === 'Paid Person');
    expect(paid?.channel).toBe('ads');
    expect(paid?.sourceType).toBe('meta_ad');
  });

  test('falls back to the touch name when the lead has no content item', () => {
    const byLead = new Map(mapTrakyoLeads(LEADS).map((e) => [e.lead, e]));
    expect(byLead.get('no-name@example.com')?.label).toBe('instagram.com');
  });

  test('falls back to the email when Trakyo captured no name', () => {
    expect(mapTrakyoLeads(LEADS).some((e) => e.lead === 'no-name@example.com')).toBe(true);
  });

  test('skips leads with no first touch — nothing to attribute', () => {
    expect(mapTrakyoLeads(LEADS).some((e) => e.lead === 'No Attribution')).toBe(false);
    expect(mapTrakyoLeads(LEADS)).toHaveLength(3);
  });

  test('timestamps are narrowed to the calendar date the touch happened', () => {
    expect(mapTrakyoLeads(LEADS).every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.at))).toBe(true);
  });

  test('malformed payloads yield nothing rather than throwing', () => {
    expect(mapTrakyoLeads(null)).toEqual([]);
    expect(mapTrakyoLeads({ data: 'nope' })).toEqual([]);
    expect(mapTrakyoLeads({ data: [{ id: 'x' }, null] })).toEqual([]);
  });
});

describe('trakyoTouches', () => {
  const TK = 'TRAKYO_API_KEY';
  const prev = process.env[TK];
  afterEach(() => {
    if (prev === undefined) delete process.env[TK];
    else process.env[TK] = prev;
  });

  test('returns nothing, and makes no network call, without a key', async () => {
    delete process.env[TK];
    let called = false;
    const events = await trakyoTouches((async () => {
      called = true;
      return new Response('{}');
    }) as unknown as typeof fetch);
    expect(events).toEqual([]);
    expect(called).toBe(false);
  });

  test('pulls live leads and maps them to attributed touches', async () => {
    process.env[TK] = 'tky_test_key';
    const events = await trakyoTouches((async () =>
      new Response(JSON.stringify(LEADS))) as unknown as typeof fetch);
    expect(events).toHaveLength(3);
    expect(events[0].lead).toBe('Ada Example');
    expect(events[0].channel).toBe('organic');
  });

  test('an API failure degrades to empty, never throws into the funnel', async () => {
    process.env[TK] = 'tky_test_key';
    const events = await trakyoTouches((async () =>
      new Response('nope', { status: 500 })) as unknown as typeof fetch);
    expect(events).toEqual([]);
  });
});
