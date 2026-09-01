/**
 * Runs once at server startup (Next `instrumentation` hook). Enforces the
 * production access-gate invariant: a public deployment must never boot without
 * FOUNDER_OS_ACCESS_TOKEN set. See lib/access-gate.ts.
 */
export async function register() {
  // Only the Node.js runtime needs (and can run) the boot check; skip the edge
  // bundle so it stays minimal.
  if (process.env.NEXT_RUNTIME === 'nodejs' || !process.env.NEXT_RUNTIME) {
    const { assertProductionAccessToken } = await import('@/lib/access-gate');
    assertProductionAccessToken();
  }
}
