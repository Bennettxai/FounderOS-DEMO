import type { ReactNode } from 'react';
import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { Rise } from '@/components/motion';
import { WorkflowTree, type AgentPresence } from '@/components/WorkflowTree';
import { BrandLogo } from '@/lib/brand-logos';
import { toolBrand } from '@/lib/workflow-tool-brands';
import { agentAvatars } from '@/lib/agent-avatars';
import type { AgentRun } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

const RUNS_PER_OWNER = 4;

/**
 * The process map: collapsed cards that expand into a vertical tree with
 * real forks, a step-detail drawer, and a builder that writes the same
 * workflows table.
 */
export default function WorkflowsPage() {
  const db = getDb();
  const workflows = db.workflows.all();
  const agents = db.agents.all();

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
      <PageHeader eyebrow="process map" title="Workflows" />
      <Rise i={1}>
        <WorkflowTree
          workflows={workflows}
          toolLogos={toolLogos}
          agentPresence={agentPresence}
          agents={agents.map((a) => ({ id: a.id, name: a.name }))}
          avatarByOwner={avatarByOwner}
          runsByOwner={runsByOwner}
        />
      </Rise>
    </div>
  );
}
