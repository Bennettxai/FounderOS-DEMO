import path from 'node:path';

/**
 * Where writable data (the SQLite files) lives, resolved per deployment target.
 * Platform-agnostic so the same build runs on Vercel, Railway, or locally:
 *
 *   DATA_DIR set  -> use it        (Railway mounts a persistent Volume here, e.g. /data)
 *   VERCEL set    -> /tmp          (Vercel's serverless FS is read-only elsewhere)
 *   otherwise     -> <cwd>/data    (local dev, checked into the repo)
 */
export function dataDir(env: Record<string, string | undefined> = process.env): string {
  if (env.DATA_DIR) return env.DATA_DIR;
  if (env.VERCEL) return '/tmp';
  return path.join(process.cwd(), 'data');
}

/**
 * Resolve a concrete DB file path. A file-specific override (FOUNDER_OS_DB /
 * LEDGER_DB / BANK_DB, or ':memory:' in tests) always wins; otherwise the file
 * lives under the resolved {@link dataDir}.
 */
export function resolveDbPath(
  filename: string,
  override?: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return override ?? path.join(dataDir(env), filename);
}
