import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '@/lib/data';
import { isValidCron } from '@/lib/cron';

export const dynamic = 'force-dynamic';

/** Tasks + cron jobs for one agent (or all agents when no id given). */
export async function GET(request: Request) {
  const agentId = new URL(request.url).searchParams.get('agentId');
  const db = getDb();
  return NextResponse.json({
    tasks: agentId ? db.agentTasks.byAgent(agentId) : db.agentTasks.all(),
    crons: agentId ? db.agentCrons.byAgent(agentId) : db.agentCrons.all(),
  });
}

const CreateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('task'), agentId: z.string().min(1), title: z.string().min(1) }),
  z.object({
    kind: z.literal('cron'),
    agentId: z.string().min(1),
    schedule: z.string().min(1),
    description: z.string().min(1),
  }),
]);

export async function POST(request: Request) {
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const db = getDb();
  const now = new Date().toISOString();

  if (parsed.data.kind === 'task') {
    const task = { id: randomUUID(), agentId: parsed.data.agentId, title: parsed.data.title, status: 'open' as const, createdAt: now, updatedAt: now };
    db.agentTasks.insert(task);
    return NextResponse.json({ ok: true, task });
  }

  if (!isValidCron(parsed.data.schedule)) {
    return NextResponse.json({ error: `invalid cron schedule: ${parsed.data.schedule} — use 5 fields like "0 9 * * 1-5"` }, { status: 400 });
  }
  const cron = { id: randomUUID(), agentId: parsed.data.agentId, schedule: parsed.data.schedule, description: parsed.data.description, enabled: true, createdAt: now };
  db.agentCrons.insert(cron);
  return NextResponse.json({ ok: true, cron });
}

const PatchSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('task'), id: z.string().min(1), status: z.enum(['open', 'doing', 'done']) }),
  z.object({ kind: z.literal('cron'), id: z.string().min(1), enabled: z.boolean() }),
]);

export async function PATCH(request: Request) {
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const db = getDb();
  if (parsed.data.kind === 'task') db.agentTasks.setStatus(parsed.data.id, parsed.data.status, new Date().toISOString());
  else db.agentCrons.setEnabled(parsed.data.id, parsed.data.enabled);
  return NextResponse.json({ ok: true });
}

const DeleteSchema = z.object({ kind: z.enum(['task', 'cron']), id: z.string().min(1) });

export async function DELETE(request: Request) {
  const parsed = DeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const db = getDb();
  if (parsed.data.kind === 'task') db.agentTasks.remove(parsed.data.id);
  else db.agentCrons.remove(parsed.data.id);
  return NextResponse.json({ ok: true });
}
