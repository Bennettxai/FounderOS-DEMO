import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { DeliverableDecisionSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

/**
 * Records the operator's decision on one piece of agent work: approve,
 * dismiss, or leave it open, with the ability to undo back into the queue.
 *
 * POST { id, decision, decidedRevision?, note? } → record it
 * POST { id, decision: null } → undo, back to the open queue
 * POST { items: [{id, decidedRevision?}], decision } → the same, in bulk
 *
 * The decision carries the revision it was made against so that an agent
 * rewriting the file afterwards puts the task back in front of the operator
 * rather than inheriting an approval for content that was never actually seen.
 *
 * BULK IS DISMISS-ONLY. On a staged item, approve means SEND IT, and dozens
 * of drafted emails and board comments going out on one unread click is not
 * a feature, it is an incident. Undo (null) is allowed in bulk because it
 * only ever puts work back in front of the operator.
 */
const BATCH_MAX = 500;
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const db = getDb();

  if (Array.isArray(raw?.items)) {
    if (raw.decision !== null && raw.decision !== 'dismissed') {
      return NextResponse.json(
        { error: 'bulk supports dismiss only; approve is one at a time because approve means send' },
        { status: 400 },
      );
    }
    if (raw.items.length > BATCH_MAX) {
      return NextResponse.json({ error: `batch too large (max ${BATCH_MAX})` }, { status: 400 });
    }

    let count = 0;
    for (const entry of raw.items) {
      const item = entry as Record<string, unknown>;
      const itemId = typeof item?.id === 'string' ? item.id : '';
      if (!itemId) continue;
      if (raw.decision === null) {
        db.deliverableDecisions.clear(itemId);
        count += 1;
        continue;
      }
      const parsed = DeliverableDecisionSchema.safeParse({
        id: itemId,
        decision: 'dismissed',
        decidedAt: new Date().toISOString(),
        decidedRevision: typeof item.decidedRevision === 'string' ? item.decidedRevision : '',
        note: '',
      });
      if (!parsed.success) continue;
      db.deliverableDecisions.set(parsed.data);
      count += 1;
    }
    return NextResponse.json({ ok: true, count });
  }

  const id = typeof raw?.id === 'string' ? raw.id : '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  // An explicit null clears the call rather than recording a third state.
  if (raw.decision === null) {
    db.deliverableDecisions.clear(id);
    return NextResponse.json({ ok: true, decision: null });
  }

  const parsed = DeliverableDecisionSchema.safeParse({
    id,
    decision: raw.decision,
    decidedAt: new Date().toISOString(),
    decidedRevision: typeof raw.decidedRevision === 'string' ? raw.decidedRevision : '',
    note: typeof raw.note === 'string' ? raw.note : '',
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid decision' }, { status: 400 });
  }

  db.deliverableDecisions.set(parsed.data);
  return NextResponse.json({ ok: true, decision: parsed.data });
}
