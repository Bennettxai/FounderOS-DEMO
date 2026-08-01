import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { ConnectorStatus } from '@/lib/connectors/types';

const WISPR_DB = path.join(os.homedir(), 'Library', 'Application Support', 'Wispr Flow', 'flow.sqlite');

/**
 * Wispr Flow (voice dictation) — Alex's heaviest daily-use tool. Local
 * read-only SQLite; tables of interest: History (dictations), Notes, Todos,
 * Meetings.
 */
export async function wisprStatus(): Promise<ConnectorStatus> {
  if (!fs.existsSync(WISPR_DB)) {
    return {
      id: 'wispr',
      name: 'Wispr Flow',
      kind: 'local',
      state: 'not_configured',
      detail: 'flow.sqlite not found — is Wispr Flow installed?',
    };
  }
  try {
    const db = new Database(WISPR_DB, { readonly: true, fileMustExist: true });
    try {
      const count = (table: string): number => {
        try {
          return (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n;
        } catch {
          return 0;
        }
      };
      const dictations = count('History');
      const notes = count('Notes');
      const todos = count('Todos');
      const meetings = count('Meetings');
      const mtime = fs.statSync(WISPR_DB).mtime;
      const minutesAgo = Math.max(0, Math.round((Date.now() - mtime.getTime()) / 60_000));
      return {
        id: 'wispr',
        name: 'Wispr Flow',
        kind: 'local',
        state: 'connected',
        detail: `${dictations.toLocaleString('en-US')} dictations · ${notes} notes · ${todos} todos · ${meetings} meetings · last activity ${minutesAgo}m ago`,
        meta: { dictations, notes, todos, meetings },
      };
    } finally {
      db.close();
    }
  } catch (err) {
    return {
      id: 'wispr',
      name: 'Wispr Flow',
      kind: 'local',
      state: 'error',
      detail: `flow.sqlite exists but read failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
