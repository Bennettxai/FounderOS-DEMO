import { afterEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveChatDb, whatsappContainerPaths } from '@/lib/connectors/whatsapp';

const tmpDirs: string[] = [];
function tmpFile(name: string, mtimeMs?: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-'));
  tmpDirs.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, 'x');
  if (mtimeMs != null) fs.utimesSync(file, mtimeMs / 1000, mtimeMs / 1000);
  return file;
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('resolveChatDb', () => {
  test('returns null when no candidate database exists', () => {
    expect(resolveChatDb(['/nope/a/ChatStorage.sqlite', '/nope/b/ChatStorage.sqlite'])).toBeNull();
  });

  test('returns the one existing database', () => {
    const real = tmpFile('ChatStorage.sqlite');
    expect(resolveChatDb(['/nope/ChatStorage.sqlite', real])).toBe(real);
  });

  test('prefers the most recently modified database (the app actually in use)', () => {
    const older = tmpFile('ChatStorage.sqlite', 1_700_000_000_000);
    const newer = tmpFile('ChatStorage.sqlite', 1_800_000_000_000);
    expect(resolveChatDb([older, newer])).toBe(newer);
    expect(resolveChatDb([newer, older])).toBe(newer);
  });
});

describe('whatsappContainerPaths', () => {
  test('includes both the consumer and Business (SMB) ChatStorage paths', () => {
    const paths = whatsappContainerPaths();
    expect(paths.some((p) => p.includes('group.net.whatsapp.WhatsApp.shared'))).toBe(true);
    expect(paths.some((p) => p.includes('group.net.whatsapp.WhatsAppSMB.shared'))).toBe(true);
    expect(paths.every((p) => p.endsWith('ChatStorage.sqlite'))).toBe(true);
  });
});
