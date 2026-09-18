import { paperclipAgents, paperclipIssues, paperclipRuns } from '@/lib/connectors/paperclip';
import { getDb } from '@/lib/data';
import type { BoardLivePayload } from '@/lib/board-live';
import { PageHeader } from '@/components/PageHeader';
import { AgentsTabs } from '@/components/AgentsTabs';
import { BoardLive } from '@/components/BoardLive';
import { ConductorChat } from '@/components/ConductorChat';
import { Rise } from '@/components/motion';

export const dynamic = 'force-dynamic';

/**
 * /agents, completely de-demo: this is the page the operator actually uses day to day.
 * Everything on this page is live board data or a live embed — the seeded
 * roster cards, fake-tool-block chats, seeded stats/crons/cost analysis are
 * gone. What remains: the polling BoardLive strip (real stats row, seat chips
 * with models, run feed, task lanes), the real CEO chat, and the Hermes
 * worker-pool dashboard tab.
 */
export default async function AgentsPage() {
  // first paint of the live board comes from the server; BoardLive then polls
  const [liveAgents, liveIssues, liveRuns] = await Promise.all([
    paperclipAgents(),
    // Deep enough to clear the done backlog. At 40 the board's 132 finished
    // issues filled the whole response, so the lanes showed nothing but DONE
    // and "Open tasks" reported 0 while two tasks were actually open.
    paperclipIssues(250),
    paperclipRuns(120),
  ]);
  // decisions come from the repo layer, not the board: an approve is ours
  const decisions = getDb().deliverableDecisions.all();
  const boardInitial: BoardLivePayload = {
    connected: liveAgents.length > 0,
    agents: liveAgents,
    issues: liveIssues,
    runs: liveRuns,
    checkedAt: new Date().toISOString(),
    decisions,
  };

  return (
    // Full-viewport cockpit: no scrolling on the page itself, since the
    // page owns exactly the space under the topbar, both panels
    // stretch to the bottom edge, and anything long scrolls INSIDE its panel.
    // Narrow screens fall back to normal flow.
    <div className="flex flex-col xl:h-[calc(100dvh-9rem)]">
      <PageHeader eyebrow="runtime" title="Real Agents" />

      <AgentsTabs
        hermesUrl={process.env.HERMES_DASH_URL ?? 'https://os.example.internal:9000'}
        boardUrl={process.env.PAPERCLIP_API_URL ?? null}
      >
        {/* Board left, Conductor rail right, both full height. On narrow
            screens the Conductor rides on top. */}
        <Rise i={1} className="grid gap-6 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="order-2 min-h-0 min-w-0 xl:order-none xl:col-start-1 xl:row-start-1 xl:h-full">
            <BoardLive initial={boardInitial} boardUrl={process.env.PAPERCLIP_API_URL ?? null} />
          </div>
          <div className="order-1 min-h-0 xl:order-none xl:col-start-2 xl:row-start-1 xl:h-full">
            <ConductorChat model={liveAgents.find((a) => a.name === 'Conductor')?.model ?? null} />
          </div>
        </Rise>
      </AgentsTabs>
    </div>
  );
}
