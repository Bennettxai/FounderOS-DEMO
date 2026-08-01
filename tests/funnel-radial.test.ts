import { describe, expect, test } from 'vitest';
import { ACQUISITIONS, acquisitionFor, funnelRadialModel, originOf } from '@/lib/funnel-radial';
import type { FunnelContact, FunnelJourney, FunnelTouch } from '@/lib/schemas';

const touch = (over: Partial<FunnelTouch> = {}): FunnelTouch => ({
  id: 'ft-test',
  contactId: 'fc-test',
  seq: 1,
  stage: 'first_touch',
  channel: 'organic',
  label: 'IG reel: agency systems',
  source: 'trakyo',
  at: '2026-06-01',
  ...over,
});

const journey = (over: Partial<FunnelContact> = {}, touches: FunnelTouch[] = [touch()]): FunnelJourney => ({
  id: 'fc-test',
  name: 'Test Client',
  venture: 'vantage',
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
  touches,
  ...over,
});

const firstTouch = (label: string, channel: FunnelTouch['channel'] = 'organic') =>
  journey({}, [touch({ label, channel })]);

describe('ACQUISITIONS — the rim segments', () => {
  test('exactly six, in canonical order (X and LinkedIn share one wedge), each labelled', () => {
    expect(ACQUISITIONS.map((a) => a.id)).toEqual([
      'instagram',
      'youtube',
      'newsletter',
      'x_linkedin',
      'form',
      'word_of_mouth',
    ]);
    for (const a of ACQUISITIONS) expect(a.label.length).toBeGreaterThan(0);
  });
});

describe('acquisitionFor — keyword classification of the entry touch', () => {
  test('instagram family: IG, TikTok short-form, Meta ads, ManyChat', () => {
    expect(acquisitionFor(firstTouch('IG reel: "3 AI offers that close themselves"'))).toBe('instagram');
    expect(acquisitionFor(firstTouch('TikTok: "day in the life running an AI agency"'))).toBe('instagram');
    expect(acquisitionFor(firstTouch('Meta ad: "stop selling hours" (cold traffic)', 'ads'))).toBe('instagram');
    expect(acquisitionFor(firstTouch('ManyChat keyword "SCALE" → DM flow', 'dm'))).toBe('instagram');
  });

  test('youtube wins over the form keyword inside "long-form"', () => {
    expect(acquisitionFor(firstTouch('YT long-form: "how I\'d start an agency in 2026"'))).toBe('youtube');
    expect(acquisitionFor(firstTouch('YouTube short: automation demo'))).toBe('youtube');
  });

  test('newsletter', () => {
    expect(acquisitionFor(firstTouch('Newsletter welcome: pricing-psychology issue', 'email'))).toBe('newsletter');
  });

  test('x and linkedin share one wedge — but "3x pipeline" is not X', () => {
    expect(acquisitionFor(firstTouch('X thread: client-onboarding agent breakdown'))).toBe('x_linkedin');
    expect(acquisitionFor(firstTouch('Twitter reply guy turned lead'))).toBe('x_linkedin');
    expect(acquisitionFor(firstTouch('LinkedIn post: legal-intake automation teardown'))).toBe('x_linkedin');
    expect(acquisitionFor(firstTouch('Case study: 3x pipeline in 60 days'))).toBe('word_of_mouth');
  });

  test('forms and applications', () => {
    expect(acquisitionFor(firstTouch('Website form: enterprise intake'))).toBe('form');
    expect(acquisitionFor(firstTouch('Application submitted from landing page'))).toBe('form');
  });

  test('paid channel with no platform keyword still reads instagram (ads = IG/FB)', () => {
    expect(acquisitionFor(firstTouch('Cold-traffic campaign #4', 'ads'))).toBe('instagram');
  });

  test('untracked CRM entries default honestly to word_of_mouth', () => {
    expect(acquisitionFor(firstTouch('Opportunity created in GHL', 'crm'))).toBe('word_of_mouth');
    expect(acquisitionFor(journey({}, []))).toBe('word_of_mouth');
  });

  test('a GHL source hint threaded into the label attributes correctly', () => {
    expect(acquisitionFor(firstTouch('Opportunity created in GHL · source: Instagram DM', 'crm'))).toBe('instagram');
  });
});

describe('funnelRadialModel — outside → in', () => {
  const now = new Date('2026-07-04T12:00:00Z');

  test('all 7 segments always present, counts sum to journeys, converted tallied', () => {
    const js = [
      journey({ id: 'a' }, [touch({ label: 'IG reel: offer' })]),
      journey({ id: 'b', status: 'converted', product: 'Mentorship', amountUsd: 6800 }, [
        touch({ label: 'YT long-form: agency', at: '2026-06-20' }),
        touch({ id: 't2', seq: 2, stage: 'converted', channel: 'checkout', label: 'Paid in full', at: '2026-07-01' }),
      ]),
      journey({ id: 'c' }, [touch({ label: 'Opportunity created in GHL', channel: 'crm' })]),
    ];
    const model = funnelRadialModel(js, now);
    expect(model.segments.map((s) => s.id)).toEqual(ACQUISITIONS.map((a) => a.id));
    expect(model.segments.reduce((sum, s) => sum + s.count, 0)).toBe(3);
    expect(model.segments.find((s) => s.id === 'youtube')).toMatchObject({ count: 1, converted: 1 });
    expect(model.segments.find((s) => s.id === 'instagram')).toMatchObject({ count: 1, converted: 0 });
    expect(model.segments.find((s) => s.id === 'word_of_mouth')).toMatchObject({ count: 1, converted: 0 });
  });

  test('nodes carry segment index, ring path and current ring (stage depth)', () => {
    const js = [
      journey({ id: 'won', status: 'converted' }, [
        touch({ label: 'X thread: breakdown' }),
        touch({ id: 't2', seq: 2, stage: 'engaged', channel: 'dm', label: 'DM convo', at: '2026-06-10' }),
        touch({ id: 't3', seq: 3, stage: 'converted', channel: 'checkout', label: 'Paid', at: '2026-06-20' }),
      ]),
    ];
    const [node] = funnelRadialModel(js, now).nodes;
    expect(node.segment).toBe(3); // x_linkedin
    expect(node.rings).toEqual([0, 1, 4]);
    expect(node.currentRing).toBe(4); // converted = the core
    expect(node.state).toBe('converted');
  });

  test('space-model fields survive: decay, likelihood, contact channels', () => {
    const js = [
      journey({ id: 'fading', likelihood: 80, email: 'lead@example.com' }, [
        touch({ label: 'LinkedIn post: teardown', at: '2026-05-01' }), // 64 quiet days at `now`
      ]),
    ];
    const [node] = funnelRadialModel(js, now).nodes;
    expect(node.segment).toBe(3); // linkedin shares the x_linkedin wedge
    expect(node.likelihood).toBe(80);
    expect(node.email).toBe('lead@example.com');
    expect(node.decay).toBeGreaterThan(0.5);
    expect(node.decay).toBeLessThan(1);
  });

  test('empty input still yields the full rim', () => {
    const model = funnelRadialModel([], now);
    expect(model.nodes).toEqual([]);
    expect(model.segments).toHaveLength(6);
    expect(model.segments.every((s) => s.count === 0)).toBe(true);
  });
});

describe('originOf — where they came from, in words (AC53)', () => {
  test('an instagram entry reads as the Instagram segment with the entry touch', () => {
    const j = firstTouch('IG reel: 3 offers that close themselves');
    const o = originOf(j);
    expect(o.segment).toBe('Instagram');
    expect(o.entry).toBe('IG reel: 3 offers that close themselves');
    expect(o.at).toBe(j.touches[0].at);
    expect(o.source).toBe(j.touches[0].source);
    expect(o.channel).toBe(j.touches[0].channel);
  });

  test('an untracked CRM entry is honestly word of mouth', () => {
    const j = journey({}, [touch({ label: 'Deal created in Attio', channel: 'crm', source: 'attio' })]);
    expect(originOf(j).segment).toBe('Word of mouth');
    expect(originOf(j).source).toBe('attio');
  });

  test('a journey with no touches still answers', () => {
    const o = originOf(journey({}, []));
    expect(o.segment).toBe('Word of mouth');
    expect(o.entry).toBeNull();
  });
});
