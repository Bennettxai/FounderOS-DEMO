import { describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGBrainProvider, parseGbrainStats, execTimeoutFor, type ExecFn } from '@/lib/connectors/gbrain';

const healthyExec: ExecFn = async (_cmd, args) => {
  if (args[0] === 'doctor') {
    return {
      stdout: JSON.stringify({
        status: 'healthy',
        health_score: 95,
        checks: [
          { name: 'skill_conformance', status: 'ok', message: '47/47 skills pass' },
          { name: 'connection', status: 'warn', message: 'Skipping DB checks (--fast mode)' },
        ],
      }),
      stderr: '',
      code: 0,
    };
  }
  return { stdout: 'projects/founder-os -- FOUNDER OS build notes\n', stderr: '', code: 0 };
};

const downExec: ExecFn = async () => ({
  stdout: '',
  stderr: 'Cannot connect to database: (ENOTFOUND) tenant/user not found',
  code: 1,
});

function makeStore(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'brain-store-'));
  mkdirSync(path.join(dir, 'projects'));
  writeFileSync(
    path.join(dir, 'projects', 'founder-os.md'),
    '# FOUNDER OS\nThe personal OS rebuild uses a revenue split model for Launchpad Cohort.\n',
  );
  writeFileSync(path.join(dir, 'README.md'), '# Brain Store\nNothing relevant here.\n');
  return dir;
}

describe('GBrain provider', () => {
  test('reports connected with health score when doctor succeeds', async () => {
    const brain = createGBrainProvider({ exec: healthyExec, storePath: makeStore() });
    const status = await brain.status();
    expect(status.connected).toBe(true);
    expect(status.provider).toBe('gbrain');
    expect(status.detail).toContain('95');
  });

  test('reports disconnected with the real error when the CLI fails', async () => {
    const brain = createGBrainProvider({ exec: downExec, storePath: makeStore() });
    const status = await brain.status();
    expect(status.connected).toBe(false);
    expect(status.detail).toContain('Cannot connect to database');
  });

  test('falls back to local brain-store markdown search when the CLI fails', async () => {
    const brain = createGBrainProvider({ exec: downExec, storePath: makeStore() });
    const results = await brain.search('revenue split');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].source).toBe('brain-store');
    expect(results[0].title).toContain('founder-os');
    expect(results[0].snippet.toLowerCase()).toContain('revenue split');
  });

  test('counts local markdown pages even when the database is down', async () => {
    const brain = createGBrainProvider({ exec: downExec, storePath: makeStore() });
    const stats = await brain.localStats();
    expect(stats.markdownFiles).toBe(2);
  });

  test('overview maps the store tree and doctor checks when healthy', async () => {
    const brain = createGBrainProvider({ exec: healthyExec, storePath: makeStore() });
    const overview = await brain.overview();

    expect(overview.store.totalFiles).toBe(2);
    expect(overview.store.folders).toEqual([
      { name: '(root)', files: 1 },
      { name: 'projects', files: 1 },
    ]);

    expect(overview.doctor.connected).toBe(true);
    expect(overview.doctor.status).toBe('healthy');
    expect(overview.doctor.healthScore).toBe(95);
    expect(overview.doctor.checks).toEqual([
      { name: 'skill_conformance', status: 'ok', message: '47/47 skills pass' },
      { name: 'connection', status: 'warn', message: 'Skipping DB checks (--fast mode)' },
    ]);
  });

  test('overview stays honest when the CLI is down: store still real, doctor disconnected', async () => {
    const brain = createGBrainProvider({ exec: downExec, storePath: makeStore() });
    const overview = await brain.overview();

    expect(overview.store.totalFiles).toBe(2);
    expect(overview.doctor.connected).toBe(false);
    expect(overview.doctor.checks).toEqual([]);
    expect(overview.doctor.detail).toContain('Cannot connect to database');
  });
});

const STATS_OUTPUT = `Pages:     916
Chunks:    11185
Embedded:  11185
Links:     0
Tags:      13
Timeline:  0

By type:
  conversation: 500
  note: 99
  concept: 89
`;

describe('execTimeoutFor', () => {
  test('gives write/embed commands a generous timeout and keeps reads fast-fail', () => {
    // capture/import/embed hit ZeroEntropy + Supabase — measured ~13s warm, ~24s cold,
    // so they need >15s of headroom or execFile kills them (SIGTERM).
    expect(execTimeoutFor(['capture', '--stdin', '--json'])).toBeGreaterThanOrEqual(45_000);
    expect(execTimeoutFor(['import', '/some/dir'])).toBeGreaterThanOrEqual(45_000);
    expect(execTimeoutFor(['embed', '--all'])).toBeGreaterThanOrEqual(45_000);
    // reads must fail fast so a paused DB never hangs the page → local fallback
    expect(execTimeoutFor(['doctor', '--fast'])).toBe(15_000);
    expect(execTimeoutFor(['query', 'x'])).toBe(15_000);
    expect(execTimeoutFor(['stats'])).toBe(15_000);
  });
});

describe('parseGbrainStats', () => {
  test('extracts page/chunk/embedded counts and the by-type breakdown', () => {
    const stats = parseGbrainStats(STATS_OUTPUT);
    expect(stats.pages).toBe(916);
    expect(stats.chunks).toBe(11185);
    expect(stats.embedded).toBe(11185);
    expect(stats.byType).toEqual([
      { type: 'conversation', count: 500 },
      { type: 'note', count: 99 },
      { type: 'concept', count: 89 },
    ]);
  });
});

describe('GBrain stats()', () => {
  test('shells `gbrain stats` and returns the parsed counts', async () => {
    const exec: ExecFn = async (_cmd, args) =>
      args[0] === 'stats'
        ? { stdout: STATS_OUTPUT, stderr: '', code: 0 }
        : { stdout: '', stderr: '', code: 1 };
    const brain = createGBrainProvider({ exec, storePath: makeStore() });
    const stats = await brain.stats();
    expect(stats).toEqual({
      pages: 916,
      chunks: 11185,
      embedded: 11185,
      byType: [
        { type: 'conversation', count: 500 },
        { type: 'note', count: 99 },
        { type: 'concept', count: 89 },
      ],
    });
  });

  test('returns null when the CLI is unreachable', async () => {
    const brain = createGBrainProvider({ exec: downExec, storePath: makeStore() });
    expect(await brain.stats()).toBeNull();
  });
});

describe('GBrain capture()', () => {
  test('pipes content over stdin and returns the slug + content hash', async () => {
    let seenArgs: string[] = [];
    let seenStdin: string | undefined;
    const exec: ExecFn = async (_cmd, args, stdin) => {
      seenArgs = args;
      seenStdin = stdin;
      return {
        stdout: JSON.stringify({
          slug: 'inbox/2026-07-02-abc123',
          content_hash: 'deadbeefcafe',
          status: 'embedded',
          written: true,
        }),
        stderr: '',
        code: 0,
      };
    };
    const brain = createGBrainProvider({ exec, storePath: makeStore() });
    const res = await brain.capture({ text: 'a fresh idea worth keeping', type: 'note' });
    expect(res).toEqual({ ok: true, slug: 'inbox/2026-07-02-abc123', contentHash: 'deadbeefcafe' });
    expect(seenArgs).toContain('capture');
    expect(seenArgs).toContain('--stdin');
    expect(seenArgs).toContain('--json');
    expect(seenArgs.join(' ')).toContain('--type note');
    expect(seenStdin).toBe('a fresh idea worth keeping');
  });

  test('returns ok:false with the real error when the CLI fails', async () => {
    const brain = createGBrainProvider({ exec: downExec, storePath: makeStore() });
    const res = await brain.capture({ text: 'anything' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('Cannot connect to database');
  });

  test('refuses empty content without shelling out', async () => {
    let called = false;
    const exec: ExecFn = async () => {
      called = true;
      return { stdout: '', stderr: '', code: 0 };
    };
    const brain = createGBrainProvider({ exec, storePath: makeStore() });
    const res = await brain.capture({ text: '   \n  ' });
    expect(res.ok).toBe(false);
    expect(called).toBe(false);
  });
});
