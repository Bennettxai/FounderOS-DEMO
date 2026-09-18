/**
 * Production access gate, pure logic (middleware.ts is the thin edge wrapper).
 *
 * Deployed FounderOS instances live on public URLs (Railway hands out
 * *.up.railway.app). Set FOUNDER_OS_ACCESS_TOKEN and every request must
 * present the token once (?token=… or the challenge form); a cookie remembers
 * the browser after that. Leave it unset OUTSIDE production and the gate stays
 * open — local dev and the read-only demo deployment are unaffected. In
 * production an unset token fails closed (challenge), and the server refuses to
 * boot at all (assertProductionAccessToken) so a public deployment can never
 * come up wide open.
 */

export const GATE_COOKIE = 'founder_os_access';

export type GateDecision =
  | { kind: 'open' } // no token configured, non-production — gate disabled
  | { kind: 'pass' } // cookie already carries the token
  | { kind: 'set-cookie'; value: string } // correct ?token= — set cookie, clean the URL
  | { kind: 'challenge' }; // everything else — show the token form

export function gateDecision(input: {
  token: string | undefined;
  cookie: string | null;
  queryToken: string | null;
  isProduction?: boolean;
}): GateDecision {
  const token = input.token?.trim();
  if (!token) {
    // Fail CLOSED in production: an unset token must never leave a public
    // deployment open. Outside production the gate is disabled as before.
    return input.isProduction ? { kind: 'challenge' } : { kind: 'open' };
  }
  // fresh correct query token wins even over a stale cookie
  if (input.queryToken === token) return { kind: 'set-cookie', value: token };
  if (input.cookie === token) return { kind: 'pass' };
  return { kind: 'challenge' };
}

/**
 * Refuse to boot a production server without an access token. Called once at
 * startup from instrumentation.ts. In production an unset token can only ever
 * serve the challenge page (fail closed) — an unusable, misconfigured state —
 * so we stop the process rather than ship a locked-out (or, on any regression,
 * wide-open) OS.
 */
export function assertProductionAccessToken(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production' && !env.FOUNDER_OS_ACCESS_TOKEN?.trim()) {
    throw new Error(
      'FOUNDER_OS_ACCESS_TOKEN must be set in production — refusing to boot without the access gate.',
    );
  }
}

/** Self-contained challenge page: no app chrome, no data, just the form. */
export function challengePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>FounderOS · Private</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0a0a0a; color:#f5f5f5; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .card { text-align:center; padding:40px; }
  .mark { font-size:13px; font-weight:700; letter-spacing:.3em; text-transform:uppercase; }
  .mark b { color:#EF4444; }
  p { font-size:12px; color:#8a8a8a; margin:14px 0 22px; }
  input { background:#141414; border:1px solid #2a2a2a; color:#f5f5f5; padding:10px 12px;
          font:inherit; font-size:13px; width:240px; outline:none; }
  input:focus { border-color:#EF4444; }
  button { background:#EF4444; border:0; color:#fff; padding:10px 18px; font:inherit;
           font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; cursor:pointer; }
</style>
</head>
<body>
  <div class="card">
    <div class="mark"><b>F</b>OUNDER OS</div>
    <p>This OS is private. Enter your access token.</p>
    <form method="GET" action="/">
      <input name="token" type="password" placeholder="access token" autofocus>
      <button type="submit">Unlock</button>
    </form>
  </div>
</body>
</html>`;
}
