import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ConnectorStatus } from '@/lib/connectors/types';

const VAULT = process.env.OBSIDIAN_VAULT ?? path.join(os.homedir(), 'Documents', 'Notes Vault');
const WALK_CAP = 5000;

function countMarkdown(dir: string, state = { files: 0, visited: 0 }): number {
  if (state.visited > WALK_CAP) return state.files;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return state.files;
  }
  for (const entry of entries) {
    state.visited++;
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) countMarkdown(full, state);
    else if (entry.name.endsWith('.md')) state.files++;
  }
  return state.files;
}

// One conversation export can run to megabytes; the memory graph only needs
// enough text for an excerpt + a lexical embedding.
const NOTE_CONTENT_CAP = 20_000;

/**
 * Read the vault's markdown notes (incl. the Chat Archive) as BrainNote-shaped
 * `{ path, content }` rows for the /brain memory constellation. Vault-relative
 * paths, dot-dirs skipped, content capped, never throws — a missing vault or a
 * macOS TCC denial yields `[]` so callers can fall back gracefully.
 */
export function readVaultNotes(vaultPath: string = VAULT): { path: string; content: string }[] {
  const notes: { path: string; content: string }[] = [];
  const state = { visited: 0 };
  const walk = (dir: string) => {
    if (state.visited > WALK_CAP) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      state.visited++;
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) {
        try {
          notes.push({
            path: path.relative(vaultPath, full).split(path.sep).join('/'),
            content: fs.readFileSync(full, 'utf8').slice(0, NOTE_CONTENT_CAP),
          });
        } catch {
          // unreadable file — skip it
        }
      }
    }
  };
  walk(vaultPath);
  return notes.sort((a, b) => a.path.localeCompare(b.path));
}

export async function obsidianStatus(): Promise<ConnectorStatus> {
  if (!fs.existsSync(VAULT)) {
    return {
      id: 'obsidian',
      name: 'Notes Vault',
      kind: 'knowledge',
      state: 'not_configured',
      detail: `Vault not found at ${VAULT} — set OBSIDIAN_VAULT to override.`,
    };
  }
  try {
    // Documents/ is TCC-protected: reading throws EPERM unless the process
    // (Terminal/launchd job) has Files & Folders access — surface that honestly.
    fs.readdirSync(VAULT);
  } catch {
    return {
      id: 'obsidian',
      name: 'Notes Vault',
      kind: 'knowledge',
      state: 'error',
      detail:
        'Vault exists but macOS denied access — grant the terminal "Files and Folders → Documents" in System Settings → Privacy.',
    };
  }
  const notes = countMarkdown(VAULT);
  return {
    id: 'obsidian',
    name: 'Notes Vault',
    kind: 'knowledge',
    state: 'connected',
    detail: `${notes.toLocaleString('en-US')} markdown notes (incl. Chat Archive) at ${VAULT.replace(os.homedir(), '~')}`,
    meta: { notes },
  };
}
