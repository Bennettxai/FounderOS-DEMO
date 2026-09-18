import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * PKCE + a signed `state`, the two pieces that make an authorization-code flow
 * safe to run from a box the provider cannot call back into directly.
 *
 * The verifier never leaves this server: the browser carries only its S256
 * challenge on the way out, and the verifier rides back inside the signed
 * state so the callback can finish the exchange without a session store. That
 * matters here because the OS runs single-user on a private network with no session
 * layer to hang a pending-authorization record on.
 */

const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

const b64url = (b: Buffer): string => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** RFC 7636 code verifier: 43-128 chars from the unreserved set. */
export function newVerifier(length = 64): string {
  const n = Math.min(128, Math.max(43, length));
  const bytes = randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i += 1) out += UNRESERVED[bytes[i] % UNRESERVED.length];
  return out;
}

/** S256 challenge for a verifier. Deterministic, base64url, unpadded. */
export function challengeFor(verifier: string): string {
  return b64url(createHash('sha256').update(verifier).digest());
}

export type OAuthState = {
  slug: string;
  verifier: string;
  nonce: string;
  issuedAt: number;
};

/** A fresh state for one authorization attempt. */
export function newState(slug: string, verifier: string): OAuthState {
  return { slug, verifier, nonce: b64url(randomBytes(12)), issuedAt: Date.now() };
}

/**
 * `<payload>.<hmac>` — the provider echoes this back verbatim, so it is the
 * only thing tying a callback to a start we actually made.
 */
export function signState(state: OAuthState, secret: string): string {
  const payload = b64url(Buffer.from(JSON.stringify(state), 'utf8'));
  const mac = b64url(createHmac('sha256', secret).update(payload).digest());
  return `${payload}.${mac}`;
}

/** The inverse, returning null on any tamper, truncation or garbage. */
export function verifyState(signed: string, secret: string, maxAgeMs = 10 * 60_000): OAuthState | null {
  const dot = signed.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = signed.slice(0, dot);
  const mac = signed.slice(dot + 1);
  const want = b64url(createHmac('sha256', secret).update(payload).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const raw = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as OAuthState;
    if (typeof raw?.slug !== 'string' || typeof raw?.verifier !== 'string') return null;
    // An authorization the user abandoned half an hour ago is not one we finish.
    if (!Number.isFinite(raw.issuedAt) || Date.now() - raw.issuedAt > maxAgeMs) return null;
    return raw;
  } catch {
    return null;
  }
}
