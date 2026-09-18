import { describe, expect, test } from 'vitest';
import path from 'node:path';
import { dataDir, resolveDbPath } from '@/lib/paths';

/**
 * Where writable data (the SQLite files) lives, resolved per platform:
 *  - DATA_DIR wins  (Railway mounts a persistent Volume there)
 *  - else /tmp on Vercel (its serverless FS is read-only elsewhere)
 *  - else the repo's data/ dir (local dev)
 * A file-specific override (FOUNDER_OS_DB / LEDGER_DB / BANK_DB) still wins over all.
 */
describe('dataDir', () => {
  test('uses DATA_DIR when set (the Railway volume mount)', () => {
    expect(dataDir({ DATA_DIR: '/data' })).toBe('/data');
  });

  test('falls back to /tmp on Vercel', () => {
    expect(dataDir({ VERCEL: '1' })).toBe('/tmp');
  });

  test('DATA_DIR wins over Vercel /tmp', () => {
    expect(dataDir({ DATA_DIR: '/data', VERCEL: '1' })).toBe('/data');
  });

  test('local dev uses the repo data/ dir', () => {
    expect(dataDir({})).toBe(path.join(process.cwd(), 'data'));
  });
});

describe('resolveDbPath', () => {
  test('a file-specific override wins over everything', () => {
    expect(resolveDbPath('founder-os.db', ':memory:', { DATA_DIR: '/data' })).toBe(':memory:');
  });

  test('no override joins the resolved data dir with the filename', () => {
    expect(resolveDbPath('ledger.db', undefined, { DATA_DIR: '/data' })).toBe('/data/ledger.db');
  });

  test('no override, local dev', () => {
    expect(resolveDbPath('bank.db', undefined, {})).toBe(path.join(process.cwd(), 'data', 'bank.db'));
  });
});
