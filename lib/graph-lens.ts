/**
 * Lenses over the operating knowledge graph (NikOS): slice the same nodes
 * three ways — by ENTITY TYPE, by FUNCTION (core vs enabling, plus the two
 * venture teams), and by ACTION (what a thing is actually used for). Picking
 * a lens lights the matching nodes and dims the rest. Pure data + matchers;
 * the component supplies the node list and a department resolver.
 */

export type LensGroup = 'entity' | 'function' | 'action';

export type Lens = { id: string; group: LensGroup; label: string };

export type LensNode = { id: string; kind: string };

export type LensContext = {
  nodes: LensNode[];
  /** resolves any node to its pillar's team node id (`team:dept-…`), or null */
  teamOf: (nodeId: string) => string | null;
};

export const ENTITY_LENSES: Lens[] = [
  { id: 'ent-people', group: 'entity', label: 'All people' },
  { id: 'ent-subagents', group: 'entity', label: 'Sub-agents' },
  { id: 'ent-tools', group: 'entity', label: 'Tools' },
  { id: 'ent-workflows', group: 'entity', label: 'Workflows' },
  { id: 'ent-sops', group: 'entity', label: 'SOPs' },
  { id: 'ent-projects', group: 'entity', label: 'Projects' },
  { id: 'ent-teams', group: 'entity', label: 'Teams' },
  { id: 'ent-departments', group: 'entity', label: 'Departments' },
];

export const FUNCTION_LENSES: Lens[] = [
  { id: 'fn-core', group: 'function', label: 'Core' },
  { id: 'fn-enabling', group: 'function', label: 'Enabling' },
  { id: 'fn-diagnostic-maps', group: 'function', label: 'Diagnostic Maps team' },
  { id: 'fn-openfieldpro', group: 'function', label: 'OpenFieldPro team' },
];

export const ACTION_LENSES: Lens[] = [
  { id: 'act-ad-creation', group: 'action', label: 'Ad creation' },
  { id: 'act-lead-generation', group: 'action', label: 'Lead generation' },
  { id: 'act-content-repurposing', group: 'action', label: 'Content repurposing' },
  { id: 'act-content-ideation', group: 'action', label: 'Content ideation' },
  { id: 'act-content-scripts', group: 'action', label: 'Content script creation' },
  { id: 'act-social-sentiment', group: 'action', label: 'Social media sentiment analysis' },
  { id: 'act-social-scheduler', group: 'action', label: 'Social posting & scheduler' },
  { id: 'act-ai-visuals', group: 'action', label: 'AI-generated visual assets' },
  { id: 'act-competitor-intel', group: 'action', label: 'Competitor ad intelligence' },
  { id: 'act-icp-simulation', group: 'action', label: 'ICP identification & simulation' },
  { id: 'act-channel-budget', group: 'action', label: 'Channel & budget allocation' },
];

export const ALL_LENSES: Lens[] = [...ENTITY_LENSES, ...FUNCTION_LENSES, ...ACTION_LENSES];

/** Revenue-facing pillars vs the ones that keep the machine running. */
const CORE_DEPTS = new Set(['team:dept-diagmaps', 'team:dept-fieldops', 'team:dept-research']);
const ENABLING_DEPTS = new Set(['team:dept-dev', 'team:dept-models', 'team:dept-picks', 'team:dept-ops']);

/** Venture team rosters — seeded agent ids (graph nodes are `emp:<id>`). */
const VENTURE_TEAMS: Record<string, string[]> = {
  'fn-diagnostic-maps': ['map-builder', 'guided-qa', 'fleet-coverage'],
  'fn-openfieldpro': ['fieldops-agent', 'release-gate', 'ops-data'],
};

/** What each action actually runs on — seeded agent ids, honest best-fit. */
const ACTION_AGENTS: Record<string, string[]> = {
  'act-ad-creation': ['eval-runner', 'training-run'],
  'act-lead-generation': ['bounty-radar', 'research-agent'],
  'act-content-repurposing': ['data-agent', 'surf-research'],
  'act-content-ideation': ['data-agent', 'surf-research'],
  'act-content-scripts': ['data-agent'],
  'act-social-sentiment': ['data-agent'],
  'act-social-scheduler': ['cron-health'],
  'act-ai-visuals': ['training-run', 'eval-runner'],
  'act-competitor-intel': ['bounty-radar', 'surf-research'],
  'act-icp-simulation': ['data-agent', 'surf-research'],
  'act-channel-budget': ['data-agent', 'ops-data'],
};

const idSet = (ids: string[]) => new Set(ids.map((id) => `emp:${id}`));

/**
 * The node ids a lens lights. Unknown lens → empty set. Workflows and
 * projects are not modeled as graph entities yet — their lenses honestly
 * return empty until those tables exist (larp-first, real-ready).
 */
export function lensNodeSet(lensId: string, ctx: LensContext): Set<string> {
  const out = new Set<string>();
  const byKind = (kind: string) => {
    for (const n of ctx.nodes) if (n.kind === kind) out.add(n.id);
  };
  switch (lensId) {
    case 'ent-people':
      byKind('person');
      break;
    case 'ent-subagents':
      byKind('employee');
      break;
    case 'ent-tools':
      byKind('tool');
      break;
    case 'ent-sops':
      byKind('task');
      break;
    case 'ent-departments':
      byKind('team');
      break;
    case 'ent-teams': {
      const members = idSet([
        ...VENTURE_TEAMS['fn-diagnostic-maps'],
        ...VENTURE_TEAMS['fn-openfieldpro'],
      ]);
      for (const n of ctx.nodes) if (members.has(n.id)) out.add(n.id);
      break;
    }
    case 'ent-workflows':
    case 'ent-projects':
      break; // not modeled yet — honest empty
    case 'fn-core':
    case 'fn-enabling': {
      const depts = lensId === 'fn-core' ? CORE_DEPTS : ENABLING_DEPTS;
      for (const n of ctx.nodes) {
        const team = n.kind === 'team' ? n.id : ctx.teamOf(n.id);
        if (team && depts.has(team)) out.add(n.id);
      }
      break;
    }
    case 'fn-diagnostic-maps':
    case 'fn-openfieldpro': {
      const members = idSet(VENTURE_TEAMS[lensId]);
      for (const n of ctx.nodes) if (members.has(n.id)) out.add(n.id);
      break;
    }
    default: {
      const agents = ACTION_AGENTS[lensId];
      if (!agents) break;
      const members = idSet(agents);
      for (const n of ctx.nodes) if (members.has(n.id)) out.add(n.id);
    }
  }
  return out;
}
