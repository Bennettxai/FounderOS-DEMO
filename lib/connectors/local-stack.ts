import { GATED, connected as gatedConnected } from '@/lib/connectors/demo-status';
import fs from 'node:fs';
import path from 'node:path';
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

const BREW = '/opt/homebrew/bin';

/**
 * Both agent services run on the host, so a bare localhost probe reports them
 * down from anywhere else, including the laptop, where the OS is also
 * opened. Use the configured address when there is one (PAPERCLIP_API_URL is
 * already set for the board connector) and fall back to the loopback ports the
 * host itself serves on.
 */
const paperclipUrl = (): string => process.env.PAPERCLIP_API_URL || 'http://localhost:3100';
const hermesUrl = (): string => process.env.HERMES_GATEWAY_URL || 'http://localhost:8642';
const gbrainBin = (): string => process.env.GBRAIN_BIN || '';

export async function localStackStatus(): Promise<ConnectorStatus> {
  if (GATED) return gatedConnected('local-stack', 'Local Stack', 'local', 'services up');

  // Design choice: this lists ONLY what Founder OS itself runs or shells out
  // to. Anything reached through a hosted API instead of a local process was
  // dropped from this panel: reporting on it made the panel look broken
  // while conveying nothing about the OS's actual local dependencies.
  // No self-check: if you are reading this panel the OS is obviously up, and
  // an SSR request to our own port reported DOWN on the host while serving the
  // very page it appears on. A check that can only be true-or-wrong is worse
  // than no check. Everything below is a real external dependency.
  const [paperclipBoard, hermesGateway] = await Promise.all([ping(paperclipUrl()), ping(hermesUrl())]);

  const checks: Check[] = [
    { name: 'paperclip', up: paperclipBoard, detail: `agent board · ${paperclipUrl().replace(/^https?:\/\//, '')}` },
    { name: 'hermes', up: hermesGateway, detail: `worker pool · ${hermesUrl().replace(/^https?:\/\//, '')}` },
    {
      name: 'gbrain',
      up: Boolean(binExists(gbrainBin(), `${BREW}/gbrain`)),
      detail: 'knowledge CLI behind /brain',
    },
    {
      name: 'ffmpeg',
      up: Boolean(binExists(`${BREW}/ffmpeg`, '/usr/local/bin/ffmpeg')),
      detail: 'content-gen media processing',
    },
    {
      name: 'pdftotext',
      up: Boolean(binExists(`${BREW}/pdftotext`, '/usr/local/bin/pdftotext')),
      detail: 'statement ingestion (/finances)',
    },
    {
      name: 'whisper',
      up: Boolean(binExists(`${BREW}/whisper-cli`, '/usr/local/bin/whisper-cli')),
      detail: 'local transcription',
    },
    { name: 'gh', up: Boolean(binExists(`${BREW}/gh`, '/usr/local/bin/gh')), detail: 'GitHub CLI · deploys' },
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
