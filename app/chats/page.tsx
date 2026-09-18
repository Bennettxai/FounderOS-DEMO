import { getDb } from '@/lib/data';
import { realAgents } from '@/lib/agents/real';
import { conversationSummaries } from '@/lib/chats';
import { paperclipAgents } from '@/lib/connectors/paperclip';
import { PageHeader } from '@/components/PageHeader';
import { ChatHub } from '@/components/ChatHub';
import { Rise } from '@/components/motion';

export const dynamic = 'force-dynamic';

/**
 * /chats — the Claude-style chat hub (the operator): every
 * conversation in one rail (the board Conductor pinned first), the open
 * thread beside it, and a direct line to any agent via New chat.
 */
export default async function ChatsPage() {
  const db = getDb();
  const names = new Map(realAgents.map((a) => [a.id, a.name]));
  const summaries = conversationSummaries(db.agentMessages.recent(500), names);
  const roster = realAgents
    .filter((a) => a.id !== 'conductor')
    .map((a) => ({ id: a.id, name: a.name, description: a.description }));
  const conductorModel = (await paperclipAgents()).find((a) => a.name === 'Conductor')?.model ?? null;

  return (
    <div className="flex flex-col xl:h-[calc(100dvh-9rem)]">
      <PageHeader eyebrow="every conversation" title="Chats" />
      {/* the hub owns its own rounded shell — no square box around it */}
      <Rise i={1} className="flex min-h-0 flex-1 flex-col">
        <ChatHub
          initialSummaries={summaries}
          roster={roster}
          conductorModel={conductorModel}
          boardUrl={process.env.PAPERCLIP_API_URL ?? null}
        />
      </Rise>
    </div>
  );
}
