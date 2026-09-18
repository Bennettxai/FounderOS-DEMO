import { afterEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { recentWisprNotes } from '@/lib/connectors/wispr';

const tmpDirs: string[] = [];

/** Build a throwaway flow.sqlite with the real Wispr table shapes + rows. */
function makeFlowDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wispr-'));
  tmpDirs.push(dir);
  const file = path.join(dir, 'flow.sqlite');
  const db = new Database(file);
  db.exec(`
    CREATE TABLE History (
      transcriptEntityId TEXT, asrText TEXT, formattedText TEXT, editedText TEXT,
      timestamp TEXT, app TEXT, numWords INTEGER, isArchived INTEGER
    );
    CREATE TABLE Notes (
      id TEXT, title TEXT, contentPreview TEXT, createdAt TEXT, modifiedAt TEXT, isDeleted INTEGER
    );
    CREATE TABLE Todos (
      id TEXT, title TEXT, status TEXT, createdAt TEXT, isDeleted INTEGER, isArchived INTEGER
    );
  `);
  const h = db.prepare(
    `INSERT INTO History (transcriptEntityId, asrText, formattedText, editedText, timestamp, app, numWords, isArchived) VALUES (?,?,?,?,?,?,?,?)`,
  );
  // newest, prefers editedText
  h.run('h1', 'raw one', 'fmt one', 'edited one', '2026-07-27T12:00:00.000Z', 'Mail', 2, 0);
  // older, no editedText -> falls back to formattedText
  h.run('h2', 'raw two', 'fmt two', null, '2026-07-27T09:00:00.000Z', 'Slack', 2, 0);
  // no editedText/formattedText -> asrText
  h.run('h3', 'raw three', null, null, '2026-07-26T09:00:00.000Z', 'Notes', 2, 0);
  // archived -> excluded
  h.run('h4', 'archived', 'archived', 'archived', '2026-07-27T13:00:00.000Z', 'Mail', 1, 1);
  // empty text -> excluded
  h.run('h5', '', '', '', '2026-07-27T13:30:00.000Z', 'Mail', 0, 0);

  const n = db.prepare(`INSERT INTO Notes (id, title, contentPreview, createdAt, modifiedAt, isDeleted) VALUES (?,?,?,?,?,?)`);
  n.run('n1', 'A real note', 'preview', '2026-07-25T08:00:00.000Z', '2026-07-27T11:00:00.000Z', 0);
  n.run('n2', 'Deleted note', 'x', '2026-07-25T08:00:00.000Z', '2026-07-27T11:30:00.000Z', 1); // excluded

  const t = db.prepare(`INSERT INTO Todos (id, title, status, createdAt, isDeleted, isArchived) VALUES (?,?,?,?,?,?)`);
  t.run('t1', 'Ship the board', 'open', '2026-07-27T10:00:00.000Z', 0, 0);
  t.run('t2', 'Archived todo', 'done', '2026-07-27T10:00:00.000Z', 0, 1); // excluded

  db.close();
  return file;
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('recentWisprNotes', () => {
  test('reads History/Notes/Todos, excludes archived/deleted/empty, sorts newest first', async () => {
    const file = makeFlowDb();
    const notes = await recentWisprNotes(40, file);

    const ids = notes.map((n) => n.id);
    expect(ids).not.toContain('h4'); // archived dictation
    expect(ids).not.toContain('h5'); // empty text
    expect(ids).not.toContain('n2'); // deleted note

    // sorted by ts DESC
    const times = notes.map((n) => Date.parse(n.ts));
    expect(times).toEqual([...times].sort((a, b) => b - a));

    // dictation text preference: edited > formatted > asr
    const byId = new Map(notes.map((n) => [n.id, n]));
    expect(byId.get('h1')?.text).toBe('edited one');
    expect(byId.get('h2')?.text).toBe('fmt two');
    expect(byId.get('h3')?.text).toBe('raw three');
    expect(byId.get('h1')?.app).toBe('Mail');
    expect(byId.get('h1')?.kind).toBe('dictation');

    // notes + todos included, tagged, app null
    expect(byId.get('n1')?.kind).toBe('note');
    expect(byId.get('n1')?.app).toBeNull();
    expect(byId.get('t1')?.kind).toBe('todo');
    expect(byId.get('t1')?.text).toContain('Ship the board');
  });

  test('respects the limit', async () => {
    const file = makeFlowDb();
    expect((await recentWisprNotes(2, file)).length).toBe(2);
  });

  test('missing database degrades to an empty list, never throws', async () => {
    await expect(recentWisprNotes(10, '/nope/does/not/exist/flow.sqlite')).resolves.toEqual([]);
  });
});
