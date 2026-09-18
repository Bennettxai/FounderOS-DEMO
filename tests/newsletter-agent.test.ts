import { describe, expect, test } from 'vitest';
import { buildNewsletterBrief, MIN_SENDS_FOR_CONFIDENCE } from '@/lib/agents/newsletter-brief';
import type { Newsletter } from '@/lib/connectors/beehiiv';

/**
 * the operator, 2026-08-19: a newsletter generation agent. Before it writes anything
 * it reads what his list actually opened and clicked, so the draft is aimed at
 * evidence instead of vibes. The honesty rule matters more than the stats: with
 * two sends there is no such thing as a trend, and an agent that says otherwise
 * will get him writing to a pattern that does not exist.
 */
const send = (over: Partial<Newsletter> = {}): Newsletter => ({
  id: 'n1',
  title: 'Issue',
  publishedAt: '2026-08-01T00:00:00.000Z',
  webUrl: null,
  recipients: 1000,
  delivered: 1000,
  deliveryRate: 100,
  opens: 400,
  openRate: 40,
  clicks: 50,
  clickRate: 5,
  unsubscribes: 5,
  unsubscribeRate: 0.5,
  spamReports: 0,
  webViews: 0,
  ...over,
});

describe('buildNewsletterBrief', () => {
  test('no sends yet is stated plainly, not papered over', () => {
    const b = buildNewsletterBrief([]);
    expect(b.sends).toBe(0);
    expect(b.confident).toBe(false);
    expect(b.bestBySubject).toBeNull();
    expect(b.bestByBody).toBeNull();
    expect(b.notes.join(' ')).toMatch(/no sends|nothing to learn/i);
  });

  test('a thin history reports what exists but refuses to call it a pattern', () => {
    const b = buildNewsletterBrief([send({ id: 'a' }), send({ id: 'b' })]);
    expect(b.sends).toBe(2);
    expect(b.confident).toBe(false);
    expect(b.medianOpenRate).toBe(40);
    expect(b.notes.join(' ')).toMatch(/not enough|too few|no pattern/i);
  });

  test('enough history flips it to confident', () => {
    const many = Array.from({ length: MIN_SENDS_FOR_CONFIDENCE }, (_, i) =>
      send({ id: `n${i}`, openRate: 30 + i, clickRate: 3 + i }),
    );
    expect(buildNewsletterBrief(many).confident).toBe(true);
  });

  test('the subject-line winner is judged on opens, the body winner on clicks', () => {
    const b = buildNewsletterBrief([
      send({ id: 'a', title: 'Great subject', openRate: 62, clickRate: 2 }),
      send({ id: 'b', title: 'Great body', openRate: 31, clickRate: 11 }),
      send({ id: 'c', title: 'Middle', openRate: 40, clickRate: 5 }),
    ]);
    expect(b.bestBySubject?.title).toBe('Great subject');
    expect(b.bestByBody?.title).toBe('Great body');
  });

  test('medians, not averages, so one viral issue cannot skew the read', () => {
    const b = buildNewsletterBrief([
      send({ id: 'a', openRate: 10 }),
      send({ id: 'b', openRate: 40 }),
      send({ id: 'c', openRate: 900 }),
    ]);
    expect(b.medianOpenRate).toBe(40);
  });

  test('an even number of sends takes the midpoint', () => {
    const b = buildNewsletterBrief([send({ id: 'a', openRate: 20 }), send({ id: 'b', openRate: 40 })]);
    expect(b.medianOpenRate).toBe(30);
  });

  test('the weakest issue is surfaced too, because that is the lesson', () => {
    const b = buildNewsletterBrief([
      send({ id: 'a', title: 'Fine', openRate: 45 }),
      send({ id: 'b', title: 'Flopped', openRate: 12 }),
    ]);
    expect(b.worst?.title).toBe('Flopped');
  });

  test('an unsubscribe spike on the latest send is called out', () => {
    const b = buildNewsletterBrief([
      send({ id: 'old1', publishedAt: '2026-07-01T00:00:00.000Z', unsubscribeRate: 0.4 }),
      send({ id: 'old2', publishedAt: '2026-07-08T00:00:00.000Z', unsubscribeRate: 0.5 }),
      send({ id: 'latest', publishedAt: '2026-08-01T00:00:00.000Z', unsubscribeRate: 3.2 }),
    ]);
    expect(b.unsubscribeWarning).toMatch(/3\.2/);
  });

  test('a normal unsubscribe rate raises nothing', () => {
    const b = buildNewsletterBrief([
      send({ id: 'a', publishedAt: '2026-07-01T00:00:00.000Z', unsubscribeRate: 0.4 }),
      send({ id: 'b', publishedAt: '2026-08-01T00:00:00.000Z', unsubscribeRate: 0.5 }),
    ]);
    expect(b.unsubscribeWarning).toBeNull();
  });

  test('recent issues are listed newest first so the agent avoids repeating them', () => {
    const b = buildNewsletterBrief([
      send({ id: 'a', title: 'Older', publishedAt: '2026-06-01T00:00:00.000Z' }),
      send({ id: 'b', title: 'Newest', publishedAt: '2026-08-10T00:00:00.000Z' }),
    ]);
    expect(b.recentTitles[0]).toBe('Newest');
  });
});

describe('newsletterPrompt', () => {
  test('thin history reaches the model as an explicit ban on claiming a trend', async () => {
    const { newsletterPrompt } = await import('@/lib/agents/newsletter-agent');
    const p = newsletterPrompt(buildNewsletterBrief([send({ id: 'a' })]));
    expect(p).toMatch(/TOO THIN TO BE EVIDENCE/);
    expect(p).toMatch(/Do not describe a trend/i);
  });

  test('a healthy history carries no such warning', async () => {
    const { newsletterPrompt } = await import('@/lib/agents/newsletter-agent');
    const many = Array.from({ length: MIN_SENDS_FOR_CONFIDENCE }, (_, i) => send({ id: `n${i}` }));
    expect(newsletterPrompt(buildNewsletterBrief(many))).not.toMatch(/TOO THIN/);
  });

  test('recent titles are handed over so the agent does not repeat itself', async () => {
    const { newsletterPrompt } = await import('@/lib/agents/newsletter-agent');
    const p = newsletterPrompt(buildNewsletterBrief([send({ title: 'The one about pricing' })]));
    expect(p).toContain('The one about pricing');
    expect(p).toMatch(/do not pitch these again/i);
  });
});
