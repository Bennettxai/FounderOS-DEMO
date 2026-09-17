import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { WorkflowSchema, type Workflow } from '@/lib/schemas';
import { WorkflowInputSchema, buildWorkflowSteps, slugifyWorkflowName } from './shared';

export const dynamic = 'force-dynamic';

/** The full workflow list: mirrors the shape app/workflows/page.tsx reads
 *  server-side; exposed here too so a client that only has fetch (the
 *  builder, after a save) can confirm what actually landed. */
export async function GET() {
  return NextResponse.json({ workflows: getDb().workflows.all() });
}

/** Creates a new workflow from the builder panel. Never touches an
 *  existing row: always inserts a fresh id: so a double-submit at worst
 *  creates two workflows, never corrupts one. */
export async function POST(request: Request) {
  const parsed = WorkflowInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const db = getDb();
  const existing = db.workflows.all();
  const id = `wf-${slugifyWorkflowName(parsed.data.name)}-${randomUUID().slice(0, 6)}`;
  const order = existing.reduce((max, w) => Math.max(max, w.order), -1) + 1;

  const workflow: Workflow = {
    id,
    name: parsed.data.name,
    subtitle: parsed.data.subtitle,
    revenueUsd: 0,
    order,
    steps: buildWorkflowSteps(id, parsed.data.steps),
  };
  WorkflowSchema.parse(workflow); // belt + suspenders: the DB layer parses too
  db.workflows.insert(workflow);
  return NextResponse.json({ workflow }, { status: 201 });
}
