import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { createRuntime } from '@/lib/agents/runtime';
import { realAgents } from '@/lib/agents/real';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = requireSession(req);
  if (gate) return gate;

  const runtime = createRuntime(getDb(), realAgents);
  try {
    const run = await runtime.run(params.id);
    return NextResponse.json({ run });
  } catch (err) {
    // Generic message to the client; detail stays server-side.
    console.error('agent run failed', err);
    return NextResponse.json({ error: 'agent run failed' }, { status: 404 });
  }
}
