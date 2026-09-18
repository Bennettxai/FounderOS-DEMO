import type { AgentMessage } from '@/lib/schemas';

/**
 * The /chats hub shaping: see every chat and speak to whatever agent is
 * wanted directly, similar to how Claude's own chat surface works. Pure: the
 * page feeds it rows from `agent_messages`, the hub renders
 * one conversation per agent, newest activity first.
 */
export type ConversationSummary = {
  agentId: string;
  agentName: string;
  lastMessage: string;
  lastAt: string;
  messageCount: number;
};

const PREVIEW_MAX = 140;

/** One line, capped — a Claude-style list row preview, never a wall of text. */
function preview(content: string): string {
  const line = content.replace(/\s+/g, ' ').trim();
  return line.length > PREVIEW_MAX ? `${line.slice(0, PREVIEW_MAX - 1)}…` : line;
}

export function conversationSummaries(
  messages: AgentMessage[],
  names: Map<string, string>,
): ConversationSummary[] {
  const byAgent = new Map<string, AgentMessage[]>();
  for (const m of messages) {
    (byAgent.get(m.agentId) ?? byAgent.set(m.agentId, []).get(m.agentId)!).push(m);
  }
  const out: ConversationSummary[] = [];
  for (const [agentId, rows] of byAgent) {
    const sorted = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const last = sorted[sorted.length - 1];
    out.push({
      agentId,
      agentName: names.get(agentId) ?? agentId,
      lastMessage: preview(last.content),
      lastAt: last.createdAt,
      messageCount: rows.length,
    });
  }
  return out.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
