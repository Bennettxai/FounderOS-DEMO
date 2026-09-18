import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * the operator, 2026-08-21: "make sure what's displayed is what's actually the
 * model."
 *
 * The Conductor header read "the real CEO · claude-fable-5 on the company
 * board" as a literal string. On the day he asked, the seat was actually on
 * claude-haiku-4-5, and had been through nineteen model changes that morning.
 * The label had been wrong for days and could not become right, because
 * nothing fed it.
 *
 * The component already takes a `model` prop, both call sites already pass the
 * live board value, and the composer chip below already renders it. Only the
 * header was hardcoded.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('the Conductor header states the real model', () => {
  test('no model id is hardcoded anywhere in the component', () => {
    const src = read('components/ConductorChat.tsx');
    expect(src).not.toMatch(/claude-(fable|opus|sonnet|haiku|mythos)-[\d-]+/);
  });

  test('the header renders the model prop', () => {
    const src = read('components/ConductorChat.tsx');
    const header = src.slice(src.indexOf('CONDUCTOR'), src.indexOf('CONDUCTOR') + 600);
    expect(header).toContain('{model');
  });

  test('it says so honestly when the board did not report a model', () => {
    // An unreachable board must not silently render a blank or a stale guess.
    expect(read('components/ConductorChat.tsx')).toMatch(/model unknown|unknown model/i);
  });

  test('both call sites still feed it live board data', () => {
    expect(read('app/agents/page.tsx')).toContain("liveAgents.find((a) => a.name === 'Conductor')?.model");
    expect(read('components/ChatHub.tsx')).toContain('model={conductorModel}');
  });
});
