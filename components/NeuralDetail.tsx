'use client';

import { useMemo } from 'react';
import type { Agent, AgentRun, Department, Person, SopTask } from '@/lib/schemas';
import { toolSlugOf, type KnowledgeGraph as KGData } from '@/lib/knowledge-graph';
import { buildToolWiki } from '@/lib/agent-wiki';
import {
  AgentHarnessCard,
  GraphHumanDetailCard,
  SopTaskDetailCard,
  ToolDetailCard,
} from '@/components/KnowledgeDetail';

/**
 * The SAME detail cards the radial view opens, wired for the neural view:
 * resolves a clicked neuron id (emp:/person:/task:/tool:) to the matching
 * card with its chain (SOP, worker, tools, last run) derived from raw rows.
 */

const prettify = (slug: string) =>
  slug.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const agoLabel = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export function NeuralDetail({
  nodeId, graph, agents, departments, people, tasks, runsByAgent, onSelect, onClose,
}: {
  nodeId: string;
  graph: KGData;
  agents: Agent[];
  departments: Department[];
  people: Person[];
  tasks: SopTask[];
  runsByAgent: Record<string, AgentRun>;
  onSelect: (nodeId: string) => void;
  onClose: () => void;
}) {
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? id;
  const chips = (slugs: string[]) =>
    slugs.map((slug) => ({ slug, name: prettify(slug), mcp: buildToolWiki(slug).mcp }));
  // resolve a slug to this graph's tool node (dept copy or plain id)
  const toolNodeFor = useMemo(
    () => (slug: string) =>
      graph.nodes.find((n) => n.kind === 'tool' && toolSlugOf(n.id) === slug)?.id ?? null,
    [graph],
  );
  const selectTool = (slug: string) => {
    const id = toolNodeFor(slug);
    if (id) onSelect(id);
  };

  if (nodeId.startsWith('emp:')) {
    const agent = agents.find((a) => `emp:${a.id}` === nodeId);
    if (!agent) return null;
    const task = tasks.find((t) => t.assigneeKind === 'agent' && t.assigneeId === agent.id) ?? null;
    const parent = agent.parentId ? agents.find((a) => a.id === agent.parentId) ?? null : null;
    const subs = agents.filter((a) => a.parentId === agent.id).map((a) => ({ id: a.id, name: a.name }));
    const run = runsByAgent[agent.id] ?? null;
    return (
      <AgentHarnessCard
        agent={agent}
        task={task}
        parentName={parent?.name ?? null}
        parentAgentId={parent?.id ?? null}
        subAgents={subs}
        lastRun={run ? { ok: run.ok, summary: run.summary } : null}
        runLabel={run ? agoLabel(run.finishedAt) : null}
        headName={people.find((p) => p.departmentId === agent.departmentId)?.name ?? null}
        onClose={onClose}
        onTool={selectTool}
        onAgent={(id) => onSelect(`emp:${id}`)}
        onTask={task ? () => onSelect(`task:${task.id}`) : undefined}
      />
    );
  }

  if (nodeId.startsWith('person:')) {
    const person = people.find((p) => `person:${p.id}` === nodeId);
    if (!person) return null;
    const task = tasks.find((t) => t.assigneeKind === 'person' && t.assigneeId === person.id) ?? null;
    return (
      <GraphHumanDetailCard
        person={person}
        deptName={deptName(person.departmentId)}
        color="var(--warn)"
        task={task}
        tools={chips(person.tools)}
        onClose={onClose}
        onTask={task ? () => onSelect(`task:${task.id}`) : undefined}
        onTool={selectTool}
      />
    );
  }

  if (nodeId.startsWith('task:')) {
    const task = tasks.find((t) => `task:${t.id}` === nodeId);
    if (!task) return null;
    const agent = task.assigneeKind === 'agent' ? agents.find((a) => a.id === task.assigneeId) ?? null : null;
    const person = task.assigneeKind === 'person' ? people.find((p) => p.id === task.assigneeId) ?? null : null;
    const workerNode = agent ? `emp:${agent.id}` : person ? `person:${person.id}` : null;
    return (
      <SopTaskDetailCard
        task={task}
        assigneeName={agent?.name ?? person?.name ?? task.assigneeId}
        assigneeKindLabel={agent ? 'AI agent' : 'human'}
        assigneeColor={agent ? 'var(--accent)' : 'var(--warn)'}
        runtime={agent ? `${agent.instance} · ${agent.model}` : 'human · judgment call'}
        tools={chips(agent?.tools ?? person?.tools ?? [])}
        onClose={onClose}
        onAssignee={workerNode ? () => onSelect(workerNode) : undefined}
        onTool={selectTool}
      />
    );
  }

  if (nodeId.startsWith('tool:')) {
    const slug = toolSlugOf(nodeId);
    const users = [
      ...agents.filter((a) => a.tools.includes(slug)).map((a) => a.name),
      ...people.filter((p) => p.tools.includes(slug)).map((p) => p.name),
    ];
    return <ToolDetailCard wiki={buildToolWiki(slug, users)} onClose={onClose} />;
  }

  return null;
}
