import { describe, expect, test } from 'vitest';
import { buildPaletteCommands, filterPalette, type PaletteAgent, type PaletteCommand } from '@/lib/palette';
import { NAV_ORDER } from '@/lib/nav';

const AGENTS: PaletteAgent[] = [
  { id: 'inbox-triage', name: 'Inbox Triage', role: 'Communications' },
  { id: 'markets', name: 'Markets Agent', role: 'Finances' },
];

const cmds = buildPaletteCommands(AGENTS);

describe('buildPaletteCommands', () => {
  test('has a Go-to command for every nav view', () => {
    const goHrefs = cmds.filter((c) => c.kind === 'go').map((c) => c.href);
    for (const href of NAV_ORDER) expect(goHrefs).toContain(href);
  });

  test('has one Run command per agent, carrying the agent id for the run POST', () => {
    const runs = cmds.filter((c) => c.kind === 'run');
    expect(runs).toHaveLength(AGENTS.length);
    expect(runs.map((r) => r.agentId).sort()).toEqual(['inbox-triage', 'markets']);
    expect(runs.every((r) => !r.href)).toBe(true);
  });

  test('has Conductor Ask prompts (3+) plus a G-Brain jump', () => {
    const asks = cmds.filter((c) => c.kind === 'ask');
    const prompts = asks.filter((a) => a.prompt);
    expect(prompts.length).toBeGreaterThanOrEqual(3);
    // prompts are real messages, not labels
    for (const p of prompts) expect(p.prompt!.length).toBeGreaterThan(10);
    expect(asks.some((a) => a.href === '/brain')).toBe(true);
  });

  test('command ids are unique', () => {
    const ids = cmds.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('filterPalette', () => {
  test('empty query returns everything in scope', () => {
    expect(filterPalette(cmds, '', 'all')).toEqual(cmds);
    expect(filterPalette(cmds, '', 'run').every((c) => c.kind === 'run')).toBe(true);
  });

  test('scope narrows to one kind', () => {
    const asks = filterPalette(cmds, '', 'ask');
    expect(asks.length).toBeGreaterThan(0);
    expect(asks.every((c) => c.kind === 'ask')).toBe(true);
  });

  test('every word must match: "run inbox" finds the agent via its kind + name', () => {
    const hits = filterPalette(cmds, 'run inbox', 'all');
    expect(hits.map((c) => c.agentId)).toContain('inbox-triage');
    expect(hits.every((c) => c.kind === 'run')).toBe(true);
  });

  test('nav aliases match: "gbrain" finds the /brain view', () => {
    const hits = filterPalette(cmds, 'gbrain', 'go');
    expect(hits.map((c) => c.href)).toContain('/brain');
  });

  test('"go comms" style: kind words match go commands', () => {
    const hits = filterPalette(cmds, 'jump comms', 'all');
    expect(hits.map((c) => c.href)).toContain('/comms');
  });

  test('garbage query matches nothing', () => {
    expect(filterPalette(cmds, 'zzzqqq', 'all')).toEqual([]);
  });
});
