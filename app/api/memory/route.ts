import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getBrainProvider } from '@/lib/brain';
import { getDb } from '@/lib/data';
import { MEMORY_BUDGET_CHARS, createMemoryProvider, type MemoryBrain } from '@/lib/memory-provider';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // better-sqlite3 is native — keep off the edge runtime

/**
 * The memory surface Hermes workers read, alongside the MCP.
 *
 *   GET  /api/memory                    ambient context: what is going on
 *   GET  /api/memory?q=acme-parking         + G-Brain recall for that question
 *   GET  /api/memory?q=…&format=md      raw markdown, ready to pipe into a prompt
 *   POST /api/memory  {text,title?}     write what the worker learned back to G-Brain
 *
 * From a Hermes container on the private network:
 *   curl -s "$FOUNDER_OS_URL/api/memory?format=md&q=$TASK" \
 *        -H "Authorization: Bearer $MEMORY_API_TOKEN"
 *
 * Most routes in this OS rely on the app's own access gate over the private
 * network. This one hands over the whole business memory in a single GET,
 * and the worker pool reaches it from outside the host, so it layers on its
 * own shared secret: set MEMORY_API_TOKEN and it is enforced on both verbs.
 */
function authorized(req: Request): boolean {
  const expected = process.env.MEMORY_API_TOKEN?.trim();
  if (!expected) return true;
  const header = req.headers.get('authorization') ?? '';
  const bearer = header.replace(/^Bearer\s+/i, '').trim();
  return bearer === expected || req.headers.get('x-memory-token')?.trim() === expected;
}

const unauthorized = () =>
  NextResponse.json({ ok: false, error: 'MEMORY_API_TOKEN required' }, { status: 401 });

function provider() {
  // getBrainProvider() returns the federated provider by default, which
  // forwards capture to its gbrain half; the stub cannot capture at all, and
  // remember() reports that honestly rather than pretending to write.
  const brain: MemoryBrain = getBrainProvider();
  return createMemoryProvider({ db: getDb(), brain });
}

export async function GET(req: Request) {
  if (!authorized(req)) return unauthorized();

  const params = new URL(req.url).searchParams;
  const query = params.get('q');
  const budget = Number(params.get('budget'));
  const brief = await provider().brief({
    query,
    budgetChars: Number.isFinite(budget) && budget > 0 ? Math.min(budget, 40_000) : MEMORY_BUDGET_CHARS,
  });

  if (params.get('format') === 'md') {
    return new Response(brief.markdown, {
      headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return NextResponse.json(brief);
}

const RememberSchema = z.object({
  text: z.string().min(1).max(50_000),
  title: z.string().max(200).optional(),
  type: z.string().max(60).optional(),
  slug: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  if (!authorized(req)) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = RememberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues }, { status: 400 });
  }

  const outcome = await provider().remember(parsed.data);
  // A capture that did not land is a 502, not an ok:false buried in a 200 —
  // a worker retry loop has to be able to see the difference.
  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 502 });
}
