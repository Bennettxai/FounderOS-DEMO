import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * /trading is one slab in the Brand Deals mould (the operator, 2026-09-18: "big and
 * boxy, kind of like the brand deals tab as a model"). The page stays a server
 * component that reads the same payload GET /api/trading serves and hands it
 * to a client board, which refreshes itself every 60s. Every layout call
 * the operator made on the old page survives here: both accounts side by side, the
 * agent's own value graph, the sleeve and the reasoning sharing one level row,
 * open orders naming agent vs you, honesty when nothing has traded.
 */
describe('/trading page hands the shared payload to the slab', () => {
  const page = read('app/trading/page.tsx');

  test('the page is a server component that builds the payload through the repo, every account', () => {
    expect(page).not.toMatch(/^'use client';/);
    expect(page).toMatch(/tradingPayload\(/);
    expect(page).toContain('TradingBoard');
    const payload = read('lib/trading-payload.ts');
    expect(payload).toMatch(/latestSnapshots\(\)/);
    expect(payload).toMatch(/latestAnalysis\(AGENTIC_ID\)/);
    expect(payload).toMatch(/openOrders\(\)/);
    expect(payload).toMatch(/phantomBalance\(\)/);
  });

  test('the read route serves the very same payload, so the board refresh cannot drift from first paint', () => {
    expect(read('app/api/trading/route.ts')).toMatch(/tradingPayload\(/);
  });
});

describe('the trading slab', () => {
  const board = read('components/trading/TradingBoard.tsx');

  test('is a client board that refreshes from the read route every 60s and on demand', () => {
    expect(board).toMatch(/^'use client';/);
    expect(board).toContain("fetch('/api/trading')");
    expect(board).toMatch(/setInterval\(refresh, 60_000\)/);
    expect(board).toMatch(/Refresh feed/);
  });

  test('floats as one slab with the Brand Deals motion: rise-in cards, drawn line, hatched meters, one gradient card', () => {
    expect(board).toMatch(/rounded-\[28px\]/);
    expect(board).toMatch(/@keyframes tb-rise/);
    expect(board).toMatch(/@keyframes tb-meter-in/);
    expect(board).toMatch(/@keyframes tb-drift/);
    expect((board.match(/tile-glow-a/g) ?? []).length).toBe(1);
  });

  test('renders one balance meter per account and names which one the agent may trade', () => {
    expect(board).toMatch(/accounts\.map/);
    expect(board).toMatch(/accountLabel/);
    expect(board).toMatch(/agent may trade/);
    expect(board).toMatch(/read-only to agents/);
  });

  test('gives the agent its own value graph fed by the agentic account, and says plainly when it has not traded', () => {
    expect(board).toContain('AgentTradeChart');
    expect(board).toMatch(/agentSummary\(/);
    expect(board).toMatch(/AGENTIC_ID/);
    expect(board).toMatch(/hasActed/);
    expect(board).toMatch(/sitting in cash/);
  });

  test('the sleeve and the reasoning share one row, sleeve first, on a grid that keeps them level', () => {
    const sleeve = board.indexOf('AgentTradeChart');
    const reasoning = board.indexOf('<AgentReasoning');
    expect(sleeve).toBeGreaterThan(-1);
    expect(reasoning).toBeGreaterThan(sleeve);
    // both cards sit in the same grid row; the reasoning list scrolls inside a cap instead of stretching the row
    expect(board).toMatch(/grid-cols-\[2fr_1fr\]/);
    const panel = read('components/AgentReasoning.tsx');
    expect(panel).toMatch(/overflow-y-auto/);
    expect(panel).toMatch(/No analysis pushed yet/);
  });

  test('the reasoning panel filters rows by verdict chips derived from the run', () => {
    const panel = read('components/AgentReasoning.tsx');
    expect(panel).toMatch(/^'use client';/);
    expect(panel).toMatch(/Chip/);
    expect(panel).toMatch(/'all'/);
    expect(panel).toMatch(/new Set|verdicts/);
    expect(panel).toMatch(/No .* rows|nothing marked/i);
  });

  test('open orders say who placed them, agent vs you, in the same badge language as the sleeve', () => {
    expect(board).toMatch(/placedAgent === 'agentic' \? 'ok' : 'default'/);
    expect(board).toMatch(/placedAgent === 'agentic' \? 'agent' : 'you'/);
    expect(board).toMatch(/nothing working/);
  });

  test('the trade log is filterable by who and outcome, and the full rationale lives in a drawer, never truncated away', () => {
    expect(board).toMatch(/filterActivity\(/);
    expect(board).toMatch(/activityCounts\(/);
    expect(board).toMatch(/line-clamp-2/);
    expect(board).toMatch(/setSelectedId\(/);
    expect(board).toMatch(/<aside/);
  });

  test('freshness is honest: live, stale, seeded or none, from the helper', () => {
    expect(board).toMatch(/freshness\(/);
    expect(board).toMatch(/'stale'/);
    expect(board).toMatch(/'seeded'/);
  });

  test('mounts the limits editor and the Phantom wallet card', () => {
    expect(board).toContain('TradingLimits');
    expect(board).toMatch(/Phantom/);
    expect(board).toMatch(/shortAddress\(/);
  });
});

describe('the agent chart component', () => {
  const chart = read('components/AgentTradeChart.tsx');

  test('is a client component with a hover readout', () => {
    expect(chart).toContain("'use client'");
    expect(chart).toMatch(/onMouseMove/);
    expect(chart).toMatch(/onMouseLeave/);
  });

  test('draws from the pure geometry rather than its own math', () => {
    expect(chart).toMatch(/chartGeometry\(/);
  });

  test('tells buys from sells by fill, not colour alone', () => {
    expect(chart).toMatch(/action === 'buy'/);
  });

  test('holds its box before it has a series, so nothing shifts', () => {
    expect(chart).toMatch(/aspectRatio/);
  });

  test('the line draws itself in, like the Brand Deals step-line', () => {
    expect(chart).toMatch(/pathLength=\{1\}/);
    expect(chart).toMatch(/strokeDashoffset/);
  });
});

/**
 * The limits card. the operator asked to change the agent's parameters from the OS
 * rather than by editing DEFAULT_LIMITS and redeploying, so every field the
 * agent enforces has to be present and editable.
 */
describe('/trading limits editor', () => {
  const board = read('components/trading/TradingBoard.tsx');
  const card = read('components/TradingLimits.tsx');

  const FIELDS = [
    'maxNotionalPerTradeUsd',
    'maxPositionPctOfSleeve',
    'maxRiskPctPerTrade',
    'maxConcurrentPositions',
    'maxTradesPerDay',
    'minSleeveValueUsd',
    'maxDeployedCapitalUsd',
  ];

  test('the slab mounts the card', () => {
    expect(board).toContain('<TradingLimits');
  });

  test('the card is a client component', () => {
    expect(card).toMatch(/^'use client';/);
  });

  test('every enforced field is editable, none silently omitted', () => {
    for (const f of FIELDS) expect(card, `${f} missing from the editor`).toContain(f);
  });

  test('it reads and writes the real route', () => {
    expect(card).toContain('/api/trading/limits');
    expect(card).toMatch(/method:\s*'POST'/);
  });

  test('it surfaces clamping and failure rather than always claiming success', () => {
    expect(card).toMatch(/clamped/);
    expect(card).toMatch(/error/i);
  });

  test('the Autopilot switch is on the card, off by default, and says what it arms', () => {
    expect(card).toContain('autopilot');
    expect(card).toMatch(/Autopilot/);
    expect(card).toMatch(/role="switch"/);
    expect(card).toMatch(/real orders/i);
  });

  test('the old server-page pieces are gone, not left as orphans', () => {
    expect(existsSync(join(process.cwd(), 'components/RefreshFeed.tsx'))).toBe(false);
  });
});
