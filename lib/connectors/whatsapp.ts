import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import type { ConnectorStatus } from '@/lib/connectors/types';
import type { CommsItem } from '@/lib/comms';

// WhatsApp ships two separate macOS apps, each with its own group container:
// the consumer app and WhatsApp Business (SMB). Alex switched to Business,
// so we look in both and read whichever database is actually live.
const WHATSAPP_CONTAINERS = [
  'group.net.whatsapp.WhatsApp.shared', // consumer
  'group.net.whatsapp.WhatsAppSMB.shared', // Business
];

/** Candidate ChatStorage.sqlite paths, one per known WhatsApp container. */
export function whatsappContainerPaths(): string[] {
  return WHATSAPP_CONTAINERS.map((container) =>
    path.join(os.homedir(), 'Library', 'Group Containers', container, 'ChatStorage.sqlite'),
  );
}

/**
 * Pick the WhatsApp database to read: of the candidate paths that exist, the
 * most recently modified one — i.e. the app you're actually using (consumer or
 * Business). Null when none are present. Injectable for tests.
 * (Only touches metadata, which macOS allows without Full Disk Access.)
 */
export function resolveChatDb(paths: string[] = whatsappContainerPaths()): string | null {
  const existing = paths.filter((p) => fs.existsSync(p));
  if (existing.length === 0) return null;
  return existing.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

const CORE_DATA_EPOCH_MS = Date.parse('2001-01-01T00:00:00.000Z');

/**
 * WhatsApp's ZLASTMESSAGEDATE unit differs across app builds (seconds,
 * sub-second ticks…). Rather than hardcode a unit, calibrate: the largest
 * raw value in an actively-used database is "approximately now", so
 * scale = maxRaw / secondsSince2001(now), and every row maps through it.
 */
export function calibratedDate(raw: number, maxRaw: number, nowMs = Date.now()): Date {
  const elapsedSeconds = (nowMs - CORE_DATA_EPOCH_MS) / 1000;
  const scale = maxRaw > 0 ? maxRaw / elapsedSeconds : 1;
  const seconds = raw > 0 ? raw / scale : 0;
  return new Date(CORE_DATA_EPOCH_MS + seconds * 1000);
}

type ChatRow = {
  ZPARTNERNAME: string | null;
  ZLASTMESSAGEDATE: number | null;
  ZUNREADCOUNT: number | null;
  lastText: string | null;
  lastDate: number | null;
};

// The DB read runs in a short-lived child `node -e` process, NOT inline. Reading
// WhatsApp's live DB blocks hard when macOS withholds Full Disk Access (even a
// raw byte read hangs) — and better-sqlite3 is synchronous, so an inline read
// would freeze the whole server's event loop. A child process can be SIGKILLed
// on timeout, so a blocked/locked/permission-walled read degrades to an honest
// status instead of hanging /comms and the pulse row. better-sqlite3 resolves
// from the project's node_modules (child inherits cwd).
const READ_CODE = `
const Database = require('better-sqlite3');
const dbPath = process.argv[1], mode = process.argv[2], limit = parseInt(process.argv[3] || '15', 10);
try {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  db.pragma('busy_timeout = 2000');
  let out;
  if (mode === 'status') {
    const chats = db.prepare('SELECT COUNT(*) AS n FROM ZWACHATSESSION').get().n;
    const unread = db.prepare('SELECT COALESCE(SUM(ZUNREADCOUNT),0) AS n FROM ZWACHATSESSION WHERE ZUNREADCOUNT>0').get().n;
    out = { ok: true, chats, unread };
  } else {
    const maxRaw = db.prepare('SELECT COALESCE(MAX(ZLASTMESSAGEDATE),0) AS m FROM ZWACHATSESSION').get().m;
    const rows = db.prepare('SELECT s.ZPARTNERNAME, s.ZLASTMESSAGEDATE, s.ZUNREADCOUNT, (SELECT m.ZTEXT FROM ZWAMESSAGE m WHERE m.ZCHATSESSION = s.Z_PK AND m.ZTEXT IS NOT NULL ORDER BY m.ZMESSAGEDATE DESC LIMIT 1) AS lastText, (SELECT MAX(m.ZMESSAGEDATE) FROM ZWAMESSAGE m WHERE m.ZCHATSESSION = s.Z_PK) AS lastDate FROM ZWACHATSESSION s WHERE s.ZPARTNERNAME IS NOT NULL AND (s.ZARCHIVED IS NULL OR s.ZARCHIVED = 0) ORDER BY s.ZLASTMESSAGEDATE DESC LIMIT ?').all(limit);
    out = { ok: true, rows, maxRaw };
  }
  db.close();
  process.stdout.write(JSON.stringify(out));
} catch (e) { process.stdout.write(JSON.stringify({ ok: false, error: String((e && e.message) || e) })); }
`;

const READ_TIMEOUT_MS = 5000;

type StatusRead = { ok: true; chats: number; unread: number };
type RecentRead = { ok: true; rows: ChatRow[]; maxRaw: number };
type ReadFail = { ok: false; error: string; timedOut?: boolean };

/** Read the WhatsApp DB in a child process, hard-capped at READ_TIMEOUT_MS. A
    hung read (no Full Disk Access) is SIGKILLed and reported, never awaited forever. */
function boundedRead(dbPath: string, mode: 'status'): Promise<StatusRead | ReadFail>;
function boundedRead(dbPath: string, mode: 'recent', limit: number): Promise<RecentRead | ReadFail>;
function boundedRead(
  dbPath: string,
  mode: 'status' | 'recent',
  limit = 15,
): Promise<StatusRead | RecentRead | ReadFail> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['-e', READ_CODE, dbPath, mode, String(limit)],
      { timeout: READ_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        const e = err as (NodeJS.ErrnoException & { killed?: boolean; signal?: NodeJS.Signals }) | null;
        if (e && (e.killed || e.signal === 'SIGKILL')) {
          return resolve({ ok: false, error: 'read timed out', timedOut: true });
        }
        if (e && !stdout) return resolve({ ok: false, error: e.message });
        try {
          resolve(JSON.parse(stdout) as StatusRead | RecentRead | ReadFail);
        } catch {
          resolve({ ok: false, error: 'unparseable read output' });
        }
      },
    );
  });
}

const FDA_HINT =
  'grant Full Disk Access to the app running Founder OS in System Settings > Privacy & Security > Full Disk Access, then restart the dev server';

let statusCache: { at: number; status: ConnectorStatus } | null = null;
const STATUS_TTL_MS = 60_000;

export async function whatsappStatus(): Promise<ConnectorStatus> {
  const now = Date.now();
  if (statusCache && now - statusCache.at < STATUS_TTL_MS) return statusCache.status;

  const base = { id: 'whatsapp', name: 'WhatsApp', kind: 'social' as const };
  const dbPath = resolveChatDb();
  let status: ConnectorStatus;

  if (!dbPath) {
    status = {
      ...base,
      state: 'not_configured',
      detail: 'ChatStorage.sqlite not found. Is the WhatsApp (or WhatsApp Business) desktop app installed and signed in?',
    };
  } else {
    const read = await boundedRead(dbPath, 'status');
    if (read.ok) {
      const minutesAgo = Math.max(0, Math.round((now - fs.statSync(dbPath).mtime.getTime()) / 60_000));
      status = {
        ...base,
        state: 'connected',
        detail: `${read.chats} chats · ${read.unread} unread · last activity ${minutesAgo}m ago (local desktop DB, read-only)`,
        meta: { chats: read.chats, unread: read.unread, source: dbPath.includes('SMB') ? 'business' : 'consumer' },
      };
    } else if (read.timedOut) {
      status = {
        ...base,
        state: 'error',
        detail: `ChatStorage.sqlite found but the read timed out. Likely permissions: ${FDA_HINT}.`,
      };
    } else {
      status = { ...base, state: 'error', detail: `ChatStorage.sqlite exists but read failed: ${read.error}` };
    }
  }

  statusCache = { at: now, status };
  return status;
}

export async function recentChats(limit = 15): Promise<CommsItem[]> {
  const dbPath = resolveChatDb();
  if (!dbPath) return [];
  const read = await boundedRead(dbPath, 'recent', limit);
  if (!read.ok) return []; // timed out / locked / no access — degrade quietly, never hang the feed
  const { rows, maxRaw } = read;
  return rows.map((row) => ({
    source: 'whatsapp' as const,
    title: row.ZPARTNERNAME ?? 'Unknown chat',
    sender: row.ZPARTNERNAME ?? 'Unknown chat',
    preview: (row.lastText ?? '').slice(0, 140),
    ts:
      row.lastDate && row.lastDate > 0
        ? new Date(CORE_DATA_EPOCH_MS + row.lastDate * 1000).toISOString()
        : calibratedDate(row.ZLASTMESSAGEDATE ?? 0, maxRaw).toISOString(),
    unread: row.ZUNREADCOUNT ?? 0,
  }));
}
