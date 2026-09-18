import { NextResponse } from 'next/server';
import { paperclipAgents, paperclipIssues, paperclipRuns } from '@/lib/connectors/paperclip';
import { getDb } from '@/lib/data';
import type { BoardLivePayload } from '@/lib/board-live';

export const dynamic = 'force-dynamic';

/**
 * One aggregated snapshot of the live Paperclip board: seats (with status +
 * model), the task queue, and recent heartbeat runs. The BoardLive strip on
 * /agents polls this every few seconds. Unreachable board = honest
 * `connected: false` with empty lists, still a 200, never fake data.
 */
export async function GET() {
  const [agents, issues, runs] = await Promise.all([
    paperclipAgents(),
    // Must match the depth /agents renders with: this route overwrites that
    // payload every few seconds, so a shallower cap here would quietly undo it.
    // At 40 the board's finished issues filled the whole response and the lanes
    // collapsed to DONE alone while two tasks were genuinely open.
    paperclipIssues(250),
    paperclipRuns(120),
  ]);
  // The operator's approve / dismiss calls on board tasks, from the same store the
  // deliverables queue writes to, so the poll never loses one
  const decisions = getDb().deliverableDecisions.all();
  const payload: BoardLivePayload = {
    connected: agents.length > 0,
    agents,
    issues,
    runs,
    checkedAt: new Date().toISOString(),
    decisions,
  };
  return NextResponse.json(payload);
}
