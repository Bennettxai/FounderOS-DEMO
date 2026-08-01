import { afterEach, describe, expect, it, vi } from 'vitest';
import { rafThrottle } from '@/lib/raf-throttle';

afterEach(() => vi.useRealTimers());

describe('rafThrottle', () => {
  it('coalesces multiple calls within a frame into a single invocation', () => {
    vi.useFakeTimers();
    let n = 0;
    const tick = rafThrottle(() => {
      n++;
    });
    tick();
    tick();
    tick();
    expect(n).toBe(0); // deferred, not synchronous
    vi.advanceTimersByTime(20);
    expect(n).toBe(1); // three rapid calls → one run
  });

  it('runs again on the next frame', () => {
    vi.useFakeTimers();
    let n = 0;
    const tick = rafThrottle(() => {
      n++;
    });
    tick();
    vi.advanceTimersByTime(20);
    tick();
    vi.advanceTimersByTime(20);
    expect(n).toBe(2);
  });
});
