/**
 * Bounty Radar connector — the bounty scanner (bounty_radar.py) needs the
 * GitHub CLI authenticated to scan, so this checks both honestly. No scan is
 * run here (it hits the network and takes minutes); the connector only
 * reports whether the capability is ready.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { NIKOS_PATHS } from '@/lib/nikos-paths';
import type { ConnectorStatus } from '@/lib/connectors/types';

function ghAuthStatus(timeoutMs = 4000): Promise<{ authed: boolean; detail: string }> {
  return new Promise((resolve) => {
    execFile('gh', ['auth', 'status'], { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (!err) {
        const line = (stdout || '').split('\n').find((l) => l.includes('Logged in to'));
        resolve({ authed: true, detail: line?.trim() ?? 'gh authenticated' });
        return;
      }
      resolve({
        authed: false,
        detail: (stderr || err.message || '').split('\n')[0].slice(0, 160) || 'gh not installed',
      });
    });
  });
}

export async function bountyStatus(): Promise<ConnectorStatus> {
  const script = path.join(NIKOS_PATHS.bounty, 'bounty_radar.py');
  if (!fs.existsSync(script)) {
    return {
      id: 'bounty-radar',
      name: 'Bounty Radar',
      kind: 'local',
      state: 'not_configured',
      detail: `No bounty_radar.py at ${script} — set NIKOS_BOUNTY_PATH.`,
    };
  }
  const gh = await ghAuthStatus();
  const meta: Record<string, string | number> = { script: 1, ghAuth: gh.authed ? 1 : 0 };
  return {
    id: 'bounty-radar',
    name: 'Bounty Radar',
    kind: 'local',
    state: gh.authed ? 'connected' : 'error',
    detail: gh.authed
      ? 'Script present and GitHub CLI authenticated — a scan is ready to run.'
      : `Script present but GitHub CLI not authenticated: ${gh.detail}`,
    meta,
  };
}
