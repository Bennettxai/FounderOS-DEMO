import { NextResponse } from 'next/server';
import { planFailover } from '@/lib/agent-failover';
import {
  clearPaperclipAgentError,
  invokePaperclipHeartbeat,
  paperclipAgents,
  paperclipFailoverRuns,
  postFailoverAlert,
  repairCockpitIssue,
  setPaperclipAgentModel,
} from '@/lib/connectors/paperclip';

export const dynamic = 'force-dynamic';

/**
 * Model failover for the Paperclip board.
 *
 * GET is a dry run: it reports which models look out of budget and where each
 * affected seat would move, and writes nothing. POST applies it.
 *
 * The tick in instrumentation.ts POSTs this on a timer, so a seat that runs dry
 * comes back on the next model without anyone noticing. Applying is idempotent:
 * once a seat has moved off the exhausted model it no longer matches, so a
 * repeated POST is a no-op rather than a slide down the ladder.
 *
 * Restoring the preferred model stays manual on purpose. Auto-promotion needs a
 * health signal for a model nothing is currently calling, and guessing that
 * wrong means flapping the CEO seat between two models.
 *
 *: two failures the ladder must not touch. A Codex 5-hour window
 * parks the seat; the plan's `resumes` clear-error + re-wake it once the window
 * has rolled, no config change. An expired Claude login on the board host is a
 * person's job; both land on the cockpit thread as `alerts`, once per failing
 * run, so a parked seat is never silent again.
 */
async function currentPlan() {
  const [agents, runs] = await Promise.all([paperclipAgents(), paperclipFailoverRuns(40)]);
  const plan = planFailover({
    agents: agents.map((a) => ({ id: a.id, name: a.name, model: a.model, status: a.status })),
    runs,
  });
  const notes = [...plan.notes];
  if (agents.length === 0) notes.push('board unreachable or unconfigured, nothing inspected');
  return { agents, plan: { ...plan, notes } };
}

export async function GET() {
  const { agents, plan } = await currentPlan();
  return NextResponse.json({ ok: true, applied: false, inspected: agents.length, ...plan });
}

export async function POST() {
  const { agents, plan } = await currentPlan();
  const status = new Map(agents.map((a) => [a.id, a.status]));
  const applied: {
    agentName: string;
    from: string;
    to: string;
    moved: boolean;
    errorCleared: boolean;
    reWoken: boolean;
  }[] = [];

  for (const action of plan.actions) {
    const moved = await setPaperclipAgentModel(action.agentId, action.to).catch(() => false);
    // Only a seat parked in `error` needs clearing; a healthy seat must not be
    // touched, and its next scheduled run already picks up the new model.
    const errorCleared =
      moved && status.get(action.agentId) === 'error'
        ? await clearPaperclipAgentError(action.agentId).catch(() => false)
        : false;
    const reWoken = errorCleared ? await invokePaperclipHeartbeat(action.agentId).catch(() => false) : false;
    applied.push({ agentName: action.agentName, from: action.from, to: action.to, moved, errorCleared, reWoken });
    console.log(
      `[failover] ${action.agentName}: ${action.from} -> ${action.to} (${action.reason})` +
        ` moved=${moved} cleared=${errorCleared} woken=${reWoken}`,
    );
  }

  const resumed: { agentName: string; reason: string; errorCleared: boolean; reWoken: boolean }[] = [];
  for (const r of plan.resumes) {
    const errorCleared = await clearPaperclipAgentError(r.agentId).catch(() => false);
    const reWoken = errorCleared ? await invokePaperclipHeartbeat(r.agentId).catch(() => false) : false;
    resumed.push({ agentName: r.agentName, reason: r.reason, errorCleared, reWoken });
    console.log(`[failover] ${r.agentName}: resumed (${r.reason}) cleared=${errorCleared} woken=${reWoken}`);
  }

  const alerted: { agentName: string; kind: string; runFinishedAt: string; result: string }[] = [];
  for (const a of plan.alerts) {
    const result = await postFailoverAlert(a);
    alerted.push({ agentName: a.agentName, kind: a.kind, runFinishedAt: a.runFinishedAt, result });
    if (result !== 'already') console.log(`[failover] ${a.agentName}: ${a.kind} alert ${result} (${a.message})`);
  }

  // The cockpit issue must stay in backlog with a human co-owner, or the
  // board's handoff + recovery automations re-wake the Conductor after every
  // run (the OS-246 loop). Any checkout undoes that shape, so the
  // tick puts it back.
  const cockpit = await repairCockpitIssue();
  if (cockpit === 'patched' || cockpit === 'failed') console.log(`[failover] cockpit issue repair: ${cockpit}`);

  return NextResponse.json({
    ok: true,
    applied: true,
    inspected: agents.length,
    exhausted: plan.exhausted,
    notes: plan.notes,
    actions: applied,
    resumes: resumed,
    alerts: alerted,
    cockpit,
  });
}
