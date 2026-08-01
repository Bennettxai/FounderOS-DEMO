import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import type { ConnectorStatus } from '@/lib/connectors/types';

/**
 * One connector for the local machine stack: running services (ports) and
 * installed daily-driver CLIs. Everything here is checked live.
 */

type Check = { name: string; up: boolean; detail: string };

function ping(url: string, timeoutMs = 1500): Promise<boolean> {
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs) }).then(
    (r) => r.status > 0,
    () => false,
  );
}

function binExists(...candidates: string[]): string | null {
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* next */
    }
  }
  return null;
}

function tmuxSessions(): Promise<number> {
  return new Promise((resolve) => {
    execFile('tmux', ['list-sessions', '-F', '#{session_name}'], { timeout: 2000 }, (err, stdout) => {
      resolve(err ? 0 : stdout.split('\n').filter(Boolean).length);
    });
  });
}

const HOME = os.homedir();
const BREW = '/opt/homebrew/bin';

export async function localStackStatus(): Promise<ConnectorStatus> {
  const [commandCenter, remotionStudio, ollama, openclawGateway, tmuxCount] = await Promise.all([
    ping('http://localhost:4000'),
    ping('http://localhost:3789'),
    ping('http://localhost:11434/api/tags'),
    ping('http://localhost:18789'),
    tmuxSessions(),
  ]);

  const remotionDir = fs.existsSync(path.join(HOME, 'Projects', 'remotion-pipeline'));

  const checks: Check[] = [
    { name: 'command-center', up: commandCenter, detail: 'command-center :4000' },
    {
      name: 'remotion',
      up: remotionStudio || remotionDir,
      detail: remotionStudio ? 'studio live :3789' : remotionDir ? 'pipeline installed' : 'missing',
    },
    { name: 'ollama', up: ollama, detail: 'local LLM :11434' },
    { name: 'openclaw', up: openclawGateway, detail: 'gateway :18789' },
    { name: 'tmux', up: tmuxCount > 0, detail: `${tmuxCount} sessions` },
    {
      name: 'whisper',
      up: Boolean(binExists(`${BREW}/whisper-cli`, '/usr/local/bin/whisper-cli')),
      detail: 'local transcription',
    },
    {
      name: 'ffmpeg',
      up: Boolean(binExists(`${BREW}/ffmpeg`, '/usr/local/bin/ffmpeg')),
      detail: 'media processing',
    },
    {
      name: 'higgsfield',
      up: Boolean(binExists(path.join(HOME, '.npm-global', 'bin', 'higgsfield'), `${BREW}/higgsfield`)),
      detail: 'AI video CLI',
    },
    {
      name: 'gh',
      up: Boolean(binExists(`${BREW}/gh`, '/usr/local/bin/gh')),
      detail: 'GitHub CLI',
    },
  ];

  const up = checks.filter((c) => c.up);
  const downNames = checks.filter((c) => !c.up).map((c) => c.name);
  const meta: Record<string, string | number> = {};
  for (const check of checks) meta[check.name] = check.up ? `up · ${check.detail}` : 'down';

  return {
    id: 'local-stack',
    name: 'Local Stack',
    kind: 'local',
    state: up.length > 0 ? 'connected' : 'error',
    detail: `${up.length}/${checks.length} up — ${up.map((c) => c.name).join(', ')}${
      downNames.length ? ` · down: ${downNames.join(', ')}` : ''
    }`,
    meta,
  };
}
