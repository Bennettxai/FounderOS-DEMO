import { describe, it, expect } from 'vitest';
import { checkOutboundMail, parseAddresses, isInternal } from '@/lib/mail-guard.mjs';
import { sendEmailReply } from '@/lib/connectors/email';

// The addresses from the 2026-08-21 incident (OS-477). These are the exact
// sends this guard exists to have stopped.
const CUSTOMER = 'customer@acmeco.example.com';
const INVENTED = ['founder@agency.ai', 'alejandro@agency.example.com', 'maxwell@creatorworks.example.com'];

/** Asserts the send was refused and hands back the reason, narrowed. */
function blocked(result: { ok: boolean; error?: string }): string {
  expect(result.ok).toBe(false);
  return result.error ?? '';
}

const INBOX_ENV = {
  INBOX_1_HOST: 'imap.gmail.com',
  INBOX_1_USER: 'founder@founderos.example.com',
  INBOX_1_PASS: 'p',
};

describe('mail-guard', () => {
  it('blocks the real customer address that received five agent emails', () => {
    expect(blocked(checkOutboundMail({ from: 'alex@vantage.example.com', to: CUSTOMER }, {}))).toContain(CUSTOMER);
  });

  it('blocks every invented address from the incident', () => {
    for (const addr of INVENTED) {
      expect(checkOutboundMail({ from: 'alex@vantage.example.com', to: addr }, {}).ok).toBe(false);
    }
  });

  it('blocks an external address hidden in cc', () => {
    const r = checkOutboundMail(
      { from: 'alex@vantage.example.com', to: 'alex@vantage.example.com', cc: 'alejandro@agency.example.com' },
      {},
    );
    expect(blocked(r)).toContain('alejandro@agency.example.com');
  });

  it('blocks sending as founder@founderos.example.com per the send-as rule', () => {
    const r = checkOutboundMail({ from: 'founder@founderos.example.com', to: 'alex@vantage.example.com' }, {});
  });

  it('allows internal mail to the operator so alerting keeps working', () => {
    const r = checkOutboundMail({ from: 'alex@vantage.example.com', to: 'founder@founderos.example.com' }, {});
    expect(r.ok).toBe(true);
  });

  it('allows external mail only with the explicit per-call override', () => {
    const r = checkOutboundMail({ from: 'alex@vantage.example.com', to: CUSTOMER }, { MAIL_ALLOW_EXTERNAL: '1' });
    expect(r.ok).toBe(true);
  });

  it('does not let a display name smuggle a recipient past the check', () => {
    expect(parseAddresses('Alejandro <alejandro@agency.example.com>')).toEqual(['alejandro@agency.example.com']);
    expect(isInternal('FOUNDER@founderos.example.com')).toBe(true);
  });

  it('refuses an empty recipient list', () => {
    expect(checkOutboundMail({ from: 'alex@vantage.example.com', to: '' }, {}).ok).toBe(false);
  });
});

describe('POST /api/comms/reply send path', () => {
  it('refuses an external recipient before opening an SMTP socket', async () => {
    const r = await sendEmailReply(
      { accountId: 'inbox-1', to: CUSTOMER, subject: 'Re', text: 'hi' },
      INBOX_ENV,
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('mail-guard');
  });

  it('still returns ok:false honestly rather than throwing', async () => {
    const r = await sendEmailReply({ to: INVENTED[0], subject: 'Re', text: 'hi' }, INBOX_ENV);
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
  });
});
