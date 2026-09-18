/**
 * Outbound mail guard. Shared by every SMTP path in this repo.
 *
 * Why this exists: agent-generated mail can go out to real third parties
 * without anyone approving a recipient. An invented address only stays safe
 * as long as it happens not to resolve; a live domain with real mail
 * exchange would hand a stranger whatever the message contained. Any
 * unattended send path is exposed to this, so the check lives here, once,
 * and every caller runs through it rather than each path guessing on its own.
 *
 * Default posture: mail to the operator's own inboxes is fine (internal alerting keeps
 * working); mail to anyone else is refused. Callers surface the refusal honestly
 * rather than throwing: the cockpit already falls back to a `mailto:` draft on a
 * non-ok result, so a blocked send degrades into the operator sending it themselves
 * from their own mail client, which is the correct human-in-the-loop outcome.
 *
 * Overrides are deliberately env-only and per-invocation, never defaults:
 * MAIL_ALLOW_EXTERNAL=1 allow external recipients
 * MAIL_ALLOW_FOUNDEROS_FROM=1 allow sending as founder@founderos.example.com
 */

/** The operator's own mailboxes. Mail here is internal and stays allowed. */
export const INTERNAL_RECIPIENTS = [
  'founder@founderos.example.com',
  'alex.rivera.personal@example.com',
  'alex@launchpadcohort.example.com',
  'alex@vantage.example.com',
  'admin@founderos.example.com',
];

/**
 * Outbound mail should stop going out under the
 * founder@founderos.example.com address, so sending from it is disallowed
 * by default rather than left to each caller to remember.
 */
export const BANNED_FROM = ['founder@founderos.example.com'];

const norm = (a) => String(a ?? '').trim().toLowerCase();

/** Accepts "a@x.com, b@y.com", an array, or undefined. Returns normalized addresses. */
export function parseAddresses(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',');
  return list.map(norm).filter(Boolean).map((a) => {
    // Tolerate "Name <addr@host>" so a display name can never smuggle a recipient past us.
    const m = a.match(/<([^>]+)>/);
    return m ? m[1].trim() : a;
  });
}

export function isInternal(address) {
  return INTERNAL_RECIPIENTS.includes(norm(address));
}

/**
 * @returns {{ok: true, recipients: string[]}|{ok: false, error: string}}
 */
export function checkOutboundMail({ from, to, cc, bcc } = {}, env = {}) {
  const recipients = [...parseAddresses(to), ...parseAddresses(cc), ...parseAddresses(bcc)];

  if (recipients.length === 0) {
    return { ok: false, error: 'no recipient address' };
  }

  if (BANNED_FROM.includes(norm(from)) && env.MAIL_ALLOW_FOUNDEROS_FROM !== '1') {
    return {
      ok: false,
      error:
        `blocked by mail-guard: sending as ${norm(from)} was disallowed by the operator. ` +
        'Use --from alex@vantage.example.com (client mail) or set MAIL_ALLOW_FOUNDEROS_FROM=1 for this one call.',
    };
  }

  const external = recipients.filter((a) => !isInternal(a));
  if (external.length > 0 && env.MAIL_ALLOW_EXTERNAL !== '1') {
    return {
      ok: false,
      error:
        `blocked by mail-guard: ${external.length} external recipient(s): ${external.join(', ')}. ` +
        'Outbound mail to external addresses needs a human to approve the recipient. ' +
        'Set MAIL_ALLOW_EXTERNAL=1 for this one call if that approval exists.',
    };
  }

  return { ok: true, recipients };
}
