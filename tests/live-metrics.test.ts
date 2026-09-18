import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// The DB path and the brain provider are both read at first access inside the
// module under test, so they must be pinned before it is imported. The stub
// brain provider carries no page count, which is exactly the "source cannot
// answer" case these tests want to see reported honestly.
beforeAll(() => {
  process.env.FOUNDER_OS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'founder-os-metrics-')), 'test.db');
  process.env.BRAIN_PROVIDER = 'stub';
});

/** No creds of any kind — every network-backed source must decline to answer. */
const NO_CREDS: Record<string, string | undefined> = {};

const byKey = <T extends { key: string }>(metrics: T[], key: string): T => {
  const found = metrics.find((m) => m.key === key);
  if (!found) throw new Error(`no metric ${key}`);
  return found;
};

describe('liveMetrics', () => {
  test('an unreadable source reports null, never a zero', async () => {
    const { liveMetrics } = await import('@/lib/live-metrics');
    const metrics = await liveMetrics(NO_CREDS);

    for (const key of ['unread_total', 'stripe_available', 'brain_pages']) {
      const metric = byKey(metrics, key);
      expect(metric.value, `${key} must not fabricate a number`).toBeNull();
      expect(metric.live).toBe(false);
    }
  });

  test('each declining source explains itself in place of the number', async () => {
    const { liveMetrics } = await import('@/lib/live-metrics');
    const metrics = await liveMetrics(NO_CREDS);

    expect(byKey(metrics, 'unread_total').source).toMatch(/no inbox configured/i);
    expect(byKey(metrics, 'stripe_available').source).toMatch(/STRIPE_SECRET_KEY/);
    expect(byKey(metrics, 'brain_pages').source).toMatch(/stub/);
  });

  test('a genuinely measured zero stays live — it is an answer, not a gap', async () => {
    const { liveMetrics } = await import('@/lib/live-metrics');
    const runs = byKey(await liveMetrics(NO_CREDS), 'agent_runs');

    // The seed writes ~300 fabricated `seed-run-*` rows so /agents looks alive
    // on a fresh clone. None of them is work this machine did, so the true
    // count here is zero — and zero must stay live. Collapsing it into
    // "pending" would be the same lie as the seeded zeros, pointed the other
    // way; counting the seeded rows would be the original lie, inflated.
    expect(runs.value).toBe(0);
    expect(runs.live).toBe(true);
  });

  test('seeded demo runs are never counted as work done', async () => {
    const { getDb } = await import('@/lib/data');
    // The seed really did populate the table — this is not an empty-DB artefact.
    expect(getDb().agentRuns.count()).toBeGreaterThan(100);
    expect(getDb().agentRuns.countReal()).toBe(0);
  });

  test('one dead source does not take the others down with it', async () => {
    const { liveMetrics } = await import('@/lib/live-metrics');
    const metrics = await liveMetrics(NO_CREDS);

    expect(metrics).toHaveLength(4);
    // Stripe and the inboxes are unreachable here, yet the local run count is
    // still measured and returned.
    expect(metrics.filter((m) => m.live).map((m) => m.key)).toEqual(['agent_runs']);
  });

  test('reads a real count back out of the run log', async () => {
    const { getDb } = await import('@/lib/data');
    const { liveMetrics } = await import('@/lib/live-metrics');
    getDb().agentRuns.insert({
      id: 'run-live-metrics-1',
      agentId: 'agent-test',
      startedAt: '2026-08-19T08:00:00.000Z',
      finishedAt: '2026-08-19T08:00:04.000Z',
      ok: true,
      summary: 'counted by the metrics endpoint',
    });

    const runs = byKey(await liveMetrics(NO_CREDS), 'agent_runs');
    expect(runs.value).toBe(1);
    expect(runs.live).toBe(true);
  });
});

describe('GET /api/metrics', () => {
  test('serves the live sweep and names what it could not read', async () => {
    const { GET } = await import('@/app/api/metrics/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.metrics).toHaveLength(4);
    // The seeded four are gone: no metric may carry the old "pending creds"
    // caption while also claiming a value.
    for (const metric of body.metrics) {
      if (metric.value !== null) expect(metric.live).toBe(true);
      else expect(metric.live).toBe(false);
    }

    // Whatever the ambient environment can reach, the split must account for
    // all four and give a reason for every gap.
    expect(body.live.length + body.pending.length).toBe(4);
    for (const gap of body.pending) expect(gap.reason).toBeTruthy();
  });
});
