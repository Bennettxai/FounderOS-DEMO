import { GATED, connected as gatedConnected } from '@/lib/connectors/demo-status';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { ConnectorStatus } from '@/lib/connectors/types';
import { WisprNoteSchema, type WisprNote } from '@/lib/schemas';

export type { WisprNote } from '@/lib/schemas';

const WISPR_DB = path.join(os.homedir(), 'Library', 'Application Support', 'Wispr Flow', 'flow.sqlite');

/** SQLite DATETIME (usually a string) to an ISO timestamp, or null if unparseable. */
function toIso(v: unknown): string | null {
  if (v == null) return null;
  const d = new Date(typeof v === 'number' ? v : String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const firstText = (...vals: unknown[]): string => {
  for (const v of vals) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s) return s;
  }
  return '';
};

/**
 * "7m ago" while a store is warm, "3h ago" and "10d ago" once it is not.
 * the host showed "13829m ago" for weeks: technically true, unreadable, and
 * silent about the reason, which is that the operator dictates on the laptop and
 * the host only ever sees a copy of flow.sqlite.
 */
export function wisprDetail(m: {
  dictations: number;
  notes: number;
  todos: number;
  meetings: number;
  minutesAgo: number;
}): string {
  const mins = Math.max(0, Math.round(m.minutesAgo));
  const age =
    mins < 60
      ? `${mins}m ago`
      : mins < 1440
        ? `${Math.round(mins / 60)}h ago`
        : `${Math.round(mins / 1440)}d ago`;
  const stale = mins >= 1440 ? ' · stale on this box' : '';
  return (
    `${m.dictations.toLocaleString('en-US')} dictations · ${m.notes} notes · ${m.todos} todos · ` +
    `${m.meetings} meetings · last activity ${age}${stale}`
  );
}

/**
 * Wispr Flow (voice dictation) — the operator's heaviest daily-use tool. Local
 * read-only SQLite; tables of interest: History (dictations), Notes, Todos,
 * Meetings.
 */
export async function wisprStatus(): Promise<ConnectorStatus> {
  if (GATED) return gatedConnected('wispr', 'Wispr Flow', 'local', 'voice capture · live');
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
        detail: wisprDetail({ dictations, notes, todos, meetings, minutesAgo }),
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

/**
 * Recent Wispr content for the Comms "Notes" lane. The Notes table is often
 * empty (dictation, not notes, is the daily driver), so History (dictations)
 * carries the real content: each dictation with the app it went into. Notes and
 * Todos are folded in when present. Read-only, bounded, and fail-safe: any
 * missing file, table, or column degrades to an empty list, never throws.
 */
export async function recentWisprNotes(limit = 40, dbPath = WISPR_DB): Promise<WisprNote[]> {
  if (!fs.existsSync(dbPath)) return [];
  const raw: WisprNote[] = [];
  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      // each table read is independently guarded — an older schema missing a
      // table or column skips that source instead of blanking the whole lane
      const rows = <T>(sql: string): T[] => {
        try {
          return db.prepare(sql).all() as T[];
        } catch {
          return [];
        }
      };

      for (const r of rows<Record<string, unknown>>(
        `SELECT transcriptEntityId, asrText, formattedText, editedText, timestamp, app, numWords, isArchived
           FROM History WHERE COALESCE(isArchived,0)=0 ORDER BY timestamp DESC LIMIT ${limit}`,
      )) {
        const text = firstText(r.editedText, r.formattedText, r.asrText);
        const ts = toIso(r.timestamp);
        if (!text || !ts) continue;
        raw.push({
          id: String(r.transcriptEntityId ?? ''),
          kind: 'dictation',
          text,
          app: typeof r.app === 'string' && r.app ? r.app : null,
          ts,
          wordCount: typeof r.numWords === 'number' ? r.numWords : null,
        });
      }

      for (const r of rows<Record<string, unknown>>(
        `SELECT id, title, contentPreview, createdAt, modifiedAt, isDeleted
           FROM Notes WHERE COALESCE(isDeleted,0)=0 ORDER BY COALESCE(modifiedAt, createdAt) DESC LIMIT ${limit}`,
      )) {
        const text = firstText(r.title, r.contentPreview);
        const ts = toIso(r.modifiedAt ?? r.createdAt);
        if (!text || !ts) continue;
        raw.push({ id: String(r.id ?? ''), kind: 'note', text, app: null, ts, wordCount: null });
      }

      for (const r of rows<Record<string, unknown>>(
        `SELECT id, title, status, createdAt, isDeleted, isArchived
           FROM Todos WHERE COALESCE(isDeleted,0)=0 AND COALESCE(isArchived,0)=0 ORDER BY createdAt DESC LIMIT ${limit}`,
      )) {
        const title = firstText(r.title);
        const ts = toIso(r.createdAt);
        if (!title || !ts) continue;
        const status = typeof r.status === 'string' && r.status ? r.status : '';
        raw.push({
          id: String(r.id ?? ''),
          kind: 'todo',
          text: status && status !== 'open' ? `${title} · ${status}` : title,
          app: null,
          ts,
          wordCount: null,
        });
      }
    } finally {
      db.close();
    }
  } catch {
    return []; // locked / unreadable / absent — degrade quietly, never hang the feed
  }

  return raw
    .map((n) => WisprNoteSchema.safeParse(n))
    .filter((p): p is { success: true; data: WisprNote } => p.success)
    .map((p) => p.data)
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .slice(0, limit);
}
