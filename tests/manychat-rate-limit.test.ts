import { describe, expect, test, vi } from 'vitest';
import { MANYCHAT_STATUS_TTL_MS, manychatStatus } from '@/lib/connectors/manychat';

/**
 * ManyChat enforces a strict daily request cap, and exceeding it blocks EVERY
 * request for 24 hours — losing DM sending, not just this status badge. The
 * status check is called from the connections board, so it fires on page views
 * as well as the 15-minute refresh sweep.
 *
 * the operator's call (2026-08-14): everything else stays at 15 minutes, ManyChat
 * goes to 3 hours. That is enforced by the cache TTL, not by the caller, so no
 * amount of page refreshing can run the account into the cap.
 */

const env = { MANYCHAT_API_KEY: `test-key-${Math.random()}` };

const okResponse = () =>
  ({ ok: true, json: async () => ({ data: { name: 'the operator', username: 'founder', is_pro: true } }) }) as Response;

describe('manychat status caching', () => {
  test('is capped at 3 hours, not the old 60 seconds', () => {
    expect(MANYCHAT_STATUS_TTL_MS).toBe(3 * 60 * 60 * 1000);
  });

  test('a second check inside the window does not touch the API again', async () => {
    const key = { MANYCHAT_API_KEY: `unique-${Math.random()}` };
    const doFetch = vi.fn(async () => okResponse());

    const first = await manychatStatus(key, doFetch as unknown as typeof fetch);
    const second = await manychatStatus(key, doFetch as unknown as typeof fetch);

    expect(first.state).toBe('connected');
    expect(second.state).toBe('connected');
    expect(doFetch).toHaveBeenCalledTimes(1);
  });

  test('a missing key never calls out at all', async () => {
    const doFetch = vi.fn(async () => okResponse());
    const s = await manychatStatus({}, doFetch as unknown as typeof fetch);
    expect(s.state).toBe('not_configured');
    expect(doFetch).not.toHaveBeenCalled();
  });

  test('a failure is cached too, so an outage cannot hammer the cap', async () => {
    const key = { MANYCHAT_API_KEY: `fail-${Math.random()}` };
    const doFetch = vi.fn(async () => ({ ok: false, status: 429 }) as Response);

    const first = await manychatStatus(key, doFetch as unknown as typeof fetch);
    const second = await manychatStatus(key, doFetch as unknown as typeof fetch);

    expect(first.state).toBe('error');
    expect(second.state).toBe('error');
    expect(doFetch).toHaveBeenCalledTimes(1);
  });
});

void env;

/**
 * the host's connections board reported ManyChat as
 * "Key set but API check failed: The operation was aborted due to timeout"
 * on 2026-09-09 while the key was fine (the same account answered
 * getInfo through the MCP in the same minute). 6000ms was the budget.
 *
 * This is the Attio failure again (4f4696c): a connector on the tightest
 * clock in lib/connectors, probed from a box that runs agents back to back,
 * reporting a slow answer as a broken key. That fix is the precedent here:
 * an 8s budget, and one retry on a TRANSIENT failure only.
 *
 * The retry cannot reopen the rate-limit hole the operator closed on 2026-08-14.
 * An HTTP status is an answer, so a 429 or a 401 is never retried, and the
 * 3-hour cache still caps the whole thing at two requests per window in the
 * worst case rather than one per page view.
 */
describe('manychat status budget', () => {
  test('8 seconds, matching paperclip / docusign / payments and Attio', async () => {
    const { MANYCHAT_TIMEOUT_MS } = await import('@/lib/connectors/manychat');
    expect(MANYCHAT_TIMEOUT_MS).toBe(8000);
  });

  test('a timeout is retried once, so one slow moment is not a broken key', async () => {
    const key = { MANYCHAT_API_KEY: `slow-${Math.random()}` };
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
    let call = 0;
    const doFetch = vi.fn(async () => {
      call += 1;
      if (call === 1) throw timeout;
      return okResponse();
    });

    const s = await manychatStatus(key, doFetch as unknown as typeof fetch);
    expect(s.state).toBe('connected');
    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  test('an HTTP answer is never retried — a 429 stays a 429, and the cap stays shut', async () => {
    const key = { MANYCHAT_API_KEY: `capped-${Math.random()}` };
    const doFetch = vi.fn(async () => ({ ok: false, status: 429 }) as Response);

    const s = await manychatStatus(key, doFetch as unknown as typeof fetch);
    expect(s.state).toBe('error');
    expect(doFetch).toHaveBeenCalledTimes(1);
  });

  test('two transient failures give up rather than looping', async () => {
    const key = { MANYCHAT_API_KEY: `down-${Math.random()}` };
    const doFetch = vi.fn(async () => {
      throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    });

    const s = await manychatStatus(key, doFetch as unknown as typeof fetch);
    expect(s.state).toBe('error');
    expect(doFetch).toHaveBeenCalledTimes(2);
  });
});
