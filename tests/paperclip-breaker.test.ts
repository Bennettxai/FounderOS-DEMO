import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { _resetPaperclipBreaker, paperclipAgents, paperclipStatus } from '@/lib/connectors/paperclip';

/**
 * Snappiness on the host (2026-09-14): the board connector sits in the render
 * path of home, org, brain, agents, funnel and integrations. When the board is
 * unreachable every one of those pages stalled a full 4s per request, even
 * warm, because each render re-ran the probe to its timeout. A dead board now
 * costs one probe per window: the first network failure opens a breaker and
 * every board read inside the window fails immediately.
 */

const timeoutError = () => {
  const e = new Error('The operation was aborted due to timeout');
  e.name = 'TimeoutError';
  return e;
};

describe('paperclip board breaker', () => {
  beforeEach(() => {
    process.env.PAPERCLIP_API_URL = 'http://board.invalid:3100';
    process.env.PAPERCLIP_BOARD_KEY = 'k';
    process.env.PAPERCLIP_COMPANY_ID = 'c1';
    _resetPaperclipBreaker();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.PAPERCLIP_API_URL;
    delete process.env.PAPERCLIP_BOARD_KEY;
    delete process.env.PAPERCLIP_COMPANY_ID;
  });

  test('a timed-out board is probed once, then fails fast for the rest of the window', async () => {
    const fetch = vi.fn().mockRejectedValue(timeoutError());
    vi.stubGlobal('fetch', fetch);
    const first = await paperclipStatus();
    const second = await paperclipStatus();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first.state).toBe('error');
    expect(second.state).toBe('error');
    expect(second.detail).toMatch(/unreachable/i);
  });

  test('a network failure is reported as unreachable, never as an empty board', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError()));
    const s = await paperclipStatus();
    expect(s.detail).not.toMatch(/returned no agents/);
    expect(s.detail).toMatch(/unreachable/i);
  });

  test('paperclipAgents returns [] immediately while the breaker is open', async () => {
    const fetch = vi.fn().mockRejectedValue(timeoutError());
    vi.stubGlobal('fetch', fetch);
    await paperclipAgents();
    await expect(paperclipAgents()).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('an HTTP error means the board is reachable and does not open the breaker', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal('fetch', fetch);
    await paperclipStatus();
    await paperclipStatus();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('the breaker closes after 30s and the board is probed again', async () => {
    const fetch = vi.fn().mockRejectedValue(timeoutError());
    vi.stubGlobal('fetch', fetch);
    await paperclipStatus();
    vi.advanceTimersByTime(29_000);
    await paperclipStatus();
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    await paperclipStatus();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('a success closes the breaker so a recovered board is read live again', async () => {
    const agents = [{ id: 'a1', name: 'Conductor', status: 'running', adapterType: 'claude_local', model: 'm' }];
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValue({ ok: true, status: 200, json: async () => agents });
    vi.stubGlobal('fetch', fetch);
    await paperclipStatus(); // opens
    vi.advanceTimersByTime(31_000);
    const s = await paperclipStatus(); // probes, succeeds
    expect(s.state).toBe('connected');
    await paperclipStatus();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
