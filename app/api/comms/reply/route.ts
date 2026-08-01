import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendSlackMessage } from '@/lib/connectors/slack';
import { sendEmailReply } from '@/lib/connectors/email';

export const dynamic = 'force-dynamic';

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
  }),
]);

export async function POST(request: Request) {
  const parsed = ReplySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.source === 'slack') {
    const result = await sendSlackMessage(parsed.data.channel, parsed.data.text);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  }

  const result = await sendEmailReply({
    accountId: parsed.data.account,
    to: parsed.data.to,
    subject: parsed.data.subject ?? '(no subject)',
    text: parsed.data.text,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
