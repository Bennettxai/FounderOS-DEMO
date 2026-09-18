import { describe, expect, test } from 'vitest';
import {
  CARRY_MAX_DAYS,
  READ_RETENTION_DAYS,
  buildDigest,
  entryKey,
  stackDigest,
  type DigestContext,
  type DigestEntry,
} from '@/lib/comms-digest';
import type { CommsItem } from '@/lib/comms';

/**
 * The morning report BUILDS UP instead of resetting.
 *
 * the operator, 2026-08-19: "if I don't clear out all of the people in that report,
 * I want you to stack the new report on top of the old one. I don't want it to
 * clear out every day in a new report."
 *
 * Before this, buildDigest only ever looked at a 24-hour window, so anyone he
 * had not answered simply fell off the bottom the next morning — the report
 * quietly forgot the exact people it existed to chase. Now an entry leaves the
 * report for one reason only: he cleared it.
 */
const NOW = Date.parse('2026-08-19T09:00:00.000Z');
const HOUR = 3600_000;
const DAY = 24 * HOUR;

const ctx = (over: Partial<DigestContext> = {}): DigestContext => ({
  meetingTitles: [],
  clientNames: [],
  students: [],
  family: [],
  now: NOW,
  ...over,
});

const item = (over: Partial<CommsItem>): CommsItem => ({
  source: 'email',
  title: 'Subject',
  preview: 'body text',
  ts: new Date(NOW - HOUR).toISOString(),
  sender: 'someone@example.com',
  ...over,
});

const entry = (over: Partial<DigestEntry>): DigestEntry => ({
  tier: 'people',
  rank: 2,
  reason: 'tagged',
  source: 'email',
  sender: 'old@example.com',
  title: 'Yesterday',
  preview: 'still waiting on you',
  ts: new Date(NOW - 2 * DAY).toISOString(),
  ...over,
});

describe('stackDigest — yesterday rides along until it is cleared', () => {
  const fresh = () => buildDigest([item({ sender: 'new@example.com' })], ctx());

  test('an uncleared entry from an older report survives into this one', () => {
    const yesterday = entry({ sender: 'unanswered@example.com' });
    const out = stackDigest(fresh(), [yesterday], [], NOW);

    const senders = out.entries.map((e) => e.sender);
    expect(senders).toContain('new@example.com');
    expect(senders).toContain('unanswered@example.com');
    expect(out.total).toBe(2);
  });

  test('an entry he cleared does NOT come back', () => {
    const done = entry({ sender: 'answered@example.com' });
    const out = stackDigest(fresh(), [done], [entryKey(done)], NOW);

    expect(out.entries.map((e) => e.sender)).not.toContain('answered@example.com');
    expect(out.total).toBe(1);
  });

  test('the same message arriving in both reports is not duplicated', () => {
    // the 24h window and yesterday's report genuinely overlap
    const overlap = item({ sender: 'overlap@example.com', ts: new Date(NOW - 2 * HOUR).toISOString() });
    const today = buildDigest([overlap], ctx());
    const asCarried = entry({ sender: 'overlap@example.com', ts: overlap.ts });

    const out = stackDigest(today, [asCarried], [], NOW);
    expect(out.entries.filter((e) => e.sender === 'overlap@example.com')).toHaveLength(1);
    // and the surviving copy is the fresh one, not the stale carried record
    expect(out.entries[0].carried).toBeFalsy();
  });

  test('new sits on top of held-over inside the same tier', () => {
    const out = stackDigest(
      buildDigest([item({ sender: 'new@example.com', ts: new Date(NOW - 6 * HOUR).toISOString() })], ctx()),
      [entry({ sender: 'old@example.com' })],
      [],
      NOW,
    );
    const people = out.entries.filter((e) => e.tier === 'people' || e.tier === 'noise');
    expect(people[0].sender).toBe('new@example.com');
    expect(out.entries.find((e) => e.sender === 'old@example.com')?.carried).toBe(true);
  });

  test('tier still outranks freshness: a carried client beats a new group chat', () => {
    const today = buildDigest(
      [item({ source: 'whatsapp', sender: 'Some Group', title: 'Group chat', preview: 'lol' })],
      ctx(),
    );
    const client = entry({ tier: 'client', rank: 1, sender: 'bigclient@example.com' });
    const out = stackDigest(today, [client], [], NOW);
    expect(out.entries[0].sender).toBe('bigclient@example.com');
  });

  test('a carried entry records when it first showed up, and keeps it', () => {
    const first = entry({ sender: 'chaser@example.com' });
    const once = stackDigest(fresh(), [first], [], NOW);
    const carried = once.entries.find((e) => e.sender === 'chaser@example.com')!;
    expect(carried.firstSeenAt).toBe(first.ts);

    // carried a second time, the original date must not drift to today
    const twice = stackDigest(fresh(), once.entries, [], NOW + DAY);
    expect(twice.entries.find((e) => e.sender === 'chaser@example.com')?.firstSeenAt).toBe(first.ts);
  });

  test('counts, total and needsReply describe the STACKED report', () => {
    const out = stackDigest(fresh(), [entry({ tier: 'client', rank: 1 })], [], NOW);
    expect(out.total).toBe(out.entries.length);
    expect(out.counts.client).toBe(1);
    expect(out.needsReply).toBe(
      out.entries.filter((e) => ['call', 'client', 'people', 'branddeal'].includes(e.tier)).length,
    );
  });

  test('the backlog cannot grow forever: nothing older than the carry window', () => {
    const ancient = entry({ sender: 'ancient@example.com', ts: new Date(NOW - (CARRY_MAX_DAYS + 1) * DAY).toISOString() });
    const recent = entry({ sender: 'recent@example.com', ts: new Date(NOW - 2 * DAY).toISOString() });
    const out = stackDigest(fresh(), [ancient, recent], [], NOW);

    expect(out.entries.map((e) => e.sender)).not.toContain('ancient@example.com');
    expect(out.entries.map((e) => e.sender)).toContain('recent@example.com');
  });

  test('an empty morning still shows the backlog rather than an empty report', () => {
    const nothingNew = buildDigest([], ctx());
    const out = stackDigest(nothingNew, [entry({ sender: 'waiting@example.com' })], [], NOW);
    expect(out.total).toBe(1);
    expect(out.entries[0].sender).toBe('waiting@example.com');
  });
});

describe('cleared keys must outlive what they clear', () => {
  test('read keys are kept longer than an entry can be carried', () => {
    // If a read key were pruned while its entry could still be carried, the
    // entry would come back from the dead the next morning, already answered.
    expect(READ_RETENTION_DAYS).toBeGreaterThan(CARRY_MAX_DAYS);
  });

  test('the read route prunes on that constant, not a hand-written 7 days', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'app/api/comms/digest/read/route.ts'), 'utf8');
    expect(src).toContain('READ_RETENTION_DAYS');
    expect(src).not.toMatch(/7 \* 86_400_000/);
  });
});

describe('the stored payload is what the next morning reads back', () => {
  test('a round trip through comms_digests preserves the entries and their carry flags', async () => {
    const { openDb } = await import('@/lib/db');
    const db = openDb(':memory:');

    const stacked = stackDigest(
      buildDigest([item({ sender: 'new@example.com' })], ctx()),
      [entry({ sender: 'held@example.com' })],
      [],
      NOW,
    );
    // exactly the shape lib/comms-digest-run.ts persists
    db.commsDigests.insert({
      id: 'd1',
      generatedAt: stacked.generatedAt,
      payload: JSON.stringify({ digest: stacked, sources: [] }),
    });

    const back = db.commsDigests.latest()!;
    const entries = (JSON.parse(back.payload) as { digest: { entries: DigestEntry[] } }).digest.entries;
    db.close();

    expect(entries.map((e) => e.sender)).toEqual(['new@example.com', 'held@example.com']);
    const held = entries.find((e) => e.sender === 'held@example.com')!;
    expect(held.carried).toBe(true);
    expect(held.firstSeenAt).toBeTruthy();
    // and it can be carried AGAIN from what was read back
    const next = stackDigest(buildDigest([], ctx()), entries, [], NOW);
    expect(next.entries.map((e) => e.sender)).toContain('held@example.com');
  });
});

describe('the collapsed report is a clean single bar', () => {
  test('the header rule only exists when something is open below it', async () => {
    // the operator, 2026-08-19: the line was "going too far on the bottom of morning
    // report". The header's border-b was unconditional, so when the panel is
    // collapsed that straight rule sat on the section's own rounded bottom edge
    // and ran out past the curve at both corners.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'components/CommsDigestPanel.tsx'), 'utf8');
    expect(src).not.toMatch(/gap-y-1 border-b border-os-border px-4/);
    expect(src).toMatch(/open \? 'border-b border-os-border' : ''/);
  });
});
