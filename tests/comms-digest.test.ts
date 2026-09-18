import { describe, expect, test } from 'vitest';
import {
  buildDigest,
  classify,
  isBulkSender,
  isGroupChat,
  TIER_ORDER,
  unsubscribeCandidates,
  type DigestContext,
} from '@/lib/comms-digest';
import type { CommsItem } from '@/lib/comms';

/**
 * The 9am comms digest: read the last 24 hours of email, WhatsApp and Slack and
 * report who needs a response. The priority order is fixed: people with calls
 * first, then clients responding to proposals, then students/family/cohort,
 * brand deals mid, group chats low, companies and software last (and
 * unsubscribable).
 */
const NOW = Date.parse('2026-08-18T09:00:00.000Z');

const item = (over: Partial<CommsItem>): CommsItem => ({
  source: 'email',
  title: 'Subject',
  preview: 'body text',
  ts: new Date(NOW - 3600_000).toISOString(),
  sender: 'someone@example.com',
  ...over,
});

const ctx = (over: Partial<DigestContext> = {}): DigestContext => ({
  meetingTitles: [],
  clientNames: [],
  students: [],
  family: [],
  now: NOW,
  ...over,
});

describe('bulk / company detection', () => {
  test('noreply-style senders are bulk', () => {
    for (const s of ['noreply@stripe.com', 'no-reply@x.com', 'notifications@github.com', 'mailer@foo.io']) {
      expect(isBulkSender(s, '', ''), s).toBe(true);
    }
  });

  test('a real person is never bulk', () => {
    expect(isBulkSender('priya@acmeholdings.example.com', 'Re: the audit', 'Sounds good')).toBe(false);
  });

  test('unsubscribe copy in the body marks bulk even from a human-looking sender', () => {
    expect(isBulkSender('hello@somesaas.com', 'Product update', 'To unsubscribe click here')).toBe(true);
  });
});

describe('the real email shape (regression)', () => {
  // lib/connectors/email.ts puts "<inbox> — <sender>" in `title` and the
  // SUBJECT in `preview`. Probing live data caught this: a full day of mail
  // produced zero unsubscribe candidates because every subject-shaped rule was
  // reading the wrong field. Both fields are searched now.
  const gmail = (sender: string, subject: string): CommsItem =>
    item({ source: 'email', sender, title: `Vantage — ${sender}`, preview: subject });

  test('a receipt is bulk even though the subject sits in preview', () => {
    expect(classify(gmail('TikTok Shop', 'Your order has shipped'), ctx()).tier).toBe('noise');
  });

  test('a newsletter is caught from the subject field', () => {
    expect(classify(gmail('HighLevel', 'Weekly newsletter: 5 tips'), ctx()).tier).toBe('noise');
  });

  test('a real person emailing about a proposal is NOT bulk', () => {
    const c = classify(gmail('Priya Raman', 'Re: the two week audit'), ctx({ meetingTitles: ['the operator <> Priya Raman'] }));
    expect(c.tier).toBe('call');
  });

  test('brand deals are still found when the pitch is in the subject', () => {
    expect(classify(gmail('Partnerships', 'Sponsorship opportunity'), ctx()).tier).toBe('branddeal');
  });

  test('real bulk senders reach the unsubscribe list from this shape', () => {
    const out = unsubscribeCandidates(
      [gmail('TikTok Shop', 'Your receipt'), gmail('TikTok Shop', 'Your receipt'), gmail('Priya Raman', 'Re: audit')],
      ctx(),
    );
    expect(out.map((u) => u.sender)).toEqual(['TikTok Shop']);
    expect(out[0].count).toBe(2);
  });
});

describe('group chats', () => {
  test('a WhatsApp group is detected from the sender label', () => {
    expect(isGroupChat(item({ source: 'whatsapp', sender: 'FounderOS Cohort 1 (12)' }))).toBe(true);
  });

  test('a one-to-one WhatsApp thread is not a group', () => {
    expect(isGroupChat(item({ source: 'whatsapp', sender: 'Mom' }))).toBe(false);
  });
});

describe('classify', () => {
  test('someone on the calendar outranks everything else', () => {
    const c = classify(
      item({ sender: 'Priya Raman', title: 'Re: the two week audit' }),
      ctx({ meetingTitles: ['the operator <> Priya Raman — discovery'] }),
    );
    expect(c.tier).toBe('call');
  });

  test('a client responding lands in the client tier', () => {
    const c = classify(item({ sender: 'ops@acme-residences.example.com' }), ctx({ clientNames: ['Acme Residences'] }));
    expect(c.tier).toBe('client');
  });

  test('students and family are the people tier', () => {
    expect(classify(item({ source: 'whatsapp', sender: 'Jordan Ellery' }), ctx({ students: ['Jordan Ellery'] })).tier).toBe('people');
    expect(classify(item({ source: 'whatsapp', sender: 'Mom' }), ctx({ family: ['Mom'] })).tier).toBe('people');
  });

  test('a cohort question in a group chat is promoted out of the group tier', () => {
    const c = classify(
      item({ source: 'whatsapp', sender: 'Cohort 1 Group (9)', preview: 'quick question about the cohort call tomorrow' }),
      ctx(),
    );
    expect(c.tier).toBe('people');
  });

  test('ordinary group chatter stays low', () => {
    expect(classify(item({ source: 'whatsapp', sender: 'Family Group (6)', preview: 'lol' }), ctx()).tier).toBe('group');
  });

  test('brand deals are mid tier', () => {
    const c = classify(item({ sender: 'partnerships@brandco.com', title: 'Sponsorship opportunity for your channel' }), ctx());
    expect(c.tier).toBe('branddeal');
  });

  test('companies and software fall to noise', () => {
    expect(classify(item({ sender: 'noreply@vercel.com', title: 'Deployment ready' }), ctx()).tier).toBe('noise');
  });

  test('an unknown human still surfaces as people, never noise', () => {
    const c = classify(item({ sender: 'someguy@gmail.com', title: 'Question about your program' }), ctx());
    expect(c.tier).toBe('people');
  });

  test('every classification carries a plain-language reason', () => {
    const c = classify(item({ sender: 'Priya Raman' }), ctx({ meetingTitles: ['Call with Priya Raman'] }));
    expect(c.reason.length).toBeGreaterThan(0);
  });
});

describe('companies and software stay out of the people tier (live-data regression)', () => {
  // Each shape below once landed in "people". Messages from companies and
  // software are not important; people are. A brand is not a person.
  const gmail = (sender: string, subject: string): CommsItem =>
    item({ source: 'email', sender, title: `Personal — ${sender}`, preview: subject });

  test('CI and repo notifications are software, even when the sender is your own name', () => {
    expect(classify(gmail('Alex Rivera', '[yourname/demo-app] Run failed: CI - main'), ctx()).tier).toBe('noise');
  });

  test('ticketing and venue blasts are companies', () => {
    expect(classify(gmail('Ticketmaster', 'Season Opener, Support Act, Halftime Show'), ctx()).tier).toBe('noise');
    expect(classify(gmail('Riverside Comedy Club', 'THIS WEEK: two shows + $13 Tickets'), ctx()).tier).toBe('noise');
  });

  test('social-network digests are companies', () => {
    expect(classify(gmail('Trending on Nextdoor', 'Someone posted about the new roundabout...'), ctx()).tier).toBe('noise');
  });

  test('bounces and meeting-bot recaps are machines', () => {
    expect(classify(gmail('Mail Delivery Subsystem', 'Delivery Status Notification (Failure)'), ctx()).tier).toBe('noise');
    expect(classify(gmail('Fathom', 'Recap of your meeting with connor@example.com'), ctx()).tier).toBe('noise');
  });

  test('a person with a brand-ish word in their message is still a person', () => {
    expect(classify(gmail('Edmund Hartwell', 'We are still posting everyday'), ctx()).tier).toBe('people');
    expect(classify(gmail('Nadia Kapoor', 'like later in the day'), ctx()).tier).toBe('people');
  });
});

describe('name matching is strict enough to trust (live-data regression)', () => {
  // Company-shaped senders like "Vantage Supply" and "FounderOS - Cohort 1"
  // used to land in the CALL tier, because a single shared token against any
  // calendar title was enough and the calendar is full of the word Vantage.
  // The top tier is only useful if it means what it says.
  test('sharing one company word with a calendar title is NOT a call', () => {
    const cal = ['Vantage standup', 'FounderOS cohort call'];
    expect(classify(item({ sender: 'Vantage Supply' }), ctx({ meetingTitles: cal })).tier).not.toBe('call');
    expect(classify(item({ sender: 'Vantage Logistics' }), ctx({ meetingTitles: cal })).tier).not.toBe('call');
  });

  test('a real full-name match IS a call', () => {
    const c = classify(item({ sender: 'Priya Raman' }), ctx({ meetingTitles: ['the operator <> Priya Raman — audit'] }));
    expect(c.tier).toBe('call');
  });

  test('one distinctive surname is enough', () => {
    const c = classify(item({ sender: 'marchetti@fancyco.example.com' }), ctx({ meetingTitles: ['Lou Marchetti intro'] }));
    expect(c.tier).toBe('call');
  });

  test('LinkedIn and list mail are bulk, not clients', () => {
    expect(classify(item({ sender: 'Some Author via LinkedIn', preview: 'Why the new partnership matters' }), ctx()).tier).toBe('noise');
  });
});

describe('buildDigest', () => {
  const items: CommsItem[] = [
    item({ sender: 'noreply@vercel.com', title: 'Deploy done', ts: new Date(NOW - 1000).toISOString() }),
    item({ sender: 'Priya Raman', title: 'Re: audit — one department first', ts: new Date(NOW - 2 * 3600_000).toISOString() }),
    item({ source: 'whatsapp', sender: 'Cohort Group (18)', preview: 'lol', ts: new Date(NOW - 3000).toISOString() }),
    item({ source: 'whatsapp', sender: 'Jordan Ellery', preview: 'question on the lesson', ts: new Date(NOW - 4000).toISOString() }),
  ];
  const context = ctx({ meetingTitles: ['the operator <> Priya Raman'], students: ['Jordan Ellery'] });

  test('entries come back ranked by tier, most urgent first', () => {
    const d = buildDigest(items, context);
    expect(d.entries.map((e) => e.tier)).toEqual(['call', 'people', 'group', 'noise']);
  });

  test('only the trailing window is considered', () => {
    const stale = item({ sender: 'old@friend.com', ts: new Date(NOW - 40 * 3600_000).toISOString() });
    const d = buildDigest([...items, stale], context);
    expect(d.entries.some((e) => e.sender === 'old@friend.com')).toBe(false);
    expect(d.windowHours).toBe(24);
  });

  test('counts summarise the load per tier', () => {
    const d = buildDigest(items, context);
    expect(d.counts.call).toBe(1);
    expect(d.counts.noise).toBe(1);
    expect(d.total).toBe(4);
  });

  test('needsReply excludes noise and group chatter', () => {
    const d = buildDigest(items, context);
    expect(d.needsReply).toBe(2); // the call + the student
  });

  test('tier order is the stated priority, not alphabetical', () => {
    expect(TIER_ORDER).toEqual(['call', 'client', 'people', 'branddeal', 'group', 'noise']);
  });
});

describe('unsubscribeCandidates', () => {
  test('groups repeat bulk senders, noisiest first, never a real person', () => {
    const items = [
      item({ sender: 'news@saas.com' }),
      item({ sender: 'news@saas.com' }),
      item({ sender: 'noreply@other.com' }),
      item({ sender: 'priya@acmeholdings.example.com', title: 'Re: audit' }),
    ];
    const out = unsubscribeCandidates(items, ctx());
    expect(out[0].sender).toBe('news@saas.com');
    expect(out[0].count).toBe(2);
    expect(out.some((u) => u.sender.includes('priya'))).toBe(false);
  });
});
