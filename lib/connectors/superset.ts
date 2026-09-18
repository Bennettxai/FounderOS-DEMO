import { execFile } from 'node:child_process';

/**
 * Superset dispatch — the Conductor's hands for code changes. Founder OS never
 * edits its own UI in-process; instead this connector shells the local
 * Superset CLI to spin up an isolated workspace (own worktree + branch) with a
 * real coding agent inside, carrying the house rules in its prompt. Exec is
 * injectable (gbrain pattern) so tests stay offline; failures surface the
 * CLI's honest stderr, never a fake success.
 */

export type ExecResult = { stdout: string; stderr: string; code: number };
export type ExecFn = (cmd: string, args: string[]) => Promise<ExecResult>;
export type ExecCall = { cmd: string; args: string[] };

export type DispatchResult = { workspaceId: string; branch: string };

const supersetBin = () => process.env.SUPERSET_BIN ?? 'superset';

const PROJECT_NAME = process.env.SUPERSET_PROJECT_NAME ?? 'founder-os';
const BRANCH_MAX = 80;

const defaultExec: ExecFn = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout?.toString() ?? '',
        // `||` not `??`: on spawn failure stderr is empty — keep the real error
        stderr: stderr?.toString() || (err ? err.message : ''),
        code: err ? 1 : 0,
      });
    });
  });

export function branchFor(request: string, now: Date = new Date()): string {
  const slug =
    request
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48)
      .replace(/-$/, '') || 'change';
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `conductor/ui-${slug}-${date}`.slice(0, BRANCH_MAX);
}

export function workerPromptFor(request: string, branch: string): string {
  return [
    `You are a coding agent working the Founder OS repo on branch \`${branch}\` in an isolated Superset workspace.`,
    '',
    `Task from the Conductor (UI change requested by the operator):`,
    request,
    '',
    'House rules (non-negotiable):',
    '- Read CLAUDE.md first and follow it.',
    '- TDD: write the failing test first, then the minimal implementation.',
    '- `npm test` and `npm run typecheck` must both be green before you claim done.',
    '- Commit locally on this branch, small checkpoints. NEVER push to any remote.',
    '- Never touch the dev servers on ports 4100 or 4101 — other sessions use them.',
    '- Stay on scope: only the change requested above.',
  ].join('\n');
}

async function run(exec: ExecFn, args: string[]): Promise<string> {
  const res = await exec(supersetBin(), args);
  if (res.code !== 0) {
    throw new Error(`superset ${args[0]} ${args[1] ?? ''} failed: ${(res.stderr || res.stdout).slice(0, 300)}`.trim());
  }
  return res.stdout;
}

async function resolveProjectId(exec: ExecFn): Promise<string> {
  const fromEnv = process.env.SUPERSET_PROJECT_ID;
  if (fromEnv) return fromEnv;
  const out = await run(exec, ['projects', 'list', '--local', '--json']);
  let parsed: unknown;
  try {
    parsed = JSON.parse(out);
  } catch {
    throw new Error('superset projects list returned unparseable JSON');
  }
  const list = Array.isArray(parsed) ? parsed : ((parsed as { projects?: unknown[] })?.projects ?? []);
  for (const rec of list) {
    const r = rec as Record<string, unknown>;
    if (typeof r.id === 'string' && typeof r.name === 'string' && r.name.toLowerCase() === PROJECT_NAME.toLowerCase()) {
      return r.id;
    }
  }
  throw new Error(`no local Superset project named "${PROJECT_NAME}" — set SUPERSET_PROJECT_ID in .env.local`);
}

export async function dispatchCodingTask(
  input: { request: string },
  opts: { exec?: ExecFn; now?: Date } = {},
): Promise<DispatchResult> {
  const exec = opts.exec ?? defaultExec;
  const request = input.request.trim();
  if (!request) throw new Error('dispatch request is empty');

  const projectId = await resolveProjectId(exec);
  const branch = branchFor(request, opts.now);
  const out = await run(exec, [
    'workspaces',
    'create',
    '--local',
    '--project',
    projectId,
    '--branch',
    branch,
    '--agent',
    'claude',
    '--prompt',
    workerPromptFor(request, branch),
    '--json',
  ]);

  let created: Record<string, unknown>;
  try {
    created = JSON.parse(out) as Record<string, unknown>;
  } catch {
    throw new Error('superset workspaces create returned unparseable JSON');
  }
  const ws = (created.workspace ?? created) as Record<string, unknown>;
  if (typeof ws.id !== 'string') throw new Error('superset workspaces create returned no workspace id');
  return { workspaceId: ws.id, branch };
}
