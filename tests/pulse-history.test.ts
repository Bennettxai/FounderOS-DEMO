import { describe, it, expect } from 'vitest';
import { runsPerDay, inboundPerDay, stateOfWorld } from '@/lib/pulse-history';

const NOW = Date.parse('2026-07-13T12:00:00Z'); // days 07-07 … 07-13

describe('runsPerDay — real agent-run counts bucketed by day', () => {
  it('counts runs into the last 7 UTC days, oldest first', () => {
    const runs = [
      { startedAt: '2026-07-13T09:00:00Z' },
      { startedAt: '2026-07-13T01:00:00Z' },
      { startedAt: '2026-07-12T23:00:00Z' },
      { startedAt: '2026-07-08T10:00:00Z' },
      { startedAt: '2026-07-01T10:00:00Z' }, // outside the window
    ];
    expect(runsPerDay(runs, 7, NOW)).toEqual([0, 1, 0, 0, 0, 1, 2]);
  });

  it('returns an all-zero series of the right length when there are no runs', () => {
    expect(runsPerDay([], 7, NOW)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('ignores unparseable timestamps', () => {
    expect(runsPerDay([{ startedAt: 'nope' }, { startedAt: '2026-07-13T00:00:00Z' }], 7, NOW)).toEqual([
      0, 0, 0, 0, 0, 0, 1,
    ]);
  });
});

describe('inboundPerDay — real inbound counts bucketed by day', () => {
  it('counts feed items by their ts into the last N days', () => {
    const items = [
      { ts: '2026-07-13T08:00:00Z' },
      { ts: '2026-07-11T08:00:00Z' },
      { ts: '2026-07-11T09:00:00Z' },
    ];
    expect(inboundPerDay(items, 7, NOW)).toEqual([0, 0, 0, 0, 2, 0, 1]);
  });
});

describe('stateOfWorld — honest attention-first status line', () => {
  const base = {
    activeAgents: 5,
    totalAgents: 8,
    connected: 6,
    totalConnectors: 6,
    inbound: 0,
    health: 92,
    brainConnected: true,
    failedRuns: 0,
  };

  it('leads with "All nominal" when nothing needs attention', () => {
    const segs = stateOfWorld(base);
    expect(segs[0]).toEqual({ text: 'All nominal', tone: 'ok' });
    expect(segs.at(-1)).toEqual({ text: '5/8 agents live', tone: 'ok' });
  });

  it('surfaces failed runs first, in error tone', () => {
    const segs = stateOfWorld({ ...base, failedRuns: 2 });
    expect(segs[0]).toEqual({ text: '2 runs failed', tone: 'err' });
    expect(segs.some((s) => s.text === 'All nominal')).toBe(false);
  });

  it('reports a degraded brain and down connectors', () => {
    const segs = stateOfWorld({ ...base, health: 55, connected: 4, totalConnectors: 6 });
    expect(segs).toContainEqual({ text: 'G-Brain degraded 55/100', tone: 'warn' });
    expect(segs).toContainEqual({ text: '2 connectors down', tone: 'warn' });
  });

  it('reports an offline brain as an error', () => {
    const segs = stateOfWorld({ ...base, brainConnected: false, health: null });
    expect(segs).toContainEqual({ text: 'G-Brain offline', tone: 'err' });
  });

  it('flags inbound needing reply', () => {
    const segs = stateOfWorld({ ...base, inbound: 7 });
    expect(segs).toContainEqual({ text: '7 inbound need reply', tone: 'accent' });
  });

  it('singularizes one failed run and one connector down', () => {
    const segs = stateOfWorld({ ...base, failedRuns: 1, connected: 5, totalConnectors: 6 });
    expect(segs).toContainEqual({ text: '1 run failed', tone: 'err' });
    expect(segs).toContainEqual({ text: '1 connector down', tone: 'warn' });
  });
});
