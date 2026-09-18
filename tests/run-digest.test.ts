import { describe, expect, it } from 'vitest';
import { collapseRuns } from '@/lib/agents/run-digest';

type Row = { id: string; agentId: string; summary: string; ok: boolean; finishedAt: string };

const run = (id: string, agentId: string, summary: string, ok = true, finishedAt = `2026-09-06T00:00:${id.padStart(2, '0')}Z`): Row => ({
  id,
  agentId,
  summary,
  ok,
  finishedAt,
});

describe('collapseRuns', () => {
  it('keeps distinct runs untouched and reports repeat 1', () => {
    const rows = [run('3', 'a', 'alpha'), run('2', 'b', 'beta'), run('1', 'a', 'gamma')];
    const out = collapseRuns(rows);
    expect(out.map((r) => r.id)).toEqual(['3', '2', '1']);
    expect(out.every((r) => r.repeat === 1)).toBe(true);
  });

  it('collapses a polling cron that emits the same summary over and over', () => {
    // What the home page actually shows today: cron-plaud-ingest-30m firing
    // 48x/day with a byte-identical summary, drowning every other agent.
    const rows = [
      run('9', 'sales-calls-data', 'Recorders: 20 recordings, 1 in brain'),
      run('8', 'sales-calls-data', 'Recorders: 20 recordings, 1 in brain'),
      run('7', 'crm-pulse', 'Attio connected'),
      run('6', 'sales-calls-data', 'Recorders: 20 recordings, 1 in brain'),
    ];
    const out = collapseRuns(rows);
    expect(out.map((r) => r.id)).toEqual(['9', '7']);
    expect(out[0].repeat).toBe(3);
    expect(out[1].repeat).toBe(1);
  });

  it('keeps the newest row of a collapsed group so timestamps stay honest', () => {
    const rows = [
      run('5', 'a', 'same', true, '2026-09-06T06:00:00Z'),
      run('4', 'a', 'same', true, '2026-09-06T05:00:00Z'),
    ];
    expect(collapseRuns(rows)[0].finishedAt).toBe('2026-09-06T06:00:00Z');
  });

  it('does not merge a failure into a success with the same text', () => {
    const rows = [run('2', 'a', 'same', false), run('1', 'a', 'same', true)];
    const out = collapseRuns(rows);
    expect(out).toHaveLength(2);
    expect(out[0].ok).toBe(false);
  });

  it('does not merge across agents', () => {
    const rows = [run('2', 'a', 'same'), run('1', 'b', 'same')];
    expect(collapseRuns(rows)).toHaveLength(2);
  });

  it('applies the limit after collapsing, not before', () => {
    const rows = [
      run('4', 'a', 'noise'),
      run('3', 'a', 'noise'),
      run('2', 'a', 'noise'),
      run('1', 'b', 'signal'),
    ];
    const out = collapseRuns(rows, 2);
    expect(out.map((r) => r.id)).toEqual(['4', '1']);
  });

  it('returns an empty list for no runs', () => {
    expect(collapseRuns([])).toEqual([]);
  });
});
