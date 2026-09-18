import { afterEach, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  branchFor,
  dispatchCodingTask,
  workerPromptFor,
  type ExecCall,
} from '@/lib/connectors/superset';

/**
 * Conductor UI-change dispatch: `/ui <request>` in the panel spins up a real
 * Superset coding agent in an isolated workspace/branch on this machine. The
 * connector shells the Superset CLI through an injectable exec (gbrain
 * pattern) so everything here is offline and deterministic.
 */

const FIXED = new Date('2026-08-06T12:00:00Z');

afterEach(() => vi.unstubAllEnvs());

describe('branchFor', () => {
  test('slugs the request under conductor/ui- with a date stamp', () => {
    expect(branchFor('Make the sidebar blue!', FIXED)).toBe('conductor/ui-make-the-sidebar-blue-20260806');
  });

  test('caps runaway requests and never emits an empty slug', () => {
    const long = branchFor('one two three four five six seven eight nine ten', FIXED);
    expect(long.length).toBeLessThanOrEqual(80);
    expect(branchFor('???', FIXED)).toBe('conductor/ui-change-20260806');
  });
});

describe('workerPromptFor', () => {
  const prompt = workerPromptFor('Make the sidebar blue', 'conductor/ui-make-the-sidebar-blue-20260806');

  test('carries the request verbatim', () => {
    expect(prompt).toContain('Make the sidebar blue');
  });

  test('encodes the house rules: TDD, green gates, no push, no dev-server ports', () => {
    expect(prompt).toMatch(/failing test/i);
    expect(prompt).toContain('npm test');
    expect(prompt).toContain('npm run typecheck');
    expect(prompt).toMatch(/never push/i);
    expect(prompt).toContain('4100');
    expect(prompt).toContain('conductor/ui-make-the-sidebar-blue-20260806');
  });
});

function execStub(handler: (args: string[]) => { stdout?: string; stderr?: string; code?: number }) {
  const calls: ExecCall[] = [];
  const exec = async (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    const r = handler(args);
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', code: r.code ?? 0 };
  };
  return { calls, exec };
}

describe('dispatchCodingTask', () => {
  test('resolves the project by name, then creates the workspace with agent + prompt', async () => {
    const { calls, exec } = execStub((args) =>
      args[0] === 'projects'
        ? { stdout: JSON.stringify([{ id: 'proj-1', name: 'founder-os' }]) }
        : { stdout: JSON.stringify({ id: 'ws-1' }) },
    );
    const res = await dispatchCodingTask({ request: 'Make the sidebar blue' }, { exec, now: FIXED });

    expect(res).toMatchObject({ workspaceId: 'ws-1', branch: 'conductor/ui-make-the-sidebar-blue-20260806' });
    expect(calls[0].args).toEqual(['projects', 'list', '--local', '--json']);
    const create = calls[1].args;
    expect(create.slice(0, 3)).toEqual(['workspaces', 'create', '--local']);
    expect(create).toContain('--project');
    expect(create[create.indexOf('--project') + 1]).toBe('proj-1');
    expect(create[create.indexOf('--branch') + 1]).toBe('conductor/ui-make-the-sidebar-blue-20260806');
    expect(create[create.indexOf('--agent') + 1]).toBe('claude');
    expect(create[create.indexOf('--prompt') + 1]).toContain('Make the sidebar blue');
    expect(create).toContain('--json');
  });

  test('SUPERSET_PROJECT_ID skips project discovery', async () => {
    vi.stubEnv('SUPERSET_PROJECT_ID', 'proj-env');
    const { calls, exec } = execStub(() => ({ stdout: JSON.stringify({ id: 'ws-2' }) }));
    const res = await dispatchCodingTask({ request: 'tweak spacing' }, { exec, now: FIXED });
    expect(res.workspaceId).toBe('ws-2');
    expect(calls).toHaveLength(1);
    expect(calls[0].args[calls[0].args.indexOf('--project') + 1]).toBe('proj-env');
  });

  test('CLI failure throws the real stderr — never fake success', async () => {
    const { exec } = execStub(() => ({ stderr: 'Error: Not logged in', code: 1 }));
    await expect(dispatchCodingTask({ request: 'x' }, { exec, now: FIXED })).rejects.toThrow(/not logged in/i);
  });

  test('missing FounderOS-DEMO project throws honestly', async () => {
    const { exec } = execStub((args) =>
      args[0] === 'projects' ? { stdout: '[]' } : { stdout: '{}' },
    );
    await expect(dispatchCodingTask({ request: 'x' }, { exec, now: FIXED })).rejects.toThrow(/project/i);
  });

  test('workspace create returning no id throws', async () => {
    vi.stubEnv('SUPERSET_PROJECT_ID', 'proj-env');
    const { exec } = execStub(() => ({ stdout: '{"ok":true}' }));
    await expect(dispatchCodingTask({ request: 'x' }, { exec, now: FIXED })).rejects.toThrow(/no workspace id/i);
  });
});

describe('POST /api/conductor/dispatch', () => {
  const post = async (body: unknown) => {
    const { POST } = await import('@/app/api/conductor/dispatch/route');
    return POST(
      new Request('http://localhost/api/conductor/dispatch', {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
  };

  test('400 on empty or invalid body', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post('not json')).status).toBe(400);
    expect((await post({ request: '   ' })).status).toBe(400);
  });

  test('201 with workspaceId + branch when the CLI succeeds (fake bin)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'superset-fake-'));
    const bin = path.join(dir, 'superset');
    fs.writeFileSync(
      bin,
      '#!/bin/sh\nif [ "$1" = "projects" ]; then echo \'[{"id":"proj-9","name":"founder-os"}]\'; else echo \'{"id":"ws-9"}\'; fi\n',
      { mode: 0o755 },
    );
    vi.stubEnv('SUPERSET_BIN', bin);
    const res = await post({ request: 'Make the sidebar blue' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.workspaceId).toBe('ws-9');
    expect(body.branch).toMatch(/^conductor\/ui-make-the-sidebar-blue-\d{8}$/);
  });

  test('502 with the honest error when the CLI is unreachable', async () => {
    vi.stubEnv('SUPERSET_BIN', '/nonexistent/superset');
    const res = await post({ request: 'Make the sidebar blue' });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });
});
