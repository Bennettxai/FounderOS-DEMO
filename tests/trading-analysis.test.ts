import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { TradeAnalysisSchema } from '@/lib/schemas';

/**
 * The agent's reasoning, not its fills.
 *
 * On most days this strategy trades nothing, which is correct but leaves the
 * trade log empty — and the trade log can only hold buys and sells anyway. So
 * each run also pushes what it examined and why, and /trading shows it beside
 * the sleeve. Without this the dashboard looks dead on exactly the days the
 * agent did the most work.
 */

let db: FounderDb;
afterEach(() => db?.close());

const ANALYSIS = {
  id: 'run-2026-08-13T19-49',
  at: '2026-08-13T19:49:32.000Z',
  accountId: 'agentic',
  agent: 'Markets Agent',
  examined: 50,
  signals: 0,
  notes: 'NO TRADE TODAY. 48 tickers pulled, 46 with usable data.',
  rows: [
    { ticker: 'BSX', score: 95, verdict: 'no-signal', reason: 'Zone 46.10-48.35, five touches across five years.' },
    { ticker: 'WAT', score: 50, verdict: 'dropped', reason: 'Cluster spans only two calendar years.' },
  ],
};

describe('TradeAnalysisSchema', () => {
  test('accepts a well-formed run and defaults rows to empty', () => {
    expect(TradeAnalysisSchema.parse(ANALYSIS)).toEqual(ANALYSIS);
    expect(TradeAnalysisSchema.parse({ ...ANALYSIS, rows: undefined }).rows).toEqual([]);
  });

  test('allows an unscored ticker, because the agent cannot always score one', () => {
    const r = TradeAnalysisSchema.parse({
      ...ANALYSIS,
      rows: [{ ticker: 'META', score: null, verdict: 'no-signal', reason: 'Only 28 sessions of daily bars.' }],
    });
    expect(r.rows[0].score).toBeNull();
  });

  test('rejects a run with no account or a negative count', () => {
    expect(() => TradeAnalysisSchema.parse({ ...ANALYSIS, accountId: '' })).toThrow();
    expect(() => TradeAnalysisSchema.parse({ ...ANALYSIS, examined: -1 })).toThrow();
  });
});

describe('trading.recordAnalysis', () => {
  test('round-trips a run, rows and all', () => {
    db = openDb(':memory:');
    expect(db.trading.latestAnalysis('agentic')).toBeNull();

    db.trading.recordAnalysis(ANALYSIS);
    const back = db.trading.latestAnalysis('agentic');
    expect(back).toEqual(ANALYSIS);
  });

  test('keeps the newest run per account', () => {
    db = openDb(':memory:');
    db.trading.recordAnalysis(ANALYSIS);
    db.trading.recordAnalysis({ ...ANALYSIS, id: 'newer', at: '2026-08-13T20:30:00.000Z', examined: 12, signals: 1 });

    const back = db.trading.latestAnalysis('agentic')!;
    expect(back.id).toBe('newer');
    expect(back.examined).toBe(12);
  });

  test('does not mix accounts', () => {
    db = openDb(':memory:');
    db.trading.recordAnalysis(ANALYSIS);
    expect(db.trading.latestAnalysis('individual')).toBeNull();
  });

  test('is idempotent on id, so a retried push does not duplicate', () => {
    db = openDb(':memory:');
    db.trading.recordAnalysis(ANALYSIS);
    db.trading.recordAnalysis(ANALYSIS);
    expect(db.trading.analyses('agentic').length).toBe(1);
  });

  test('keeps history so past runs stay auditable', () => {
    db = openDb(':memory:');
    db.trading.recordAnalysis(ANALYSIS);
    db.trading.recordAnalysis({ ...ANALYSIS, id: 'older', at: '2026-08-12T19:49:00.000Z' });
    expect(db.trading.analyses('agentic').map((a) => a.id)).toEqual([ANALYSIS.id, 'older']);
  });
});
