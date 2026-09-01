import { NextResponse } from 'next/server';
import { GATE_COOKIE } from '@/lib/access-gate';

/**
 * Per-route authentication for mutating API handlers.
 *
 * The access gate (middleware.ts) already fronts the whole app, but middleware
 * is a single perimeter: a misconfigured matcher, a rewrite, or a direct edge
 * invocation can bypass it. Every mutating route therefore calls requireSession()
 * first as defence in depth. The session is the same secret the gate issues —
 * the FOUNDER_OS_ACCESS_TOKEN carried in the GATE_COOKIE — read straight off the
 * incoming Request (works in the Next runtime AND in direct unit-test calls,
 * unlike next/headers which needs a request scope).
 */

function gateCookie(req: Request): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === GATE_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/**
 * True when the caller holds a valid session. Mirrors the access gate:
 * - token configured  → the gate cookie must match it.
 * - no token          → open ONLY outside production. In production an unset
 *   token means fail closed (and the process refuses to boot — see
 *   assertProductionAccessToken in lib/access-gate.ts).
 */
export function hasSession(req: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  const token = env.FOUNDER_OS_ACCESS_TOKEN?.trim();
  if (!token) return env.NODE_ENV !== 'production';
  return gateCookie(req) === token;
}

/** Guard for mutating handlers: `const gate = requireSession(req); if (gate) return gate;` */
export function requireSession(req: Request): Response | null {
  if (hasSession(req)) return null;
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}
