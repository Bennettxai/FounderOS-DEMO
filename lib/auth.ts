/**
 * Access control for the whole surface.
 *
 * Founder OS is a single-operator system: there are no user accounts, and the
 * data model has no tenancy. So authentication here is not "who are you" but
 * "is this instance yours" — one shared token, checked once, in front of
 * everything. Putting it in middleware rather than in each route means a new
 * route is protected the moment it exists, instead of the moment someone
 * remembers to guard it.
 *
 * The local demo stays zero-config: with no token set, a development server
 * serves normally. A production server with no token set refuses to serve at
 * all rather than quietly exposing Stripe keys and inbox passwords — a missing
 * secret should fail loudly, not fail open.
 */

export const SESSION_COOKIE = 'founder_os_session';
export const ACCESS_TOKEN_ENV = 'FOUNDER_OS_ACCESS_TOKEN';

export type AuthDecision =
  { kind: 'allow' } | { kind: 'unauthorized' } | { kind: 'misconfigured'; detail: string };

export type AuthInput = {
  /** Value of FOUNDER_OS_ACCESS_TOKEN, if any. */
  token: string | undefined;
  /** Presented credential: session cookie or `Authorization: Bearer …`. */
  presented: string | undefined;
  /** True when running a production build (NODE_ENV === 'production'). */
  isProduction: boolean;
};

/**
 * Constant-time string comparison. `===` returns as soon as two bytes differ,
 * which leaks the shared secret one character at a time to anyone willing to
 * measure. Middleware runs on the edge runtime, so node:crypto's
 * timingSafeEqual is unavailable and this is written by hand.
 */
export function safeEqual(a: string, b: string): boolean {
  // Length is not secret (the operator chose it) but must not short-circuit the
  // loop, so compare over a fixed span and fold the length difference in.
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Pull a bearer credential out of an Authorization header, if present. */
export function bearerFrom(header: string | null | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : undefined;
}

export function decideAccess({ token, presented, isProduction }: AuthInput): AuthDecision {
  const configured = token?.trim() ?? '';

  if (configured.length === 0) {
    // No token configured. Fine on a laptop; never fine once deployed.
    if (isProduction) {
      return {
        kind: 'misconfigured',
        detail: `${ACCESS_TOKEN_ENV} is not set. A deployed Founder OS holds live payment and inbox credentials, so it refuses to serve without one. Generate a token (\`openssl rand -hex 32\`) and set it in your host's environment.`,
      };
    }
    return { kind: 'allow' };
  }

  if (configured.length < 16) {
    return {
      kind: 'misconfigured',
      detail: `${ACCESS_TOKEN_ENV} must be at least 16 characters. Generate one with \`openssl rand -hex 32\`.`,
    };
  }

  if (presented && safeEqual(presented, configured)) return { kind: 'allow' };
  return { kind: 'unauthorized' };
}

/**
 * Paths served before the token check.
 *
 * - `/unlock` is where an operator exchanges the token for a session cookie, so
 *   gating it would lock everyone out.
 * - The ManyChat webhook is machine-to-machine: ManyChat cannot present the
 *   operator's token, and that route already authenticates itself with
 *   MANYCHAT_WEBHOOK_SECRET.
 */
const PUBLIC_PATHS = ['/unlock', '/api/unlock', '/api/webhooks'];

export function isPublicPath(pathname: string): boolean {
  // Exact match, or a full segment beneath it. A bare `startsWith` would also
  // open `/unlocked-secrets`, which is the sort of gap a gate cannot afford.
  return PUBLIC_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}
