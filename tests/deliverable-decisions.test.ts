import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import type { DeliverableItem } from '@/lib/board-deliverables';
import { revisionOf } from '@/lib/deliverable-revision';
import {
  type DecisionKind,
  type DeliverableDecision,
  decisionMap,
  isReopened,
  partitionByDecision,
} from '@/lib/deliverable-decisions';

/**
 * the operator, 2026-08-20: "I need to be able to click on each task ... and be able
 * to dismiss it or continue it on I need to be able to give approval on that."
 *
 * A decision is bound to the REVISION it was made against, not just to the file
 * id. If an agent rewrites a file after he approved it, the thing he approved
 * no longer exists and the task has to come back to him. A decision that stuck
 * to the id alone would silently bless every future edit, which is the exact
 * failure mode that makes an approval queue worth less than no queue at all.
 */
const file = (over: Partial<DeliverableItem> = {}): DeliverableItem => ({
  id: 'ws1/STAGED-reply.md',
  name: 'STAGED-reply.md',
  kind: 'file',
  url: null,
  meta: 'ws1',
  modifiedAt: '2026-08-20T10:00:00.000Z',
  sizeBytes: 120,
  accessCode: '',
  title: 'Staged reply',
  summary: '',
  ...over,
});

const proposal = (over: Partial<DeliverableItem> = {}): DeliverableItem => ({
  id: 'proposal:dana',
  name: 'Dana Whitfield',
  kind: 'link',
  url: 'https://x.test/dana',
  meta: 'sent · $7,500',
  modifiedAt: '2026-08-18T00:00:00.000Z',
  sizeBytes: null,
  accessCode: 'demo-code-01',
  title: 'Dana Whitfield',
  summary: '',
  ...over,
});

const decision = (over: Partial<DeliverableDecision> = {}): DeliverableDecision => ({
  id: 'ws1/STAGED-reply.md',
  decision: 'approved',
  decidedAt: '2026-08-20T11:00:00.000Z',
  decidedRevision: revisionOf(file()),
  note: '',
  ...over,
});

describe('revisionOf', () => {
  test('a file revision moves when it is rewritten', () => {
    const before = revisionOf(file());
    expect(revisionOf(file({ modifiedAt: '2026-08-20T12:00:00.000Z' }))).not.toBe(before);
    expect(revisionOf(file({ sizeBytes: 121 }))).not.toBe(before);
  });

  test('an identical file has a stable revision', () => {
    expect(revisionOf(file())).toBe(revisionOf(file()));
  });

  test('a proposal revision moves when its status or amount changes', () => {
    // This is the whole point of asking for a proposal ping: `modifiedAt` for a
    // proposal is its createdAt, which never moves. Status and amount do.
    const before = revisionOf(proposal());
    expect(revisionOf(proposal({ meta: 'won · $7,500' }))).not.toBe(before);
    expect(revisionOf(proposal({ meta: 'sent · $9,000' }))).not.toBe(before);
  });

  test('a proposal revision moves when its url or gate code is rotated', () => {
    const before = revisionOf(proposal());
    expect(revisionOf(proposal({ url: 'https://x.test/dana-v2' }))).not.toBe(before);
    expect(revisionOf(proposal({ accessCode: 'new-code-99' }))).not.toBe(before);
  });

  test('a proposal revision ignores createdAt, which never changes', () => {
    expect(revisionOf(proposal({ modifiedAt: '2020-01-01T00:00:00.000Z' }))).toBe(
      revisionOf(proposal()),
    );
  });
});

describe('isReopened', () => {
  test('a decision made against the current revision still holds', () => {
    expect(isReopened(file(), decision())).toBe(false);
  });

  test('a decision is reopened once the file changes underneath it', () => {
    const edited = file({ modifiedAt: '2026-08-20T13:00:00.000Z' });
    expect(isReopened(edited, decision())).toBe(true);
  });

  test('a decision with no recorded revision is treated as still holding', () => {
    // Rows written before this field existed must not all reopen at once and
    // flood the queue the first time he loads the tab.
    expect(isReopened(file(), decision({ decidedRevision: '' }))).toBe(false);
  });
});

describe('partitionByDecision', () => {
  const items = [file(), file({ id: 'ws1/plan-gate.md', name: 'plan-gate.md' })];

  test('undecided work stays open', () => {
    const { open, decided } = partitionByDecision(items, {});
    expect(open).toHaveLength(2);
    expect(decided).toHaveLength(0);
  });

  test('a decided item leaves the open queue and carries its decision', () => {
    const { open, decided } = partitionByDecision(items, decisionMap([decision()]));
    expect(open.map((i) => i.id)).toEqual(['ws1/plan-gate.md']);
    expect(decided).toHaveLength(1);
    expect(decided[0].decision.decision).toBe('approved');
  });

  test('a dismissed item also leaves the open queue', () => {
    const map = decisionMap([decision({ decision: 'dismissed' })]);
    expect(partitionByDecision(items, map).open).toHaveLength(1);
  });

  test('an item edited after its decision returns to the open queue', () => {
    // The agent rewrote what he already signed off on: it is his call again.
    const edited = file({ modifiedAt: '2026-08-20T14:00:00.000Z' });
    const { open, decided } = partitionByDecision([edited], decisionMap([decision()]));
    expect(open).toHaveLength(1);
    expect(decided).toHaveLength(0);
  });

  test('decisions for files that no longer exist do not invent rows', () => {
    const map = decisionMap([decision({ id: 'ws1/deleted.md' })]);
    const { open, decided } = partitionByDecision(items, map);
    expect(open).toHaveLength(2);
    expect(decided).toHaveLength(0);
  });
});

describe('decisionMap', () => {
  test('keys by id for O(1) lookup', () => {
    const m = decisionMap([decision(), decision({ id: 'other' })]);
    expect(Object.keys(m).sort()).toEqual(['other', 'ws1/STAGED-reply.md']);
  });

  test('the newest decision for an id wins', () => {
    const m = decisionMap([
      decision({ decision: 'dismissed', decidedAt: '2026-08-20T11:00:00.000Z' }),
      decision({ decision: 'approved', decidedAt: '2026-08-20T12:00:00.000Z' }),
    ]);
    expect(m['ws1/STAGED-reply.md'].decision).toBe('approved');
  });
});

/**
 * Persistence. Decisions live in the OS database rather than in localStorage
 * because the board runs on the host and the operator looks at it from more than one
 * machine: a call made on the laptop has to still be made when he opens the OS
 * on his phone. It is also the only place an agent could ever read it back.
 */
describe('db.deliverableDecisions', () => {
  let db: FounderDb;
  afterEach(() => db?.close());

  const row = (over: Partial<DeliverableDecision> = {}): DeliverableDecision => ({
    id: 'ws1/STAGED-reply.md',
    decision: 'approved',
    decidedAt: '2026-08-20T11:00:00.000Z',
    decidedRevision: 'file|2026-08-20T10:00:00.000Z|120',
    note: '',
    ...over,
  });

  test('a fresh database has no decisions', () => {
    db = openDb(':memory:');
    expect(db.deliverableDecisions.all()).toEqual([]);
  });

  test('round-trips a decision', () => {
    db = openDb(':memory:');
    db.deliverableDecisions.set(row({ note: 'send it' }));
    expect(db.deliverableDecisions.all()).toEqual([row({ note: 'send it' })]);
  });

  test('deciding again on the same id replaces, never duplicates', () => {
    db = openDb(':memory:');
    db.deliverableDecisions.set(row());
    db.deliverableDecisions.set(row({ decision: 'dismissed', decidedAt: '2026-08-20T12:00:00.000Z' }));
    const all = db.deliverableDecisions.all();
    expect(all).toHaveLength(1);
    expect(all[0].decision).toBe('dismissed');
  });

  test('clear removes it and returns the row to the open queue', () => {
    db = openDb(':memory:');
    db.deliverableDecisions.set(row());
    db.deliverableDecisions.clear(row().id);
    expect(db.deliverableDecisions.all()).toEqual([]);
  });

  test('an unknown decision kind is rejected at the boundary', () => {
    db = openDb(':memory:');
    // Zod guards the way in, so a typo in a route can never write a status the
    // UI has no branch for.
    expect(() =>
      db.deliverableDecisions.set({ ...row(), decision: 'maybe' as DecisionKind }),
    ).toThrow();
  });
});
