import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  DELIVERABLES_COLLAPSED_KEY,
  DELIVERABLES_SEEN_KEY,
  deliverableIds,
  markSeen,
  parseSeen,
  unseenDeliverableIds,
} from '@/lib/deliverables-seen';
import type { DeliverableGroup } from '@/lib/board-deliverables';

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');

/**
 * the operator, 2026-08-18: "I want to be able to expand and collapse the proposals
 * and agent files in the deliverables section and I want you to pop up a
 * notification on that deliverables tab when there's something new in there
 * that I request until I open it."
 *
 * The OS has no per-user server state, so "seen" lives in the browser. The
 * rules that keep the badge honest live here as pure functions rather than
 * tangled into the component.
 */
const GROUPS: DeliverableGroup[] = [
  {
    name: 'Vantage proposals',
    items: [
      { id: 'proposal:vantage-proposal-dana', name: 'Dana Whitfield', kind: 'link', url: 'https://x.test', meta: 'sent', modifiedAt: '2026-08-18T00:00:00.000Z', sizeBytes: null, accessCode: 'demo-code-01', title: 'T', summary: '' },
    ],
  },
  {
    name: 'Agent files',
    items: [
      { id: 'ws1/report.pdf', name: 'report.pdf', kind: 'file', url: null, meta: 'ws1', modifiedAt: '2026-08-16T00:00:00.000Z', sizeBytes: 10, accessCode: '', title: 'T', summary: '' },
    ],
  },
];

describe('deliverableIds', () => {
  test('flattens every folder, in display order', () => {
    expect(deliverableIds(GROUPS)).toEqual(['proposal:vantage-proposal-dana', 'ws1/report.pdf']);
  });

  test('an empty board has no ids', () => {
    expect(deliverableIds([])).toEqual([]);
  });
});

describe('unseenDeliverableIds', () => {
  test('a browser that has never looked badges nothing — old content is not new', () => {
    expect(unseenDeliverableIds(deliverableIds(GROUPS), null)).toEqual([]);
  });

  test('something that arrived after the last look badges', () => {
    const seen = ['ws1/report.pdf'];
    expect(unseenDeliverableIds(deliverableIds(GROUPS), seen)).toEqual(['proposal:vantage-proposal-dana']);
  });

  test('nothing badges once everything has been seen', () => {
    expect(unseenDeliverableIds(deliverableIds(GROUPS), deliverableIds(GROUPS))).toEqual([]);
  });

  test('an id that disappeared cannot badge', () => {
    expect(unseenDeliverableIds([], ['gone'])).toEqual([]);
  });
});

describe('markSeen', () => {
  test('opening the tab clears the badge', () => {
    const ids = deliverableIds(GROUPS);
    const next = markSeen(['ws1/report.pdf'], ids);
    expect(unseenDeliverableIds(ids, next)).toEqual([]);
  });

  test('prunes ids that are gone, so the store cannot grow forever', () => {
    expect(markSeen(['old-1', 'old-2'], ['ws1/report.pdf'])).toEqual(['ws1/report.pdf']);
  });

  test('an empty list never wipes the store — a failed fetch looks like an empty board', () => {
    expect(markSeen(['ws1/report.pdf'], [])).toEqual(['ws1/report.pdf']);
  });
});

describe('parseSeen', () => {
  test('round-trips what markSeen writes', () => {
    const stored = markSeen(null, ['a', 'b']);
    expect(parseSeen(JSON.stringify(stored))).toEqual(['a', 'b']);
  });

  test('missing or corrupt storage reads as never-looked, so it can never badge falsely', () => {
    expect(parseSeen(null)).toBeNull();
    expect(parseSeen('{{{')).toBeNull();
    expect(parseSeen('{"nope":1}')).toBeNull();
  });

  test('drops non-string entries rather than trusting the blob', () => {
    expect(parseSeen('["a",7,null,"b"]')).toEqual(['a', 'b']);
  });
});

describe('the Deliverables surface wires both behaviours', () => {
  test('folders collapse and expand, and the state survives a reload', () => {
    const src = read('components/DeliverablesList.tsx');
    expect(src).toMatch(/Chevron/);
    expect(src).toContain('aria-expanded');
    // the shared constant, not a hand-typed key that could drift
    expect(src).toContain('DELIVERABLES_COLLAPSED_KEY');
    expect(DELIVERABLES_COLLAPSED_KEY).not.toBe(DELIVERABLES_SEEN_KEY);
  });

  test('the Deliverables tab carries an unread count that opening it clears', () => {
    const src = read('components/AgentsTabs.tsx');
    expect(src).toContain('unseenCount');
    expect(src).toContain('acknowledge');
  });

  test('the fetch is hoisted so the badge works without opening the tab', () => {
    const hook = read('components/useDeliverables.ts');
    expect(hook).toContain("'use client'");
    expect(hook).toContain('/api/board/deliverables');
    expect(hook).toContain('DELIVERABLES_SEEN_KEY');
    // AgentsTabs owns the data; the list renders what it is handed
    expect(read('components/AgentsTabs.tsx')).toContain('useDeliverables');
  });
});
