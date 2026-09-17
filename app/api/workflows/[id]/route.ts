import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { WorkflowSchema, type Workflow } from '@/lib/schemas';
import { WorkflowInputSchema, buildWorkflowSteps } from '../shared';

export const dynamic = 'force-dynamic';

/** Updates an existing workflow's name, subtitle, and steps in place: the
 *  id, order, and revenue figure carry over untouched. Re-derives every
 *  step id from scratch (same `buildWorkflowSteps` the create route uses),
 *  so an edit that reorders or removes a step never leaves a stale branch
 *  pointer behind. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const db = getDb();
  const existing = db.workflows.get(params.id);
  if (!existing) return NextResponse.json({ error: `unknown workflow: ${params.id}` }, { status: 404 });

  const parsed = WorkflowInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const workflow: Workflow = {
    id: existing.id,
    name: parsed.data.name,
    subtitle: parsed.data.subtitle,
    revenueUsd: existing.revenueUsd,
    order: existing.order,
    steps: buildWorkflowSteps(existing.id, parsed.data.steps),
  };
  WorkflowSchema.parse(workflow);
  db.workflows.insert(workflow);
  return NextResponse.json({ workflow });
}

/** Deletes one workflow. The builder gates this behind an explicit confirm
 *  step client-side; the route itself just does the honest thing: 404 for
 *  an id that's already gone, 200 for a real delete. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const db = getDb();
  const existing = db.workflows.get(params.id);
  if (!existing) return NextResponse.json({ error: `unknown workflow: ${params.id}` }, { status: 404 });
  db.workflows.remove(params.id);
  return NextResponse.json({ ok: true });
}
