import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Bulk clear.
 *
 * Most of a full queue is staged sends the Conductor wrote over a few days,
 * and some have since been retracted by the agents themselves ("DO NOT SEND -
 * SUPERSEDED"). Clearing that one click at a time is the reason it never gets
 * cleared.
 *
 * The hard rule: bulk goes ONE WAY. Dismiss can be applied to a whole list,
 * approve cannot. On a staged item approve means SEND IT, and sending 41
 * drafted emails and board comments on one unread click is not a feature, it
 * is an incident. Anything he actually wants sent, he opens.
 */
// getDb() is an app singleton, so the database is per FILE, not per test.
// Each case therefore uses its own ids and asserts only on those.
beforeAll(() => {
  process.env.FOUNDER_OS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'bulk-')), 'test.db');
});

async function decisionsFor(prefix: string) {
  const { getDb } = await import('@/lib/data');
  return getDb().deliverableDecisions.all().filter((d) => d.id.startsWith(prefix));
}

async function post(body: unknown) {
  const { POST } = await import('@/app/api/board/deliverables/decision/route');
  return POST(new Request('http://localhost/api/board/deliverables/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

describe('POST /api/board/deliverables/decision - batch form', () => {
  test('a list of ids is dismissed in one call', async () => {
    const res = await post({
      items: [
        { id: 'batch/a.md', decidedRevision: 'r1' },
        { id: 'batch/b.md', decidedRevision: 'r2' },
      ],
      decision: 'dismissed',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, count: 2 });

    const rows = await decisionsFor('batch/');
    expect(rows.map((r) => r.id).sort()).toEqual(['batch/a.md', 'batch/b.md']);
    expect(rows.every((r) => r.decision === 'dismissed')).toBe(true);
  });

  test('the revision he dismissed against is recorded per item', async () => {
    // So an agent rewriting a dismissed file brings it back, exactly as the
    // single-item path already guarantees.
    await post({ items: [{ id: 'rev/a.md', decidedRevision: 'file|t1|10' }], decision: 'dismissed' });
    expect((await decisionsFor('rev/'))[0].decidedRevision).toBe('file|t1|10');
  });

  test('BULK APPROVE IS REFUSED, because approve means send', async () => {
    const res = await post({ items: [{ id: 'refuse/a.md', decidedRevision: 'r1' }], decision: 'approved' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/one at a time|dismiss/i);

    // and nothing was written for it
    expect(await decisionsFor('refuse/')).toHaveLength(0);
  });

  test('a batch clear (decision null) undoes a whole batch', async () => {
    await post({ items: [{ id: 'undo/a.md', decidedRevision: 'r1' }], decision: 'dismissed' });
    expect(await decisionsFor('undo/')).toHaveLength(1);

    const res = await post({ items: [{ id: 'undo/a.md' }], decision: null });
    expect(res.status).toBe(200);
    expect(await decisionsFor('undo/')).toHaveLength(0);
  });

  test('an empty batch is a no-op, not a 500', async () => {
    const res = await post({ items: [], decision: 'dismissed' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ count: 0 });
  });

  test('a batch is capped, so one bad call cannot write unbounded rows', async () => {
    const items = Array.from({ length: 501 }, (_, i) => ({ id: `cap/f${i}.md`, decidedRevision: 'r' }));
    const res = await post({ items, decision: 'dismissed' });
    expect(res.status).toBe(400);
  });

  test('the single-item form still works exactly as before', async () => {
    const res = await post({ id: 'single/a.md', decision: 'approved', decidedRevision: 'r1' });
    expect(res.status).toBe(200);
    expect((await decisionsFor('single/'))[0].decision).toBe('approved');
  });
});
