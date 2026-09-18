import { afterEach, describe, expect, test, vi } from 'vitest';
import { ATTIO_TIMEOUT_MS, attioClients, attioStatus } from '@/lib/connectors/attio';

/**
 * The Attio cron kept going red with "Key found but query failed: The
 * operation was aborted due to timeout" while the key was fine the whole time
 * — /api/connections answered "reachable" minutes later, and client-onboarding
 * reported "Attio connected" in the same cron window.
 *
 * Timed against the endpoint, the call this connector makes (POST
 * objects/deals/records/query, a page of full deal records) is bimodal: well
 * under a second warm, a few seconds cold, against what used to be a 4000ms
 * budget. On a busy host, during a tick that runs agents back to back, a cold
 * call crosses the line. 4s was also the tightest budget in lib/connectors,
 * where the other connectors sit at 6-8s.
 *
 * So: 8s, plus one retry, because a transient network blip should not paint
 * the CRM as down for the rest of the day.
 */
const key = () => 'test-key';

function jsonOk(records: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: Array.from({ length: records }, () => ({ id: { record_id: 'r' }, values: {} })) }),
  } as unknown as Response;
}

/** How a fetch abort actually surfaces: a TimeoutError, not an HTTP status. */
function timeoutError() {
  const err = new Error('The operation was aborted due to timeout');
  err.name = 'TimeoutError';
  return err;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the budget matches the other heavy-payload connectors', () => {
  test('8s, not the old 4s', () => {
    expect(ATTIO_TIMEOUT_MS).toBeGreaterThanOrEqual(8000);
  });

  test('both callers share ONE timed request, so neither can drift back', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'lib/connectors/attio.ts'), 'utf8');
    expect(src).not.toContain('AbortSignal.timeout(4000)');
    // status and clients previously carried a duplicated fetch each, which is
    // how they came to hold the same wrong number twice.
    expect(src.match(/AbortSignal\.timeout\(/g)).toHaveLength(1);
    expect(src.match(/queryDeals\(key, \d+\)/g)).toHaveLength(2);
  });
});

describe('attioStatus retries a timeout once before declaring the CRM down', () => {
  test('a cold call that times out, then succeeds, reports connected', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(timeoutError()).mockResolvedValueOnce(jsonOk(50));
    vi.stubGlobal('fetch', fetchMock);

    const status = await attioStatus({ resolveKey: key });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(status.state).toBe('connected');
    expect(status.detail).toContain('50');
  });

  test('two timeouts in a row is a real outage, reported honestly', async () => {
    const fetchMock = vi.fn().mockRejectedValue(timeoutError());
    vi.stubGlobal('fetch', fetchMock);

    const status = await attioStatus({ resolveKey: key });
    expect(fetchMock).toHaveBeenCalledTimes(2); // one retry, not a loop
    expect(status.state).toBe('error');
    expect(status.detail).toMatch(/timeout/i);
    // the wording that told us the key was fine has to survive
    expect(status.detail).toContain('Key found');
  });

  test('an HTTP error is NOT retried: a scope problem will not fix itself', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403 } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const status = await attioStatus({ resolveKey: key });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(status.state).toBe('error');
    expect(status.detail).toContain('403');
  });

  test('a missing key still short-circuits before any network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const status = await attioStatus({ resolveKey: () => undefined });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(status.state).toBe('not_configured');
  });
});

describe('attioClients gets the same treatment', () => {
  test('the roster survives one timeout', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(timeoutError()).mockResolvedValueOnce(jsonOk(3));
    vi.stubGlobal('fetch', fetchMock);

    const result = await attioClients({ resolveKey: key });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.state).toBe('connected');
  });

  test('and reports error when the retry also times out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError()));
    const result = await attioClients({ resolveKey: key });
    expect(result.state).toBe('error');
    expect(result.clients).toEqual([]);
  });
});
