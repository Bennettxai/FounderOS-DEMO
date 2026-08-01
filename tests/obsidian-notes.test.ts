import { describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readVaultNotes } from '@/lib/connectors/obsidian';

function tmpVault(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'obsidian-vault-'));
  writeFileSync(path.join(dir, 'Welcome.md'), '# Welcome\nhello vault');
  mkdirSync(path.join(dir, 'Chat Archive'), { recursive: true });
  writeFileSync(path.join(dir, 'Chat Archive', 'chat-one.md'), '# Chat one\nAlex asked about agents.');
  mkdirSync(path.join(dir, '.obsidian'), { recursive: true });
  writeFileSync(path.join(dir, '.obsidian', 'config.md'), 'should be ignored');
  return dir;
}

describe('readVaultNotes', () => {
  test('reads markdown notes with vault-relative paths, skipping dot dirs', () => {
    const notes = readVaultNotes(tmpVault());
    expect(notes.map((n) => n.path).sort()).toEqual(['Chat Archive/chat-one.md', 'Welcome.md']);
    expect(notes.find((n) => n.path === 'Welcome.md')!.content).toContain('hello vault');
  });

  test('caps oversized note content so one huge conversation cannot bloat the graph build', () => {
    const dir = tmpVault();
    writeFileSync(path.join(dir, 'huge.md'), `# Huge\n${'x'.repeat(200_000)}`);
    const huge = readVaultNotes(dir).find((n) => n.path === 'huge.md')!;
    expect(huge.content.length).toBeLessThanOrEqual(20_000);
  });

  test('missing or unreadable vault → empty list, no throw', () => {
    expect(readVaultNotes('/nonexistent/vault/path')).toEqual([]);
  });
});
