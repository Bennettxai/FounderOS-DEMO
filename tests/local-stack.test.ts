import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * The local stack check must list what the operator actually runs.
 *
 * 2026-08-18, verbatim: "I don't use fucking OpenClaw, so remove that and
 * change that to Hermes. You should have Paperclip because I don't use Tmux."
 * Both were leftovers from the pre-mini era, so the board was reporting on two
 * things that do not exist here and omitting the two that the whole agent
 * company depends on.
 */
const src = readFileSync(join(process.cwd(), 'lib/connectors/local-stack.ts'), 'utf8');

describe('local stack checks the real stack', () => {
  test('OpenClaw and tmux are gone as CHECKS', () => {
    // asserts the checks, not the prose: the comment recording why they were
    // removed is worth keeping for whoever reads this next
    expect(src).not.toContain("name: 'openclaw'");
    expect(src).not.toContain("name: 'tmux'");
    expect(src).not.toContain('18789'); // the OpenClaw gateway port
    expect(src).not.toContain("'tmux',"); // the shelled-out command
  });

  test('Hermes replaces OpenClaw, on the gateway port', () => {
    expect(src).toContain("name: 'hermes'");
    expect(src).toContain('8642');
  });

  test('Paperclip replaces tmux, on the board port', () => {
    expect(src).toContain("name: 'paperclip'");
    expect(src).toContain('3100');
  });

  test('only things the OS itself runs or shells out to are listed', () => {
    for (const dead of ['command-center', 'command-center', 'ollama', 'remotion', 'higgsfield']) {
      expect(src, dead).not.toContain(`name: '${dead}'`);
    }
    // no self-check: it reported DOWN on the host while serving the page
    expect(src).not.toContain("name: 'founder-os'");
    for (const real of ['paperclip', 'hermes', 'gbrain', 'ffmpeg', 'pdftotext', 'gh']) {
      expect(src, real).toContain(`name: '${real}'`);
    }
  });

  test('the two agent services are checked by ping, not by shelling out', () => {
    // tmux needed execFile; both replacements are HTTP, so the child-process
    // dependency goes with it — one less thing to hang the connections board.
    expect(src).not.toContain('execFile');
  });
});
