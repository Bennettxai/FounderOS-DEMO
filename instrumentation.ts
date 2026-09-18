/**
 * Server boot hook: prime the comms caches.
 *
 * They live in process memory, so every restart empties them — and this box is
 * redeployed often, by more than one agent. Measured: a cold /comms render is
 * ~20s, warm is ~0.6s. Without this the first person to open comms after a
 * deploy eats that wait until the 15-minute sweep next runs.
 *
 * This deliberately calls the refresh ROUTE over HTTP rather than importing the
 * connectors. instrumentation.ts is bundled for the edge runtime as well as
 * node, and importing imapflow here fails the build outright ("Can't resolve
 * 'stream'") — a runtime guard is too late, because the import is traced at
 * build time. A fetch has no such problem.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.FOUNDER_OS_SKIP_WARMUP === '1') return;

  const port = process.env.PORT ?? '4100';
  // Fire and forget, after a beat so the server is actually listening.
  setTimeout(() => {
    const started = Date.now();
    fetch(`http://127.0.0.1:${port}/api/analytics/refresh`, { method: 'POST' })
      .then((r) => console.log(`[warmup] comms primed via refresh (${r.status}) in ${((Date.now() - started) / 1000).toFixed(1)}s`))
      .catch((err) => console.warn('[warmup] priming failed:', err instanceof Error ? err.message : err));
  }, 4000).unref?.();

  startFailoverTick(port);
  startCronTick(port);
}

/**
 * Model failover for the Paperclip board, on a timer.
 *
 * Design note: a model provider running out of usage credits once left the
 * Conductor (the CEO seat the whole company reports through) sitting in
 * `error` for hours. Paperclip does not switch model on a quota failure, it
 * waits for the window to reset, and it did not even classify that wording
 * as a quota failure. See lib/agent-failover.ts.
 *
 * The tick lives here rather than in launchd because this process runs on
 * the host, which is always awake; the laptop LaunchAgents miss any window
 * where the lid is shut. Same fetch-over-HTTP shape as the warmup above, and
 * for the same reason: instrumentation.ts is traced for the edge runtime
 * too, so it must not import the connectors.
 */
function startFailoverTick(port: string) {
  if (process.env.FOUNDER_OS_DISABLE_FAILOVER === '1') return;
  const everyMs = Number(process.env.FOUNDER_OS_FAILOVER_INTERVAL_MS ?? 5 * 60_000);
  if (!Number.isFinite(everyMs) || everyMs < 30_000) return;

  const tick = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/agents/failover`, { method: 'POST' });
      const body = (await res.json()) as { actions?: unknown[]; exhausted?: string[]; notes?: string[] };
      // Quiet when there is nothing to do — this runs every few minutes forever.
      if (body.actions?.length) {
        console.log(`[failover] moved ${body.actions.length} seat(s) off ${(body.exhausted ?? []).join(', ')}`);
      } else if (body.notes?.length) {
        console.warn(`[failover] ${body.notes.join(' | ')}`);
      }
    } catch (err) {
      console.warn('[failover] tick failed:', err instanceof Error ? err.message : err);
    }
  };

  setTimeout(tick, 20_000).unref?.();
  setInterval(tick, everyMs).unref?.();
}

/**
 * The scheduled-job runner, on a timer.
 *
 * Design need: a 9am comms digest. `agent_crons` had held schedules since
 * the beginning but nothing ever fired them: the OS displayed a promise it
 * did not keep. This is the missing half.
 *
 * Every 60s so a one-minute cron granularity is actually achievable. Catch-up
 * lives in lib/cron-scheduler.ts, which matters here specifically: the
 * autodeploy daemon rebuilds this process whenever main moves, so a restart
 * across 09:00 must still deliver the morning report rather than skip a day.
 *
 * Same fetch-over-HTTP shape as the two ticks above, for the same reason:
 * instrumentation.ts is traced for the edge runtime too and must not import
 * better-sqlite3 or the connectors.
 */
function startCronTick(port: string) {
  if (process.env.FOUNDER_OS_DISABLE_CRON === '1') return;
  const everyMs = Number(process.env.FOUNDER_OS_CRON_INTERVAL_MS ?? 60_000);
  if (!Number.isFinite(everyMs) || everyMs < 15_000) return;

  const tick = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/cron/tick`, { method: 'POST' });
      const body = (await res.json()) as { ran?: { cronId: string; ok: boolean; summary: string }[] };
      // Silent when nothing is due — this runs every minute forever.
      for (const r of body.ran ?? []) {
        console.log(`[cron] ${r.cronId} ${r.ok ? 'ok' : 'FAILED'}: ${r.summary.slice(0, 200)}`);
      }
    } catch (err) {
      console.warn('[cron] tick failed:', err instanceof Error ? err.message : err);
    }
  };

  setTimeout(tick, 30_000).unref?.();
  setInterval(tick, everyMs).unref?.();
}
