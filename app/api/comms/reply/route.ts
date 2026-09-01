import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendSlackMessage } from '@/lib/connectors/slack';
import { sendEmailReply } from '@/lib/connectors/email';
import { requireSession } from '@/lib/session';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Send throttles for the real SMTP relay. Overridable via env for higher-volume
// operators; the defaults keep a leaked/abused endpoint from blasting mail.
const PER_RECIPIENT_PER_HOUR = Number(process.env.COMMS_REPLY_MAX_PER_RECIPIENT_PER_HOUR ?? 5);
const GLOBAL_PER_HOUR = Number(process.env.COMMS_REPLY_MAX_PER_HOUR ?? 30);
const DAILY_CAP = Number(process.env.COMMS_REPLY_MAX_PER_DAY ?? 100);

/**
 * Replies the server can actually deliver. Slack sends via the bot token; email
 * sends for real over SMTP using the originating inbox's credentials. WhatsApp
 * stays a client-side deep link (the local store is read-only). A non-ok result
 * is honest (502) so the UI can fall back to a mailto: draft.
 */
const ReplySchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('slack'), channel: z.string().min(1), text: z.string().min(1).max(4000) }),
  z.object({
    source: z.literal('email'),
    account: z.string().optional(),
    to: z.string().email(),
    subject: z.string().max(300).optional(),
    text: z.string().min(1).max(20000),
    inReplyTo: z.string().min(1).max(998).optional(),
    references: z.array(z.string().min(1).max(998)).max(100).optional(),
  }),
]);

export async function POST(request: Request) {
  const gate = requireSession(request);
  if (gate) return gate;

  const parsed = ReplySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.source === 'slack') {
    const result = await sendSlackMessage(parsed.data.channel, parsed.data.text);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  }

  // Real SMTP send: throttle per-recipient, globally, and against a daily cap
  // so the relay can't be used to blast arbitrary addresses.
  const daily = rateLimit('comms:reply:day', DAILY_CAP, DAY);
  if (!daily.ok) return tooManyRequests(daily.retryAfter);
  const global = rateLimit('comms:reply:hour', GLOBAL_PER_HOUR, HOUR);
  if (!global.ok) return tooManyRequests(global.retryAfter);
  const recipient = rateLimit(`comms:reply:to:${parsed.data.to.toLowerCase()}`, PER_RECIPIENT_PER_HOUR, HOUR);
  if (!recipient.ok) return tooManyRequests(recipient.retryAfter);

  const result = await sendEmailReply({
    accountId: parsed.data.account,
    to: parsed.data.to,
    subject: parsed.data.subject ?? '(no subject)',
    text: parsed.data.text,
    inReplyTo: parsed.data.inReplyTo,
    references: parsed.data.references,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
