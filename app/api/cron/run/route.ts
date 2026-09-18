import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '@/lib/data';
import { createRuntime } from '@/lib/agents/runtime';
import { realAgents } from '@/lib/agents/real';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({ cronId: z.string().min(1) });

/**
 * Fire one scheduled task NOW, without waiting for its slot.
 *
 * The same path the tick uses, so a manual run is recorded identically: an
 * agent_runs row plus a cron_runs row. That matters — "run now" is how the operator
 * finds out whether a schedule actually works, and a manual run that skipped
 * the history would defeat the point of keeping the history.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'cronId required' }, { status: 400 });

  const db = getDb();
  const cron = db.agentCrons.all().find((c) => c.id === parsed.data.cronId);
  if (!cron) return NextResponse.json({ error: `unknown scheduled task: ${parsed.data.cronId}` }, { status: 404 });

  const startedAt = new Date().toISOString();
  let ok = false;
  let summary = '';
  try {
    const run = await createRuntime(db, realAgents).run(cron.agentId);
    ok = run.ok;
    summary = run.summary;
  } catch (err) {
    summary = err instanceof Error ? err.message : String(err);
  }

  db.cronRuns.insert({
    id: randomUUID(),
    cronId: cron.id,
    agentId: cron.agentId,
    startedAt,
    finishedAt: new Date().toISOString(),
    ok,
    summary: summary.slice(0, 2000),
  });

  return NextResponse.json({ ok, summary }, { status: ok ? 200 : 502 });
}
