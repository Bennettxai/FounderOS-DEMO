/**
 * Live agent activity feed. Unions the three things agents actually do — runs,
 * chat replies (assistant + tool turns), and broadcast replies — into one
 * newest-first stream for the /agents page. Read-only; pure projection over the
 * existing repos.
 */
import { ActivityEventSchema, type ActivityEvent } from '@/lib/schemas';
import type { FounderDb } from '@/lib/db';

export function recentActivity(db: FounderDb, limit = 50): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const run of db.agentRuns.recent(limit)) {
    events.push({ kind: 'run', agentId: run.agentId, at: run.startedAt, summary: run.summary, ok: run.ok });
  }

  for (const msg of db.agentMessages.recent(limit)) {
    if (msg.role === 'user') continue; // the feed is what the agent did, not what you asked
    const summary =
      msg.role === 'tool'
        ? `tool · ${msg.toolCalls.map((c) => c.name).join(', ')}`
        : msg.content;
    events.push({ kind: 'message', agentId: msg.agentId, at: msg.createdAt, summary: summary.slice(0, 200) });
  }

  for (const b of db.broadcasts.recent(limit)) {
    for (const reply of b.replies) {
      events.push({ kind: 'broadcast', agentId: reply.agentId, at: reply.finishedAt, summary: reply.reply.slice(0, 200), ok: reply.ok });
    }
  }

  return events
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit)
    .map((e) => ActivityEventSchema.parse(e));
}
