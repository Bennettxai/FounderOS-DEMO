/**
 * Brainz connector — the schema-driven bot ecosystem already running on this
 * machine. Every bot writes a run-record to ~/Brainz/data/runs/<bot>/status.json
 * (bot-status.v1), so this connector tallies them live. State is honest:
 * no runs dir → not_configured; unreadable → error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { NIKOS_PATHS } from '@/lib/nikos-paths';
import type { ConnectorStatus } from '@/lib/connectors/types';

type BotStatus = { status: string; summary?: string; finished_at?: string; model_name?: string };

/** All bots that currently have a status.json, newest-first by mtime. */
export function brainzBots(): { bot: string; file: string; mtime: number }[] {
  const runs = path.join(NIKOS_PATHS.brainz, 'data', 'runs');
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(runs, { withFileTypes: true });
  } catch {
    return [];
  }
  const bots: { bot: string; file: string; mtime: number }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(runs, entry.name, 'status.json');
    try {
      bots.push({ bot: entry.name, file, mtime: fs.statSync(file).mtimeMs });
    } catch {
      /* no status.json for this bot — skip */
    }
  }
  return bots.sort((a, b) => b.mtime - a.mtime);
}

export function brainzBotStatus(bot: string): BotStatus | null {
  const file = path.join(NIKOS_PATHS.brainz, 'data', 'runs', bot, 'status.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      status: typeof raw.status === 'string' ? raw.status : 'unknown',
      summary: typeof raw.summary === 'string' ? raw.summary : undefined,
      finished_at: typeof raw.finished_at === 'string' ? raw.finished_at : undefined,
      model_name: typeof raw.model_name === 'string' ? raw.model_name : undefined,
    };
  } catch {
    return null;
  }
}

export async function brainzStatus(): Promise<ConnectorStatus> {
  const runs = path.join(NIKOS_PATHS.brainz, 'data', 'runs');
  if (!fs.existsSync(runs)) {
    return {
      id: 'brainz',
      name: 'Brainz Bots',
      kind: 'local',
      state: 'not_configured',
      detail: `No Brainz runs dir at ${runs} — set NIKOS_BRAINZ_PATH or run a Brainz bot first.`,
    };
  }
  const bots = brainzBots();
  const ok = bots.filter((b) => brainzBotStatus(b.bot)?.status === 'ok');
  const other = bots.filter((b) => (brainzBotStatus(b.bot)?.status ?? '') !== 'ok');
  const meta: Record<string, string | number> = {
    bots: bots.length,
    ok: ok.length,
    other: other.length,
    latest: bots[0]?.bot ?? 'none',
  };
  return {
    id: 'brainz',
    name: 'Brainz Bots',
    kind: 'local',
    state: bots.length > 0 ? 'connected' : 'not_configured',
    detail:
      bots.length === 0
        ? 'Runs dir exists but no bot has a status.json yet.'
        : `${bots.length} bots · ${ok.length} ok · ${other.length} other · latest: ${bots[0].bot}`,
    meta,
  };
}
