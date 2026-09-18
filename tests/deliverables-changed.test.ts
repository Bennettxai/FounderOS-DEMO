import { describe, expect, test } from 'vitest';
import type { DeliverableGroup } from '@/lib/board-deliverables';
import { changedIds, markSeenMap, parseSeenMap, revisionMap } from '@/lib/deliverables-seen';

/**
 * the operator, 2026-08-20: "add to the agent section in deliverables a red ping
 * update when proposals get updated from their initial state so I can go check
 * that. Same with agent files."
 *
 * The existing badge compares id SETS, so it can only notice arrivals. A
 * proposal that moves sent → won keeps its id and stays silent, which is the
 * exact case he is asking about. Tracking a revision per id makes "changed"
 * visible as its own signal, separate from "new".
 */
const groups = (over: { meta?: string; modifiedAt?: string } = {}): DeliverableGroup[] => [
  {
    name: 'Vantage proposals',
    items: [
      {
        id: 'proposal:dana',
        name: 'Dana Whitfield',
        kind: 'link',
        url: 'https://x.test/dana',
        meta: over.meta ?? 'sent · $7,500',
        title: 'Dana Whitfield',
        summary: '',
        modifiedAt: '2026-08-18T00:00:00.000Z',
        sizeBytes: null,
        accessCode: 'demo-code-01',
      },
    ],
  },
  {
    name: 'Agent files',
    items: [
      {
        id: 'ws1/audit.md',
        name: 'audit.md',
        kind: 'file',
        url: null,
        meta: 'ws1',
        modifiedAt: over.modifiedAt ?? '2026-08-20T10:00:00.000Z',
        sizeBytes: 200,
        accessCode: '', title: 'T', summary: '',
      },
    ],
  },
];

describe('revisionMap', () => {
  test('maps every row on the board to its revision', () => {
    expect(Object.keys(revisionMap(groups())).sort()).toEqual(['proposal:dana', 'ws1/audit.md']);
  });
});

describe('changedIds', () => {
  test('a never-looked browser reports nothing, new or changed', () => {
    // Everything already on the board on the first visit is old news.
    expect(changedIds(revisionMap(groups()), null)).toEqual({ added: [], updated: [] });
  });

  test('an id that was not there before is added, not updated', () => {
    const seen = { 'proposal:dana': 'link|sent · $7,500|https://x.test/dana|demo-code-01' };
    expect(changedIds(revisionMap(groups()), seen)).toEqual({
      added: ['ws1/audit.md'],
      updated: [],
    });
  });

  test('a proposal that moves status is updated, not added', () => {
    const seen = markSeenMap(null, revisionMap(groups()));
    const { added, updated } = changedIds(revisionMap(groups({ meta: 'won · $7,500' })), seen);
    expect(added).toEqual([]);
    expect(updated).toEqual(['proposal:dana']);
  });

  test('an agent file rewritten in place is updated', () => {
    const seen = markSeenMap(null, revisionMap(groups()));
    const next = revisionMap(groups({ modifiedAt: '2026-08-20T18:00:00.000Z' }));
    expect(changedIds(next, seen).updated).toEqual(['ws1/audit.md']);
  });

  test('an untouched board reports nothing', () => {
    const seen = markSeenMap(null, revisionMap(groups()));
    expect(changedIds(revisionMap(groups()), seen)).toEqual({ added: [], updated: [] });
  });

  test('a known id with an unknown revision never reads as updated', () => {
    // This is the migration case: stores written by the old id-only badge have
    // no revisions. Treating blank as "changed" would light every row red once.
    const seen = { 'proposal:dana': '', 'ws1/audit.md': '' };
    expect(changedIds(revisionMap(groups()), seen)).toEqual({ added: [], updated: [] });
  });
});

describe('parseSeenMap', () => {
  test('reads the new id→revision format', () => {
    expect(parseSeenMap('{"a":"r1"}')).toEqual({ a: 'r1' });
  });

  test('migrates the old array format to blank revisions', () => {
    // Old stores were `string[]` of ids. They must migrate to "seen, revision
    // unknown" so the first load after this ships is silent, not a wall of red.
    expect(parseSeenMap('["a","b"]')).toEqual({ a: '', b: '' });
  });

  test('never-looked and unparseable both read as null', () => {
    expect(parseSeenMap(null)).toBeNull();
    expect(parseSeenMap('{oops')).toBeNull();
    expect(parseSeenMap('7')).toBeNull();
  });

  test('non-string revision values are dropped rather than trusted', () => {
    expect(parseSeenMap('{"a":"r1","b":5}')).toEqual({ a: 'r1' });
  });
});

describe('markSeenMap', () => {
  test('records current revisions', () => {
    const now = revisionMap(groups());
    expect(markSeenMap(null, now)).toEqual(now);
  });

  test('prunes ids that are gone so the store cannot grow forever', () => {
    const seen = { old: 'r0', 'proposal:dana': 'stale' };
    const out = markSeenMap(seen, revisionMap(groups()));
    expect(Object.keys(out).sort()).toEqual(['proposal:dana', 'ws1/audit.md']);
  });

  test('an empty board keeps the store rather than wiping it', () => {
    // A failed fetch is indistinguishable from an empty board; wiping here
    // would re-badge everything on the next successful load.
    const seen = { a: 'r1' };
    expect(markSeenMap(seen, {})).toEqual({ a: 'r1' });
  });

  test('acknowledging adopts the NEW revision, clearing the red ping', () => {
    const seen = markSeenMap(null, revisionMap(groups()));
    const next = revisionMap(groups({ meta: 'won · $7,500' }));
    expect(changedIds(next, markSeenMap(seen, next))).toEqual({ added: [], updated: [] });
  });
});
