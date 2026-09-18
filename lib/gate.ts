/**
 * Demo gate predicate — pure and env-only (NO node imports) so it is safe to
 * pull into the Edge middleware bundle. The gate used to fire on
 * `process.env.VERCEL`, but Railway never sets that; it now keys on explicit
 * intent (DEMO_GATE) plus any known deployment platform. Local dev stays open.
 *
 *   DEMO_GATE=1  -> always gated  (set this on the Railway demo service)
 *   DEMO_GATE=0  -> never gated   (explicit escape hatch)
 *   otherwise    -> gated whenever a deployment platform is detected
 */
export function isGated(env: Record<string, string | undefined> = process.env): boolean {
  if (env.DEMO_GATE === '0') return false;
  if (env.DEMO_GATE === '1') return true;
  return !!(env.VERCEL || env.RAILWAY_ENVIRONMENT);
}
