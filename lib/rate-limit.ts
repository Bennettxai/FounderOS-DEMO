/**
 * In-memory fixed-window rate limiter. Sufficient for the single-replica deploy
 * (numReplicas:1 in railway.json); if that ever scales out, swap the Map for a
 * shared store (Redis/Upstash) behind the same interface.
 *
 * Each call increments the window's counter, so callers checking several limits
 * (per-recipient, global, daily) fail slightly conservatively — which is the
 * safe direction for an abuse control.
 */
export type RateVerdict = { ok: true } | { ok: false; retryAfter: number };

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateVerdict {
  const w = windows.get(key);
  if (!w || now >= w.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (w.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
  }
  w.count += 1;
  return { ok: true };
}

/** A 429 Response carrying Retry-After, for a failed verdict. */
export function tooManyRequests(retryAfter: number): Response {
  return new Response(JSON.stringify({ error: 'rate limit exceeded' }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': String(retryAfter) },
  });
}

/** Test seam — clears all windows. */
export function __resetRateLimits(): void {
  windows.clear();
}
