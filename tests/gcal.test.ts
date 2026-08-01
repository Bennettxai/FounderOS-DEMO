import { describe, expect, test } from 'vitest';
import {
  caldavAccounts,
  extractJoinUrl,
  eventsFromIcal,
  mergeUpcoming,
  calendarStatus,
  type CalAccount,
} from '@/lib/connectors/gcal';

const ACCT: CalAccount = { user: 'a@x.com', pass: 'pw', name: 'A', color: '#3df08c' };

function wrap(vevent: string): string {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n${vevent}\r\nEND:VCALENDAR\r\n`;
}

describe('caldavAccounts', () => {
  test('derives Google inbox slots, strips password spaces, skips incomplete/non-Google', () => {
    const env = {
      INBOX_1_HOST: 'imap.gmail.com', INBOX_1_USER: 'one@founderos.ai', INBOX_1_PASS: 'aaaa bbbb cccc dddd', INBOX_1_NAME: 'FounderOS',
      INBOX_2_HOST: 'imap.gmail.com', INBOX_2_USER: 'two@gmail.com', INBOX_2_PASS: '', // incomplete
      INBOX_3_HOST: 'outlook.office365.com', INBOX_3_USER: 'three@work.com', INBOX_3_PASS: 'zzzz', // non-Google
      INBOX_4_HOST: 'imap.gmail.com', INBOX_4_USER: 'four@vantage.ai', INBOX_4_PASS: 'eeee', INBOX_4_NAME: 'Vantage',
    };
    const accts = caldavAccounts(env);
    expect(accts.map((a) => a.user)).toEqual(['one@founderos.ai', 'four@vantage.ai']);
    expect(accts[0].pass).toBe('aaaabbbbccccdddd'); // spaces stripped
    expect(accts[0].name).toBe('FounderOS');
    expect(accts[0].color).not.toBe(accts[1].color); // distinct colors per slot
  });
});

describe('extractJoinUrl', () => {
  test('prefers X-GOOGLE-CONFERENCE (Meet)', () => {
    expect(extractJoinUrl({ 'X-GOOGLE-CONFERENCE': 'https://meet.google.com/abc-defg-hij' })).toBe(
      'https://meet.google.com/abc-defg-hij',
    );
  });
  test('finds a Zoom link in the description', () => {
    expect(
      extractJoinUrl({ description: 'Join Zoom Meeting\nhttps://us02web.zoom.us/j/1234567890?pwd=abc\nDial-in...' }),
    ).toBe('https://us02web.zoom.us/j/1234567890?pwd=abc');
  });
  test('finds a Teams link in the location', () => {
    expect(extractJoinUrl({ location: 'https://teams.microsoft.com/l/meetup-join/xyz' })).toContain('teams.microsoft.com');
  });
  test('returns null when there is no conference link', () => {
    expect(extractJoinUrl({ location: 'HQ conference room', description: 'bring coffee' })).toBeNull();
  });
});

describe('eventsFromIcal', () => {
  const winStart = Date.parse('2026-06-16T00:00:00Z');
  const winEnd = Date.parse('2026-07-16T00:00:00Z');

  test('parses a single in-window event with a Meet join link', () => {
    const ics = wrap(
      'BEGIN:VEVENT\r\nUID:e1@g\r\nSUMMARY:Strategy call\r\nDTSTART:20260618T150000Z\r\nDTEND:20260618T153000Z\r\nX-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij\r\nEND:VEVENT',
    );
    const evs = eventsFromIcal([ics], ACCT, winStart, winEnd);
    expect(evs).toHaveLength(1);
    expect(evs[0].title).toBe('Strategy call');
    expect(evs[0].account).toBe('A');
    expect(evs[0].joinUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(evs[0].start).toBe(new Date('2026-06-18T15:00:00Z').toISOString());
  });

  test('drops events outside the window', () => {
    const ics = wrap('BEGIN:VEVENT\r\nUID:old@g\r\nSUMMARY:Old\r\nDTSTART:20260101T090000Z\r\nDTEND:20260101T093000Z\r\nEND:VEVENT');
    expect(eventsFromIcal([ics], ACCT, winStart, winEnd)).toHaveLength(0);
  });

  test('expands a weekly recurring event into in-window instances', () => {
    const ics = wrap(
      'BEGIN:VEVENT\r\nUID:rec@g\r\nSUMMARY:Weekly sync\r\nDTSTART:20260504T090000Z\r\nDTEND:20260504T093000Z\r\nRRULE:FREQ=WEEKLY;BYDAY=MO\r\nEND:VEVENT',
    );
    const evs = eventsFromIcal([ics], ACCT, winStart, winEnd);
    expect(evs.length).toBeGreaterThanOrEqual(3);
    expect(evs.every((e) => e.title === 'Weekly sync')).toBe(true);
    for (const e of evs) {
      const t = Date.parse(e.start);
      expect(t).toBeGreaterThanOrEqual(winStart);
      expect(t).toBeLessThan(winEnd);
    }
  });
});

describe('mergeUpcoming', () => {
  const mk = (start: string, title: string, account = 'A') => ({
    id: `${account}:${title}`, account, color: '#000', title, start, end: null, allDay: false, location: null, joinUrl: null,
  });

  test('flattens, sorts by start ascending, and applies the limit', () => {
    const merged = mergeUpcoming(
      [[mk('2026-06-20T10:00:00Z', 'b'), mk('2026-06-18T10:00:00Z', 'a')], [mk('2026-06-19T10:00:00Z', 'c')]],
      2,
    );
    expect(merged.map((e) => e.title)).toEqual(['a', 'c']);
  });

  test('dedupes the same meeting shared across calendars (same title + start)', () => {
    const merged = mergeUpcoming([
      [mk('2026-06-18T10:00:00Z', 'LC EXEC', 'FounderOS')],
      [mk('2026-06-18T10:00:00Z', 'LC EXEC', 'Launchpad Cohort')],
    ]);
    expect(merged).toHaveLength(1);
  });
});

describe('calendarStatus', () => {
  test('not_configured when no Google inboxes are set', async () => {
    const s = await calendarStatus({});
    expect(s.state).toBe('not_configured');
    expect(s.id).toBe('calendar');
  });
});
