import { describe, it, expect } from 'vitest';
import { sendEmailReply } from '@/lib/connectors/email';

describe('sendEmailReply', () => {
  it('returns ok:false (never throws) when no inbox is configured', async () => {
    const r = await sendEmailReply({ accountId: undefined, to: 'x@example.com', subject: 'Re', text: 'hi' }, {});
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
  });

  it('returns ok:false for an empty recipient without attempting a send', async () => {
    const r = await sendEmailReply(
      { accountId: 'inbox-1', to: '', subject: 'Re', text: 'hi' },
      { INBOX_1_HOST: 'imap.gmail.com', INBOX_1_USER: 'me@x.com', INBOX_1_PASS: 'p' },
    );
    expect(r.ok).toBe(false);
  });
});
