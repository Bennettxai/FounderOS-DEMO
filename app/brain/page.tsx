import { paperclipAgents } from '@/lib/connectors/paperclip';
import type { RosterClient } from '@/lib/schemas';
import { buildKnowledgeGraph } from '@/lib/knowledge-graph';
import { memoryConstellation, wikiFor } from '@/lib/brain-constellation';
import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { BrainDump } from '@/components/BrainDump';
import { BrainGraphView } from '@/components/BrainGraphView';
import { BrainSatellites } from '@/components/BrainSatellites';
import { Rise } from '@/components/motion';

export const dynamic = 'force-dynamic';

// The client roster comes from the seeded funnel journeys (a CRM connector can
// take over at the repo layer); cached per process so a hot page stays cheap.
let rosterCache: { at: number; value: RosterClient[] } | null = null;
const ROSTER_TTL_MS = 60_000;

async function clientRoster(db: ReturnType<typeof getDb>): Promise<RosterClient[]> {
  if (rosterCache && Date.now() - rosterCache.at < ROSTER_TTL_MS) return rosterCache.value;
  const value: RosterClient[] = db.funnel.journeys().map((j) => ({
    id: j.id,
    name: j.name,
    venture: j.venture,
    status: j.status,
    amountUsd: j.amountUsd,
    source: 'funnel' as const,
  }));
  rosterCache = { at: Date.now(), value };
  return value;
}

// memoryConstellation() and wikiFor() moved to lib/brain-constellation.ts so
// the analytics refresh sweep can warm them too — the ~9s buildBrainGraph
// cost (roughly 2,000 combined store+vault notes) belongs on that
// background clock, not on whoever's click loses the 5-minute TTL race. See
// that module's header for the full story; this page just reads through it.

// The G-Brain tab is now a single, uncluttered view: just the knowledge
// graph, sized to fill the screen with no scroll. Health readouts (pillar
// health, doctor, storage, pipeline, query path) live on the Doctor tab.
/** dept id → the board lead's agent name (the seats Alex created on Paperclip) */
const BOARD_LEAD_NAMES: Record<string, string> = {
  'dept-sales': 'Sales',
  'dept-marketing-growth': 'Marketing/Growth',
  'dept-tech': 'TECH',
  'dept-finance': 'Finances',
  'dept-comms': 'Communications',
};

export default async function BrainPage() {
  const db = getDb();
  // latest run per agent (oldest first so the LAST write per id is the newest)
  const runsByAgent = Object.fromEntries(
    db.agentRuns
      .recent(300)
      .reverse()
      .map((r) => [r.agentId, r]),
  );

  // Kicked off before the board read is awaited so the two never stack
  // (the same "sequential awaits" trap already fixed once in comms-feed.ts).
  const clientsPromise = clientRoster(db);

  // live board leads → the head cards' board seat + Run button
  const liveAgents = await paperclipAgents();
  const boardLeads: Record<string, { id: string; name: string; status: string; model: string | null }> = {};
  for (const [deptId, name] of Object.entries(BOARD_LEAD_NAMES)) {
    const a = liveAgents.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (a) boardLeads[deptId] = { id: a.id, name: a.name, status: a.status, model: a.model };
  }

  // Every OTHER live board seat (Conductor, Forge, the worker pool, …)
  // joins the graph as the inner board ring; the five leads already ARE the
  // pillar nodes, so they'd double up here.
  const leadNames = new Set(Object.values(BOARD_LEAD_NAMES).map((n) => n.toLowerCase()));
  const boardAgents = liveAgents
    .filter((a) => !leadNames.has(a.name.toLowerCase()))
    .map((a) => ({ id: a.id, name: a.name, status: a.status, model: a.model }));

  const knowledgeGraph = buildKnowledgeGraph(
    db.agents.all(),
    db.departments.all(),
    db.people.all(),
    db.sopTasks.all(),
    boardAgents.map(({ id, name }) => ({ id, name })),
  );

  return (
    <div className="flex h-[calc(100dvh-9.25rem)] min-h-[520px] flex-col">
      {/* capture rides the header's right slot: one untitled slot — type,
          talk, or drop documents. The graph owns everything under the title. */}
      <PageHeader
        eyebrow="knowledge core"
        title="G-Brain"
        caret
        rightWide
        right={<BrainDump compact />}
      />

      {/* pull the graph up under the header (offsets PageHeader's shared mb-6)
          so the brain-dump sits close to the graph — maximize page space (Alex) */}
      <Rise i={1} className="relative -mt-3 min-h-0 flex-1">
        <BrainGraphView
          fill
          graph={knowledgeGraph}
          agents={db.agents.all()}
          departments={db.departments.all()}
          people={db.people.all()}
          tasks={db.sopTasks.all()}
          memory={memoryConstellation()}
          wiki={wikiFor(
            db.agents.all().map((a) => a.id),
            db.tools.all().map((t) => t.id.replace(/^tool-/, '')),
          )}
          clients={await clientsPromise}
          runsByAgent={runsByAgent}
          boardLeads={boardLeads}
          boardAgents={boardAgents}
          hermesUrl={process.env.HERMES_DASH_URL ?? null}
        />
        {/* Slab satellites around the graph: identity, counter, ask bar, legend, corners. The graph itself is untouched. */}
        <BrainSatellites />
      </Rise>
    </div>
  );
}
