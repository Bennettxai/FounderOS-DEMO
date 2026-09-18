import { describe, expect, test } from 'vitest';
import { classifyDeliverable, needsYou, APPROVAL_KINDS } from '@/lib/board-approvals';

/**
 * The operator needs to approve the tasks agents want input on.
 *
 * The agents ALREADY say which files need a decision — they name them. Left in
 * one flat Deliverables list, a staged reply waiting to be sent looks exactly
 * like a finished audit, so the rows with a name on them are invisible.
 *
 * The vocabulary is the agents', in the shape they write it:
 *   STAGED-note-42-COMMENT.json                       written, awaiting send
 *   STAGED-precall-DELIVER-BEFORE-1430Z.json          ... with a deadline
 *   sample-mentorship-decision-2026-08-20.md          a call to make
 *   newsletter-send-api-plan-gate-2026-08-20.md       a gate to open
 *   sample-cancellation-request-2026-08-20.md         a request
 *   newsletter-cohort2-launch-draft-2026-08-20.md     a draft to approve
 *   sample-refund-UNBLOCKED-2026-08-20.md             finished, FYI
 *   sample-2025-12-08-RESOLVED.json                   finished, FYI
 */
const f = (name: string, over: Partial<{ modifiedAt: string }> = {}) => ({
  id: `ws/${name}`,
  name,
  kind: 'file' as const,
  url: null,
  meta: 'ws',
  sizeBytes: 100,
  modifiedAt: over.modifiedAt ?? '2026-08-20T23:00:00.000Z',
  accessCode: '',
  title: name,
  summary: '',
});

describe('classifyDeliverable — the agents name what they need', () => {
  test('a staged artefact is waiting on him to send it', () => {
    const c = classifyDeliverable(f('STAGED-note-42-COMMENT.json'));
    expect(c.ask).toBe('staged');
    expect(c.needsYou).toBe(true);
  });

  test('STAGED is recognised mid-name too, not just as a prefix', () => {
    expect(classifyDeliverable(f('outbound-reply-STAGED-uid41.txt')).ask).toBe('staged');
  });

  test.each([
    ['sample-mentorship-decision-2026-08-20.md', 'decision'],
    ['newsletter-send-api-plan-gate-2026-08-20.md', 'gate'],
    ['sample-cancellation-request-2026-08-20.md', 'request'],
    ['newsletter-cohort2-launch-draft-2026-08-20.md', 'draft'],
  ])('%s is a %s awaiting him', (name, kind) => {
    const c = classifyDeliverable(f(name));
    expect(c.ask).toBe(kind);
    expect(c.needsYou).toBe(true);
  });

  test.each([
    'sample-refund-UNBLOCKED-2026-08-20.md',
    'sample-2025-12-08-RESOLVED.json',
  ])('%s is finished work, not a request', (name) => {
    const c = classifyDeliverable(f(name));
    expect(c.needsYou).toBe(false);
    expect(c.ask).toBe('done');
  });

  test('a plain output file is reference, and never nags him', () => {
    const c = classifyDeliverable(f('paykit-customers-2026-08-20.json'));
    expect(c.needsYou).toBe(false);
    expect(c.ask).toBe('output');
  });

  test('DONE markers beat action markers: a resolved request is resolved', () => {
    // otherwise 'sample-refund-request-RESOLVED.md' would nag forever
    const c = classifyDeliverable(f('sample-refund-request-RESOLVED-2026-08-20.md'));
    expect(c.needsYou).toBe(false);
  });
});

describe('deadlines the agents wrote into the filename', () => {
  test('DELIVER-BEFORE-1430Z is parsed against the file date', () => {
    const c = classifyDeliverable(f('STAGED-precall-DELIVER-BEFORE-1430Z.json', {
      modifiedAt: '2026-08-20T05:55:00.000Z',
    }));
    expect(c.needsYou).toBe(true);
    expect(c.deadline).toBe('2026-08-20T14:30:00.000Z');
  });

  test('no deadline marker means no deadline, not a wrong one', () => {
    expect(classifyDeliverable(f('newsletter-send-api-plan-gate-2026-08-20.md')).deadline).toBeNull();
  });

  test('a passed deadline is flagged overdue against a supplied now', () => {
    const c = classifyDeliverable(
      f('STAGED-x-DELIVER-BEFORE-1430Z.json', { modifiedAt: '2026-08-20T05:55:00.000Z' }),
      Date.parse('2026-08-20T18:00:00.000Z'),
    );
    expect(c.overdue).toBe(true);
  });
});

describe('needsYou — the queue itself', () => {
  const files = [
    f('STAGED-a-COMMENT.json', { modifiedAt: '2026-08-20T21:29:00.000Z' }),
    f('b-decision-2026-08-20.md', { modifiedAt: '2026-08-20T22:25:00.000Z' }),
    f('c-UNBLOCKED-2026-08-20.md', { modifiedAt: '2026-08-20T23:29:00.000Z' }),
    f('d-customers.json', { modifiedAt: '2026-08-20T21:45:00.000Z' }),
    f('e-DELIVER-BEFORE-0900Z.json', { modifiedAt: '2026-08-20T05:00:00.000Z' }),
  ];

  test('only the ones with his name on them make the queue', () => {
    const q = needsYou(files, Date.parse('2026-08-20T23:59:00.000Z'));
    // Mock 3a changed this order on purpose: the queue is now ranked by the
    // Conductor, people first, then deadlines (see tests/needs-you-conductor).
    // The staged reply is the oldest file here and still comes second, because
    // someone is sitting on the other end of it waiting for an answer.
    expect(q.map((i) => i.name)).toEqual([
      'e-DELIVER-BEFORE-0900Z.json', // overdue first, regardless of age
      'STAGED-a-COMMENT.json', // then the one a person is waiting on
      'b-decision-2026-08-20.md', // then work that is only paused
    ]);
  });

  test('overdue leads, then people — an old blown deadline outranks everything', () => {
    const q = needsYou(files, Date.parse('2026-08-20T23:59:00.000Z'));
    expect(q[0].overdue).toBe(true);
    expect(q[1].person).toBe(true);
    expect(q[2].person).toBe(false);
    // and the person row really is the older one, so this is rank, not recency
    expect(q[1].modifiedAt < q[2].modifiedAt).toBe(true);
  });

  test('an empty board yields an empty queue, never a crash', () => {
    expect(needsYou([], Date.now())).toEqual([]);
  });

  test('every kind is one of the declared kinds', () => {
    for (const file of files) {
      expect(APPROVAL_KINDS).toContain(classifyDeliverable(file).ask);
    }
  });
});

describe('the Needs You tab is wired to the same payload as Deliverables', () => {
  const read = (p: string) =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('node:fs').readFileSync(require('node:path').join(process.cwd(), p), 'utf8');

  test('the tab exists and carries its own count badge', () => {
    const src = read('components/AgentsTabs.tsx');
    expect(src).toContain("'needsyou'");
    expect(src).toContain('Needs You');
    // the waiting badge is NOT the unread badge: looking must not clear it
    expect(src).toContain('waiting > 0');
    expect(src).not.toMatch(/tab === 'needsyou' && waiting > 0\) acknowledge/);
  });

  test('it derives from the deliverables payload, it does not poll separately', () => {
    const src = read('components/NeedsYouList.tsx');
    expect(src).toContain('needsYou(files)');
    expect(src).not.toContain('fetch(');
    expect(src).not.toContain('setInterval');
  });

  /**
   * This rule used to read "every row links to the real file rather than a dead
   * Approve button", and forbade the word approve outright. The intent was that
   * an approval must never be decorative, and that intent still stands. What
   * changed is that approving is now real rather than absent.
   *
   * The old affordance was a link to `?file=`, which the route serves as
   * `Content-Disposition: attachment` — so every click downloaded the file
   * instead of showing it, and nothing was ever readable in place.
   */
  test('a row opens the review panel instead of downloading the file', () => {
    const src = read('components/NeedsYouList.tsx');
    expect(src).toContain('onOpen(c)');
    expect(src).not.toContain('/api/board/deliverables?file=');
  });

  test('approve and dismiss are wired to a real endpoint, not decorative', () => {
    const panel = read('components/TaskReviewPanel.tsx');
    expect(panel).toMatch(/>\s*approve\s*</i);
    expect(panel).toContain("onDecide(item.id, 'approved'");
    expect(panel).toContain("onDecide(item.id, 'dismissed'");
    // The button is only honest if something persists the call.
    expect(read('components/useDeliverables.ts')).toContain(
      '/api/board/deliverables/decision',
    );
  });
});
