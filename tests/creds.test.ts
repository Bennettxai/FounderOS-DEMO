import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  parseEnvFile,
  extractMcpEnvKey,
  readEnvLocal,
  upsertEnvLocal,
  removeEnvLocal,
  resolveCred,
  runtimeEnv,
} from '@/lib/creds';

describe('parseEnvFile', () => {
  test('parses KEY=value lines and ignores comments and blanks', () => {
    const content = [
      '# Zernio',
      'ZERNIO_API_KEY=zk_live_abc123',
      '',
      'export MIRO_ACCESS_TOKEN=mt-456',
      'EMPTY=',
      'QUOTED="with spaces"',
      "SINGLE='single'",
    ].join('\n');
    const parsed = parseEnvFile(content);
    expect(parsed.ZERNIO_API_KEY).toBe('zk_live_abc123');
    expect(parsed.MIRO_ACCESS_TOKEN).toBe('mt-456');
    expect(parsed.EMPTY).toBe('');
    expect(parsed.QUOTED).toBe('with spaces');
    expect(parsed.SINGLE).toBe('single');
    expect(Object.keys(parsed)).not.toContain('# Zernio');
  });

  test('keeps = signs inside values', () => {
    expect(parseEnvFile('AUTH=Basic dXNlcjpwYXNz==').AUTH).toBe('Basic dXNlcjpwYXNz==');
  });
});

describe('extractMcpEnvKey', () => {
  test('pulls an env value out of a claude.json mcpServers entry', () => {
    const claudeJson = {
      mcpServers: {
        attio: { command: 'npx', args: ['attio-mcp'], env: { ATTIO_API_KEY: 'att_secret' } },
      },
    };
    expect(extractMcpEnvKey(claudeJson, 'attio', 'ATTIO_API_KEY')).toBe('att_secret');
  });

  test('returns undefined when the server or key is missing', () => {
    expect(extractMcpEnvKey({}, 'attio', 'ATTIO_API_KEY')).toBeUndefined();
    expect(extractMcpEnvKey({ mcpServers: { attio: {} } }, 'attio', 'ATTIO_API_KEY')).toBeUndefined();
  });
});

describe('env.local as a live credential store (connect flow)', () => {
  let tmp: string;
  const prevOverride = process.env.FOUNDER_OS_ENV_LOCAL;

  beforeEach(() => {
    tmp = path.join(os.tmpdir(), `alex-env-local-${process.pid}-${Math.random().toString(36).slice(2)}`);
    process.env.FOUNDER_OS_ENV_LOCAL = tmp;
  });
  afterEach(() => {
    if (prevOverride === undefined) delete process.env.FOUNDER_OS_ENV_LOCAL;
    else process.env.FOUNDER_OS_ENV_LOCAL = prevOverride;
    try { fs.unlinkSync(tmp); } catch {}
  });

  test('upsertEnvLocal creates the file and readEnvLocal round-trips', () => {
    upsertEnvLocal({ FOO_API_KEY: 'abc123' });
    expect(readEnvLocal().FOO_API_KEY).toBe('abc123');
  });

  test('upsert updates in place and preserves unrelated lines and comments', () => {
    fs.writeFileSync(tmp, '# comment stays\nKEEP_ME=yes\nFOO_API_KEY=old\n');
    upsertEnvLocal({ FOO_API_KEY: 'new', ADDED_KEY: 'v2' });
    const raw = fs.readFileSync(tmp, 'utf8');
    expect(raw).toContain('# comment stays');
    expect(raw).toContain('KEEP_ME=yes');
    expect(readEnvLocal().FOO_API_KEY).toBe('new');
    expect(readEnvLocal().ADDED_KEY).toBe('v2');
    expect(raw.match(/FOO_API_KEY=/g)).toHaveLength(1);
  });

  test('removeEnvLocal deletes only the named keys', () => {
    upsertEnvLocal({ A_KEY: '1', B_KEY: '2' });
    removeEnvLocal(['A_KEY']);
    const saved = readEnvLocal();
    expect(saved.A_KEY).toBeUndefined();
    expect(saved.B_KEY).toBe('2');
  });

  test('resolveCred prefers a fresh env.local read over a stale process.env', () => {
    process.env.STALE_TEST_KEY = 'from-boot';
    upsertEnvLocal({ STALE_TEST_KEY: 'from-file' });
    expect(resolveCred('STALE_TEST_KEY', [])).toBe('from-file');
    delete process.env.STALE_TEST_KEY;
    expect(resolveCred('STALE_TEST_KEY', [])).toBe('from-file');
  });

  test('runtimeEnv overlays env.local onto process.env', () => {
    process.env.ONLY_PROCESS_KEY = 'proc';
    upsertEnvLocal({ ONLY_FILE_KEY: 'file' });
    const env = runtimeEnv();
    expect(env.ONLY_PROCESS_KEY).toBe('proc');
    expect(env.ONLY_FILE_KEY).toBe('file');
    delete process.env.ONLY_PROCESS_KEY;
  });
});
