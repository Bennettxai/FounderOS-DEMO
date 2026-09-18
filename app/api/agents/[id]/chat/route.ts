import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { realAgents } from '@/lib/agents/real';
import { chatWithAgent } from '@/lib/agents/chat';
import { routeConductorMessage } from '@/lib/agents/conductor';
import { requireSession } from '@/lib/session';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // better-sqlite3 is native — keep off the edge runtime

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
// This endpoint spends real money per call (Vercel AI Gateway). Cap the rate and
// put a hard daily ceiling on total calls as a cost cap; both overridable.
const CHAT_PER_MINUTE = Number(process.env.AGENT_CHAT_MAX_PER_MIN ?? 10);
const CHAT_PER_DAY = Number(process.env.AGENT_CHAT_MAX_PER_DAY ?? 300);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = requireSession(req);
  if (gate) return gate;

  let message = '';
  let screenContext: string | undefined;
  try {
    const body = (await req.json()) as { message?: unknown; context?: unknown };
    message = typeof body.message === 'string' ? body.message.trim() : '';
    screenContext = typeof body.context === 'string' && body.context.trim() ? body.context.slice(0, 4000) : undefined;
  } catch {
    // fall through to the empty-message rejection
  }
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  // Resolve the target up front so a genuinely-unknown agent is a 404, while a
  // downstream failure (gateway error, Zod throw, …) surfaces honestly as a 500
  // instead of masquerading as "unknown agent".
  const isConductor = params.id === 'conductor';
  if (!isConductor && !realAgents.some((a) => a.id === params.id)) {
    return NextResponse.json({ error: `unknown agent: ${params.id}` }, { status: 404 });
  }

  // Only real chat attempts consume quota (malformed/unknown requests above do
  // not). Rate + daily cost cap gate the paid LLM call.
  const perMinute = rateLimit('agent:chat:min', CHAT_PER_MINUTE, MINUTE);
  if (!perMinute.ok) return tooManyRequests(perMinute.retryAfter);
  const perDay = rateLimit('agent:chat:day', CHAT_PER_DAY, DAY);
  if (!perDay.ok) return tooManyRequests(perDay.retryAfter);

  try {
    const result = isConductor
      ? await routeConductorMessage(getDb(), realAgents, message, { screenContext })
      : await chatWithAgent(getDb(), realAgents, params.id, message, { screenContext });
    return NextResponse.json(result);
  } catch (err) {
    // Log the detail server-side; return a generic message so gateway/internal
    // errors don't leak to the client.
    console.error('agent chat failed', err);
    return NextResponse.json({ error: 'chat failed' }, { status: 500 });
  }
}
