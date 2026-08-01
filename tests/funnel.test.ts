import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import {
  attentionQueue,
  funnelSummary,
  funnelSpaceModel,
  journeyMeta,
  splitFunnelJourneys,
  decayFactor,
  DECAY_FADE_START,
  DECAY_DAYS,
  FUNNEL_STAGES,
} from '@/lib/funnel';
import { orbitSpread } from '@/lib/funnel-viz';
import {
  FunnelJourneySchema,
  FunnelSummarySchema,
  type FunnelContact,
  type FunnelJourney,
  type FunnelTouch,
} from '@/lib/schemas';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

const contact = (over: Partial<FunnelContact> = {}): FunnelContact => ({
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
  ...over,
});

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

describe('funnel repo', () => {
  test('empty database has no journeys', () => {
    db = openDb(':memory:');
    expect(db.funnel.journeys()).toEqual([]);
  });

  test('round-trips a contact with touches ordered by seq', () => {
    db = openDb(':memory:');
    db.funnel.insertContact(contact());
    db.funnel.insertTouch(touch({ id: 'ft-2', seq: 2, stage: 'engaged', channel: 'dm', label: 'DM reply' }));
    db.funnel.insertTouch(touch({ id: 'ft-1', seq: 1 }));
    const journeys = db.funnel.journeys();
    expect(journeys).toHaveLength(1);
    expect(journeys[0].touches.map((t) => t.seq)).toEqual([1, 2]);
    expect(FunnelJourneySchema.parse(journeys[0]).name).toBe('Test Client');
  });

  test('round-trips the dossier identity fields (AC52)', () => {
    db = openDb(':memory:');
    db.funnel.insertContact(
      contact({
        person: 'Grace Lin',
        company: 'Lin & Co Accounting',
        role: 'Managing Partner',
        linkedin: 'https://linkedin.com/in/gracelin-example',
      }),
    );
    db.funnel.insertTouch(touch());
    const [j] = db.funnel.journeys();
    expect(j.person).toBe('Grace Lin');
    expect(j.company).toBe('Lin & Co Accounting');
    expect(j.role).toBe('Managing Partner');
    expect(j.linkedin).toBe('https://linkedin.com/in/gracelin-example');
  });

  test('venture filter narrows journeys', () => {
    db = openDb(':memory:');
    db.funnel.insertContact(contact({ id: 'fc-m', venture: 'vantage' }));
    db.funnel.insertContact(contact({ id: 'fc-aa', venture: 'launchpad-cohort' }));
    expect(db.funnel.journeys('vantage').map((j) => j.id)).toEqual(['fc-m']);
    expect(db.funnel.journeys('launchpad-cohort').map((j) => j.id)).toEqual(['fc-aa']);
    expect(db.funnel.journeys()).toHaveLength(2);
  });
});

describe('funnel seed', () => {
  test('seeds 4–5 touch journeys for both ventures, converted rows carry product + amount', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const all = db.funnel.journeys();
    expect(all.length).toBeGreaterThanOrEqual(10);

    for (const j of all) {
      FunnelJourneySchema.parse(j);
      expect(j.touches.length).toBeGreaterThanOrEqual(4);
      expect(j.touches.length).toBeLessThanOrEqual(5);
      // touches are a contiguous 1..n sequence in chronological order
      expect(j.touches.map((t) => t.seq)).toEqual(j.touches.map((_, i) => i + 1));
      expect(j.touches[0].stage).toBe('first_touch');
    }

    // both ventures represented
    expect(new Set(all.map((j) => j.venture))).toEqual(new Set(['vantage', 'launchpad-cohort']));

    // both acquisition lanes represented, with honest intended sources
    const firsts = all.map((j) => j.touches[0]);
    expect(firsts.some((t) => t.channel === 'organic' && t.source === 'trakyo')).toBe(true);
    expect(firsts.some((t) => t.channel === 'ads' && t.source === 'meta-ads')).toBe(true);

    // converted journeys end on a converted touch and carry the offer + amount
    const converted = all.filter((j) => j.status === 'converted');
    expect(converted.length).toBeGreaterThanOrEqual(4);
    for (const j of converted) {
      expect(j.touches.at(-1)?.stage).toBe('converted');
      expect(j.product).toBeTruthy();
      expect(j.amountUsd ?? 0).toBeGreaterThan(0);
    }

    // some journeys are honestly mid-funnel (not everyone converts)
    expect(all.some((j) => j.status !== 'converted')).toBe(true);

    // one seeded lead has decayed past 90 quiet days so the archive tab demos
    const split = splitFunnelJourneys(all, new Date());
    expect(split.archived.length).toBeGreaterThanOrEqual(1);
    expect(split.active.length).toBeGreaterThanOrEqual(10);

    // and one active lead sits mid-fade so the decay rendering always demos
    const decays = funnelSpaceModel(split.active, new Date()).map((n) => n.decay);
    expect(decays.some((d) => d > 0.3 && d < 1)).toBe(true);

    // relationship + likelihood seeded for every client
    for (const j of all) {
      expect(['cold', 'warm', 'hot']).toContain(j.relationship);
      expect(j.likelihood).toBeGreaterThanOrEqual(0);
      expect(j.likelihood).toBeLessThanOrEqual(100);
    }

    // touch dates are relative to today, so stall states stay meaningful:
    // at least one non-converted lead is stalled (>7d quiet) and one is active
    const now = new Date();
    const metas = all.filter((j) => j.status !== 'converted').map((j) => journeyMeta(j, now));
    expect(metas.some((m) => m.state === 'stalled')).toBe(true);
    expect(metas.some((m) => m.state === 'active')).toBe(true);
    // and the freshest touch is genuinely recent (not a fixed 2026-06 date)
    const freshest = Math.min(...metas.map((m) => m.daysSinceLastTouch));
    expect(freshest).toBeLessThanOrEqual(3);

    // re-seeding is idempotent
    seedDatabase(db);
    expect(db.funnel.journeys()).toHaveLength(all.length);
  });
});

describe('funnelSummary', () => {
  const journey = (
    id: string,
    firstChannel: FunnelTouch['channel'],
    status: FunnelContact['status'],
    amountUsd: number | null = null,
  ): FunnelJourney => ({
    id,
    name: id,
    venture: 'vantage',
    status,
    product: amountUsd ? 'Offer' : null,
    amountUsd,
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
        id: `${id}-t1`,
        contactId: id,
        seq: 1,
        stage: 'first_touch',
        channel: firstChannel,
        label: 'first',
        source: firstChannel === 'ads' ? 'meta-ads' : 'trakyo',
        at: '2026-06-01',
      },
    ],
  });

  test('computes reached-stage counts, organic/ads split, and stage→stage conversion', () => {
    const summary = funnelSummary([
      journey('j1', 'organic', 'converted', 1000),
      journey('j2', 'ads', 'converted', 500),
      journey('j3', 'organic', 'opted_in'),
      journey('j4', 'ads', 'engaged'),
    ]);
    FunnelSummarySchema.parse(summary);
    expect(summary.clients).toBe(4);
    expect(summary.converted).toBe(2);
    expect(summary.revenueUsd).toBe(1500);
    expect(summary.stages.map((s) => s.stage)).toEqual(FUNNEL_STAGES.map((s) => s.id));

    const byStage = Object.fromEntries(summary.stages.map((s) => [s.stage, s]));
    expect(byStage.first_touch).toMatchObject({ total: 4, organic: 2, ads: 2, conversionFromPrev: null });
    expect(byStage.engaged).toMatchObject({ total: 4, conversionFromPrev: 100 });
    // a converted/opted_in journey progressed past nurtured even if it skipped the touch
    expect(byStage.nurtured).toMatchObject({ total: 3, conversionFromPrev: 75 });
    expect(byStage.opted_in).toMatchObject({ total: 3, organic: 2, ads: 1, conversionFromPrev: 100 });
    expect(byStage.converted).toMatchObject({ total: 2, organic: 1, ads: 1, conversionFromPrev: 66.7 });
  });

  test('guards zero division on an empty journey set', () => {
    const summary = funnelSummary([]);
    FunnelSummarySchema.parse(summary);
    expect(summary.clients).toBe(0);
    expect(summary.revenueUsd).toBe(0);
    for (const s of summary.stages) {
      expect(s.total).toBe(0);
      expect(s.conversionFromPrev).toBeNull();
    }
  });
});

describe('journeyMeta', () => {
  const daysAgoIso = (now: Date, days: number) =>
    new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);

  const journeyLastTouchedAt = (
    status: FunnelContact['status'],
    at: string,
  ): FunnelJourney => ({
    id: 'jm',
    name: 'jm',
    venture: 'vantage',
    status,
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
    createdAt: at,
    touches: [
      {
        id: 'jm-t1', contactId: 'jm', seq: 1, stage: 'first_touch',
        channel: 'organic', label: 'x', source: 'trakyo', at,
      },
    ],
  });

  test('converted journeys are green regardless of quiet time', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    const meta = journeyMeta(journeyLastTouchedAt('converted', daysAgoIso(now, 30)), now);
    expect(meta.state).toBe('converted');
  });

  test('a lead quiet for more than 7 days before converting is stalled (red)', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    const meta = journeyMeta(journeyLastTouchedAt('opted_in', daysAgoIso(now, 8)), now);
    expect(meta.state).toBe('stalled');
    expect(meta.daysSinceLastTouch).toBe(8);
  });

  test('exactly 7 quiet days is still active — stall needs MORE than a week', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    expect(journeyMeta(journeyLastTouchedAt('engaged', daysAgoIso(now, 7)), now).state).toBe('active');
    expect(journeyMeta(journeyLastTouchedAt('engaged', daysAgoIso(now, 2)), now).state).toBe('active');
  });

  test('incoming leads never stall — first_touch stays blue however long it sits', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    expect(journeyMeta(journeyLastTouchedAt('first_touch', daysAgoIso(now, 30)), now).state).toBe('active');
  });

  test('past 90 quiet days a non-converted lead decays into the archive', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    expect(journeyMeta(journeyLastTouchedAt('engaged', daysAgoIso(now, 91)), now).state).toBe('decayed');
    expect(journeyMeta(journeyLastTouchedAt('first_touch', daysAgoIso(now, 120)), now).state).toBe('decayed');
    expect(journeyMeta(journeyLastTouchedAt('engaged', daysAgoIso(now, 90)), now).state).toBe('stalled'); // exactly 90 is not decayed yet
    expect(journeyMeta(journeyLastTouchedAt('converted', daysAgoIso(now, 200)), now).state).toBe('converted');
  });

  test('splitFunnelJourneys separates the live space from the archive', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    const fresh = journeyLastTouchedAt('engaged', daysAgoIso(now, 2));
    const dead = { ...journeyLastTouchedAt('engaged', daysAgoIso(now, 120)), id: 'dead' };
    const { active, archived } = splitFunnelJourneys([fresh, dead], now);
    expect(active.map((j) => j.id)).toEqual(['jm']);
    expect(archived.map((j) => j.id)).toEqual(['dead']);
  });
});

describe('decayFactor', () => {
  test('stays neutral through the fade start, ramps linearly, clamps at 1', () => {
    expect(decayFactor(0, 'engaged')).toBe(0);
    expect(decayFactor(DECAY_FADE_START, 'engaged')).toBe(0);
    const mid = (DECAY_FADE_START + DECAY_DAYS) / 2;
    expect(decayFactor(mid, 'engaged')).toBeCloseTo(0.5, 5);
    expect(decayFactor(DECAY_DAYS, 'engaged')).toBe(1);
    expect(decayFactor(500, 'engaged')).toBe(1);
  });

  test('converted journeys never decay — the win stays green', () => {
    expect(decayFactor(500, 'converted')).toBe(0);
  });
});

describe('funnelSpaceModel', () => {
  const NOW = new Date('2026-07-02T12:00:00Z');
  const dAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10);

  const mkTouch = (
    contactId: string,
    seq: number,
    stage: FunnelTouch['stage'],
    daysBack: number,
    channel: FunnelTouch['channel'] = 'email',
  ): FunnelTouch => ({
    id: `${contactId}-t${seq}`,
    contactId,
    seq,
    stage,
    channel,
    label: `${stage} touch`,
    source: 'manual',
    at: dAgo(daysBack),
  });

  const mkJourney = (
    id: string,
    status: FunnelContact['status'],
    touches: FunnelTouch[],
    over: Partial<FunnelJourney> = {},
  ): FunnelJourney => ({
    id,
    name: id,
    venture: 'launchpad-cohort',
    status,
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
    createdAt: dAgo(30),
    touches,
    ...over,
  });

  test('a full journey visits every hub in order and settles green on the conversion hub', () => {
    const full = mkJourney('full', 'converted', [
      mkTouch('full', 1, 'first_touch', 20, 'organic'),
      mkTouch('full', 2, 'engaged', 18, 'dm'),
      mkTouch('full', 3, 'nurtured', 15),
      mkTouch('full', 4, 'opted_in', 12, 'call'),
      mkTouch('full', 5, 'converted', 10, 'checkout'),
    ], { relationship: 'hot', likelihood: 100, product: 'Offer', amountUsd: 5000 });
    const [node] = funnelSpaceModel([full], NOW);
    expect(node.hubs).toEqual([0, 1, 2, 3, 4]);
    expect(node.currentHub).toBe(4);
    expect(node.state).toBe('converted');
  });

  test('repeated-stage touches collapse to one hub visit; a quiet lead runs red', () => {
    const stuck = mkJourney('stuck', 'engaged', [
      mkTouch('stuck', 1, 'first_touch', 27, 'ads'),
      mkTouch('stuck', 2, 'engaged', 27, 'ads'),
      mkTouch('stuck', 3, 'engaged', 23, 'ads'),
      mkTouch('stuck', 4, 'engaged', 21),
    ], { relationship: 'cold', likelihood: 15 });
    const [node] = funnelSpaceModel([stuck], NOW);
    expect(node.hubs).toEqual([0, 1]);
    expect(node.currentHub).toBe(1);
    expect(node.state).toBe('stalled');
    expect(node.daysSinceLastTouch).toBe(21);
  });

  test('identity fields ride onto the node for the dossier (AC52/AC54)', () => {
    const j = mkJourney('who', 'engaged', [mkTouch('who', 1, 'first_touch', 1)], {
      person: 'Reese Calder',
      company: 'Calder Holdings LLC',
      role: 'C-level',
      linkedin: 'https://linkedin.com/in/reesecalder-example',
      email: 'reese@example.com',
      phone: '+15550100442',
    });
    const [node] = funnelSpaceModel([j], NOW);
    expect(node.person).toBe('Reese Calder');
    expect(node.company).toBe('Calder Holdings LLC');
    expect(node.role).toBe('C-level');
    expect(node.linkedin).toBe('https://linkedin.com/in/reesecalder-example');
  });

  test('node radius grows with likelihood-to-buy inside compact 2.5–5.5px bounds', () => {
    const lo = mkJourney('lo', 'engaged', [mkTouch('lo', 1, 'first_touch', 1)], { likelihood: 0 });
    const hi = mkJourney('hi', 'engaged', [mkTouch('hi', 1, 'first_touch', 1)], { id: 'hi', likelihood: 100 });
    const [nLo, nHi] = funnelSpaceModel([lo, hi], NOW);
    expect(nHi.radius).toBeGreaterThan(nLo.radius);
    expect(nLo.radius).toBe(2.5);
    expect(nHi.radius).toBe(5.5);
  });

  test('every node carries its decay factor for the fade-to-red rendering', () => {
    const fresh = mkJourney('fresh', 'engaged', [mkTouch('fresh', 1, 'first_touch', 2)]);
    const fading = mkJourney('fading', 'engaged', [mkTouch('fading', 1, 'first_touch', 80)], { id: 'fading' });
    const [nFresh, nFading] = funnelSpaceModel([fresh, fading], NOW);
    expect(nFresh.decay).toBe(0);
    expect(nFading.decay).toBeGreaterThan(0.5);
    expect(nFading.decay).toBeLessThanOrEqual(1);
  });

  test('returns an empty model for no journeys', () => {
    expect(funnelSpaceModel([], NOW)).toEqual([]);
  });
});

describe('attentionQueue — what to act on today (AC55)', () => {
  const NOW = new Date('2026-07-11T12:00:00Z');
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const lead = (
    id: string,
    over: Partial<FunnelContact>,
    quietDays: number,
  ): FunnelJourney => ({
    id,
    name: id,
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
    createdAt: daysAgo(quietDays + 10),
    touches: [
      {
        id: `${id}-t1`, contactId: id, seq: 1, stage: 'engaged',
        channel: 'crm', label: 'x', source: 'attio', at: daysAgo(quietDays),
      },
    ],
    ...over,
  });

  test('pushNow = hot actives, freshest movement first, capped at 4', () => {
    const q = attentionQueue(
      [
        lead('cool', { likelihood: 40 }, 2), // not hot — out
        lead('hot-fresh', { likelihood: 90 }, 1),
        lead('hot-later', { likelihood: 80 }, 5),
        lead('hot-a', { likelihood: 85 }, 2),
        lead('hot-b', { likelihood: 75 }, 3),
        lead('hot-c', { likelihood: 71 }, 4),
        lead('won', { likelihood: 95, status: 'converted' }, 1), // converted — out
        lead('dying', { likelihood: 95 }, 30), // decaying — belongs to saveNow
        // first_touch never stalls, but a fading lead is a save, not a push
        lead('fading-inbound', { likelihood: 95, status: 'first_touch' }, 30),
      ],
      NOW,
    );
    expect(q.pushNow.map((j) => j.id)).toEqual(['hot-fresh', 'hot-a', 'hot-b', 'hot-c']);
  });

  test('saveNow = decaying leads, highest likelihood first, capped at 4', () => {
    const q = attentionQueue(
      [
        lead('fine', { likelihood: 90 }, 3), // active — not dying
        lead('save-1', { likelihood: 88 }, 25),
        lead('save-2', { likelihood: 70 }, 40),
        lead('save-3', { likelihood: 55 }, 30),
        lead('save-4', { likelihood: 50 }, 22),
        lead('save-5', { likelihood: 20 }, 35),
        lead('gone', { likelihood: 99 }, 120), // decayed → archive, not the queue
      ],
      NOW,
    );
    expect(q.saveNow.map((j) => j.id)).toEqual(['save-1', 'save-2', 'save-3', 'save-4']);
  });

  test('a fading first_touch lead is a save, never a push (it cannot stall)', () => {
    const q = attentionQueue([lead('fading-inbound', { likelihood: 95, status: 'first_touch' }, 30)], NOW);
    expect(q.pushNow).toEqual([]);
    expect(q.saveNow.map((j) => j.id)).toEqual(['fading-inbound']);
  });

  test('empty pipeline yields empty queues', () => {
    expect(attentionQueue([], NOW)).toEqual({ pushNow: [], saveNow: [] });
  });
});

describe('orbitSpread — crowded hubs breathe wider', () => {
  test('a dozen leads keep the tight constellation, a live pipeline spreads', () => {
    expect(orbitSpread(1)).toBe(1);
    expect(orbitSpread(12)).toBe(1);
    const crowd = orbitSpread(105);
    expect(crowd).toBeGreaterThan(1.5);
    expect(crowd).toBeLessThanOrEqual(2.4);
    // monotonic and capped
    expect(orbitSpread(50)).toBeLessThan(crowd);
    expect(orbitSpread(1000)).toBe(2.4);
    // safe on empty clusters
    expect(orbitSpread(0)).toBe(1);
  });
});
