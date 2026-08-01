import { describe, expect, test } from 'vitest';
import { buildKnowledgeGraph } from '@/lib/knowledge-graph';
import { neuralLayout, NEURAL_W, NEURAL_H } from '@/lib/neural-layout';
import type { Agent, Department, Person, SopTask } from '@/lib/schemas';

const dept = (id: string, name: string): Department => ({
  id, name, slug: id, tagline: '', color: '#fff', order: 1,
});
const agent = (over: Partial<Agent> & { id: string; departmentId: string }): Agent => ({
  name: over.id, role: '', status: 'active', tier: 'worker', description: '',
  model: '', tools: [], parentId: null, instance: 'builtin', ...over,
});
const person = (id: string, departmentId: string, tools: string[]): Person => ({
  id, departmentId, name: id, role: 'Human', tools,
});
const task = (id: string, departmentId: string, assigneeKind: SopTask['assigneeKind'], assigneeId: string): SopTask => ({
  id, departmentId, title: `Do ${id}`, summary: '', steps: ['one one one', 'two two two', 'three three three'],
  assigneeKind, assigneeId,
});

const departments = [dept('dept-tech', 'TECH'), dept('dept-sales', 'Sales')];
const agents: Agent[] = [
  agent({ id: 'conductor', departmentId: 'dept-tech', name: 'Conductor', tier: 'lead', tools: ['openclaw'] }),
  agent({ id: 'data-agent', departmentId: 'dept-tech', name: 'Data Agent', parentId: 'conductor', tools: ['openclaw', 'comms-feed'] }),
  agent({ id: 'sales-agent', departmentId: 'dept-sales', name: 'Sales Agent', tools: ['attio'] }),
];
const people: Person[] = [person('person-marco', 'dept-sales', ['fathom'])];
const tasks: SopTask[] = [
  task('sop-conductor', 'dept-tech', 'agent', 'conductor'),
  task('sop-data', 'dept-tech', 'agent', 'data-agent'),
  task('sop-sales', 'dept-sales', 'agent', 'sales-agent'),
  task('sop-marco', 'dept-sales', 'person', 'person-marco'),
];

const layout = () => neuralLayout(buildKnowledgeGraph(agents, departments, people, tasks));

describe('neuralLayout — the feedforward view of the same graph', () => {
  test('five layers left to right: tools → workers → tasks → pillars → self', () => {
    const { layers } = layout();
    expect(layers.map((l) => l.kind)).toEqual(['tool', 'worker', 'task', 'team', 'self']);
    expect(layers[0].nodeIds.length).toBe(4); // openclaw, comms-feed, attio, fathom
    expect(layers[1].nodeIds.length).toBe(4); // 3 agents + Marco
    expect(layers[2].nodeIds.length).toBe(4);
    expect(layers[3].nodeIds.length).toBe(2);
    expect(layers[4].nodeIds).toEqual(['self']);
  });

  test('every graph node is placed exactly once, inside the canvas', () => {
    const g = buildKnowledgeGraph(agents, departments, people, tasks);
    const { pos } = neuralLayout(g);
    expect(pos.size).toBe(g.nodes.length);
    for (const [id, p] of pos) {
      expect(p.x, `${id} x`).toBeGreaterThanOrEqual(0);
      expect(p.x, `${id} x`).toBeLessThanOrEqual(NEURAL_W);
      expect(p.y, `${id} y`).toBeGreaterThanOrEqual(0);
      expect(p.y, `${id} y`).toBeLessThanOrEqual(NEURAL_H);
    }
  });

  test('layer x positions strictly increase left to right', () => {
    const { layers, pos } = layout();
    const xs = layers.map((l) => pos.get(l.nodeIds[0])!.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });

  test('columns funnel: vertical spread strictly tightens toward the output', () => {
    const { layers, pos } = layout();
    const spans = layers.slice(0, 4).map((l) => {
      const ys = l.nodeIds.map((id) => pos.get(id)!.y);
      return Math.max(...ys) - Math.min(...ys);
    });
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i], `layer ${i} span`).toBeLessThan(spans[i - 1]);
    }
    // and every column stays vertically centered on the canvas midline
    for (const l of layers) {
      const ys = l.nodeIds.map((id) => pos.get(id)!.y);
      const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
      expect(Math.abs(mid - NEURAL_H / 2)).toBeLessThan(1);
    }
  });

  test('strands connect adjacent layers only, with deterministic signed weights', () => {
    const { strands, layers, pos } = layout();
    const layerOf = new Map<string, number>();
    layers.forEach((l, i) => l.nodeIds.forEach((id) => layerOf.set(id, i)));
    expect(strands.length).toBeGreaterThan(0);
    for (const s of strands) {
      expect(Math.abs(layerOf.get(s.target)! - layerOf.get(s.source)!), `${s.source}→${s.target} not adjacent`).toBe(1);
      expect(Math.abs(s.weight)).toBeGreaterThan(0);
      expect(Math.abs(s.weight)).toBeLessThanOrEqual(1);
      expect(pos.has(s.source)).toBe(true);
      expect(pos.has(s.target)).toBe(true);
    }
    // deterministic
    expect(layout().strands).toEqual(strands);
    // both signs appear across a real edge set
    expect(strands.some((s) => s.weight > 0)).toBe(true);
    expect(strands.some((s) => s.weight < 0)).toBe(true);
  });

  test('same-layer reports edges are exposed separately for the faint arcs', () => {
    const { reports } = layout();
    expect(reports).toEqual([{ source: 'emp:data-agent', target: 'emp:conductor' }]);
  });
});
