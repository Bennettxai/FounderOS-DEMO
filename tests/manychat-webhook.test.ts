import { describe, it, expect } from 'vitest';
import { parseManyChatWebhook } from '@/lib/connectors/manychat-webhook';

// The body Alex configures in ManyChat's External Request action. The parser
// is tolerant of ManyChat's field-name variants ({{contact.id}} etc.).
describe('parseManyChatWebhook', () => {
  it('maps a canonical payload to an inbound Instagram DM message', () => {
    const m = parseManyChatWebhook({
      subscriber_id: '123',
      name: 'Alex Rivera',
      handle: 'alex.rivera',
      text: 'do you work with agencies?',
      direction: 'in',
      ts: '2026-07-18T14:02:00.000Z',
    });
    expect(m).toMatchObject({
      platform: 'instagram',
      subscriberId: '123',
      name: 'Alex Rivera',
      handle: 'alex.rivera',
      text: 'do you work with agencies?',
      direction: 'in',
      source: 'manychat',
    });
    expect(m?.id).toContain('123');
  });

  it('accepts ManyChat field aliases (contact_id / full_name / ig_username / last_input_text)', () => {
    const m = parseManyChatWebhook({
      contact_id: '999',
      full_name: 'Jordan Blake',
      ig_username: 'jordanbuilds',
      last_input_text: 'SCALE',
    });
    expect(m?.subscriberId).toBe('999');
    expect(m?.name).toBe('Jordan Blake');
    expect(m?.handle).toBe('jordanbuilds');
    expect(m?.text).toBe('SCALE');
    expect(m?.direction).toBe('in'); // defaults to inbound
  });

  it('defaults ts to a provided now when the payload omits it', () => {
    const m = parseManyChatWebhook({ subscriber_id: '5', text: 'hi' }, () => '2026-07-18T00:00:00.000Z');
    expect(m?.ts).toBe('2026-07-18T00:00:00.000Z');
  });

  it('returns null when there is no subscriber id', () => {
    expect(parseManyChatWebhook({ text: 'orphan' })).toBeNull();
    expect(parseManyChatWebhook(null)).toBeNull();
    expect(parseManyChatWebhook('nope')).toBeNull();
  });

  it('falls back to the subscriber id for the display name when none is given', () => {
    const m = parseManyChatWebhook({ subscriber_id: '77', text: 'hey' });
    expect(m?.name).toBe('77');
    expect(m?.handle).toBeNull();
  });
});
