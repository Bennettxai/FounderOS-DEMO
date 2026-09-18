import type { ReactNode } from 'react';
import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { Badge, SectionHead } from '@/components/terminal';
import { WorkflowTree, type AgentPresence } from '@/components/WorkflowTree';
import { ScheduledTasks } from '@/components/ScheduledTasks';
import { scheduledJobRows } from '@/lib/scheduled-jobs';
import { BrandLogo } from '@/lib/brand-logos';
import { toolBrand } from '@/lib/workflow-tool-brands';
import { agentAvatars } from '@/lib/agent-avatars';
import type { AgentRun } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

const RUNS_PER_OWNER = 4;

/**
 * Two halves. The clock half (scheduled tasks, real crons, real run history)
 * is the operator's and stays first. The process-map half is the Slab tree
 * (imported): collapsed cards that expand into a vertical tree
 * with real forks, a step-detail drawer, and a builder that writes the same
 * workflows table.
 */
export default function WorkflowsPage() {
  const db = getDb();
  const workflows = db.workflows.all();
  const agents = db.agents.all();

  // The clock half: what the OS runs on a schedule, and whether it actually
  // ran. Names resolve from the agent roster so a row reads as "Stack Monitor"
  // rather than a slug, and an unresolvable one is flagged instead of quietly
  // rendered blank.
  const crons = db.agentCrons.all();
  const jobs = scheduledJobRows({
    crons,
    stats: db.cronRuns.statsByCron(),
    agentNames: Object.fromEntries(agents.map((a) => [a.id, a.name])),
    // Real run history per cron, straight off cron_runs, for the 12-run strip
    // and the inline failure summary.
    recentRuns: Object.fromEntries(
      crons.map((c) => [c.id, db.cronRuns.byCron(c.id, 12).map((r) => ({ ok: r.ok, summary: r.summary }))]),
    ),
  });
  const healthy = jobs.filter((j) => j.enabled && !j.unknownAgent && !j.overdue && j.lastOk !== false).length;

  // Render the company logos here, server-side: BrandLogo pulls simple-icons,
  // which must never enter the client bundle. The tree receives ready nodes.
  const toolIds = new Set(workflows.flatMap((w) => w.steps.flatMap((s) => s.tools)));
  const toolLogos: Record<string, ReactNode> = {};
  for (const id of toolIds) {
    const b = toolBrand(id);
    toolLogos[id] = <BrandLogo slug={b.slug} name={b.name} size={12} />;
  }

  // Roster reality check: a step only claims "agent live" when its owner is
  // actually active on the real roster.
  const agentPresence: Record<string, AgentPresence> = {};
  for (const a of agents) agentPresence[a.name] = a.status === 'active' ? 'active' : 'inactive';

  // Step detail needs an honest owner identity: a photo when one exists, and
  // that owner's real recent run history, both keyed by the step's owner NAME
  // (the schema stores a display name, not an agent id), resolved against the
  // real roster rather than fabricated.
  const avatars = agentAvatars();
  const agentByName = new Map(agents.map((a) => [a.name, a]));
  const ownerNames = new Set(workflows.flatMap((w) => w.steps.map((s) => s.owner)));
  const avatarByOwner: Record<string, string | null> = {};
  const runsByOwner: Record<string, AgentRun[]> = {};
  for (const name of ownerNames) {
    const agent = agentByName.get(name);
    avatarByOwner[name] = agent ? (avatars.get(agent.id) ?? null) : null;
    runsByOwner[name] = agent ? db.agentRuns.byAgent(agent.id).slice(0, RUNS_PER_OWNER) : [];
  }

  return (
    <div>
      <PageHeader
        eyebrow="scheduled tasks + process map"
        title="Workflows"
        right={
          <Badge tone={healthy === jobs.length ? 'accent' : 'default'}>
            {jobs.length} crons · {healthy} healthy
          </Badge>
        }
      />
      <ScheduledTasks jobs={jobs} agents={agents.map((a) => ({ id: a.id, name: a.name }))} />
      <SectionHead label="Process map" />
      <WorkflowTree
        workflows={workflows}
        toolLogos={toolLogos}
        agentPresence={agentPresence}
        agents={agents.map((a) => ({ id: a.id, name: a.name }))}
        avatarByOwner={avatarByOwner}
        runsByOwner={runsByOwner}
      />
    </div>
  );
}
