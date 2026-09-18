import { z } from 'zod';

/**
 * The Blueprint graph: the system, drawn from itself. Nothing here is
 * hand-authored: lib/blueprint/compile.ts assembles this shape from the
 * real registries (agents, connectors, skills, stores, daemons, hosts) at
 * request time, which is why the map updates itself when the system does.
 */

export const NODE_KINDS = [
  'operator', // the operator
  'wizard', // the super agent
  'department',
  'agent',
  'person',
  'connector',
  'model', // LLM/generation models a thing runs on
  'skillpack',
  'store', // durable data (queue, pipelines, ad-intel, brain, db)
  'daemon', // scheduled/background processes
  'host', // laptop, deployment host
  'surface', // a page of the OS
  'router', // a diamond node where a real routing rule lives (identity, deals)
] as const;
export const NodeKindSchema = z.enum(NODE_KINDS);
export type NodeKind = z.infer<typeof NodeKindSchema>;

/** Honest lifecycle: live (wired + working), configured (wired, needs a
 *  key/host that is present but unverified), not-configured (wired in code,
 *  missing its credential/host), designed (specified but not wired:
 *  intentionally ghosted nodes). */
export const NodeStatusSchema = z.enum(['live', 'configured', 'not-configured', 'designed']);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

/** Layers, top-down: 0 operator · 1 wizard · 2 departments+agents ·
 *  3 capabilities (models, skills, connectors) · 4 infrastructure. */
export const BlueprintNodeSchema = z.object({
  id: z.string(),
  kind: NodeKindSchema,
  name: z.string(),
  layer: z.number().int().min(0).max(4),
  status: NodeStatusSchema,
  /** One-line honest description shown in the inspector. */
  blurb: z.string().default(''),
  /** Structured facts for the inspector: model, tools, paths, hosts… */
  facts: z.record(z.string(), z.string()).default({}),
  /** Icon name in the Lucide language: the canvas maps it. */
  icon: z.string().default('box'),
});
export type BlueprintNode = z.infer<typeof BlueprintNodeSchema>;

export const EDGE_KINDS = [
  'commands', // operator → wizard → agents
  'member-of', // agent → department
  'uses', // agent/surface → connector/skillpack/model
  'runs-on', // agent/daemon → host · agent → model
  'reads',
  'writes',
  'delivers-to',
] as const;
export const EdgeKindSchema = z.enum(EDGE_KINDS);
export type EdgeKind = z.infer<typeof EdgeKindSchema>;

export const BlueprintEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  kind: EdgeKindSchema,
  /** Router label when the edge passes a real routing rule (path chips). */
  via: z.string().optional(),
});
export type BlueprintEdge = z.infer<typeof BlueprintEdgeSchema>;

export const BlueprintGraphSchema = z.object({
  compiledAt: z.string(),
  nodes: z.array(BlueprintNodeSchema),
  edges: z.array(BlueprintEdgeSchema),
});
export type BlueprintGraph = z.infer<typeof BlueprintGraphSchema>;

/** Every edge endpoint must exist: the compiler's own honesty check. */
export function validateGraph(graph: BlueprintGraph): string[] {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const problems: string[] = [];
  for (const e of graph.edges) {
    if (!ids.has(e.from)) problems.push(`edge from missing node: ${e.from}`);
    if (!ids.has(e.to)) problems.push(`edge to missing node: ${e.to}`);
  }
  const seen = new Set<string>();
  for (const n of graph.nodes) {
    if (seen.has(n.id)) problems.push(`duplicate node id: ${n.id}`);
    seen.add(n.id);
  }
  return problems;
}
