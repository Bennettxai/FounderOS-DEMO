import { describe, expect, test } from 'vitest';
import {
  nearestPillarLayer,
  pillarRadarAxes,
  radarPoint,
  type PillarAxis,
} from '@/lib/pillar-radar';
import type { Agent, AgentRun, Department, SopTask } from '@/lib/schemas';

const dept = (id: string, name: string, order: number): Department => ({
  id, name, slug: id, tagline: '', color: '#fff', order,
});
const agent = (id: string, departmentId: string, status: Agent['status']): Agent => ({
  id, departmentId, name: id, role: '', status, tier: 'worker', description: '',
  model: '', tools: [], parentId: null, instance: 'builtin',
});
const task = (id: string, departmentId: string): SopTask => ({
  id, departmentId, title: id, summary: '', steps: ['one one one', 'two two two', 'three three three'],
  assigneeKind: 'agent', assigneeId: id,
});
const run = (agentId: string, minutesAgo: number): AgentRun => ({
  id: `r-${agentId}`, agentId, startedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  finishedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(), ok: true, summary: 'ok',
});

const departments = [dept('dept-sales', 'Sales', 1), dept('dept-tech', 'TECH', 2)];
const agents = [
  agent('s1', 'dept-sales', 'active'),
  agent('s2', 'dept-sales', 'active'),
  agent('t1', 'dept-tech', 'idle'),
  agent('t2', 'dept-tech', 'idle'),
];
const tasks = [task('s1', 'dept-sales'), task('t1', 'dept-tech')];

describe('pillarRadarAxes — per-pillar health for the spider chart', () => {
  test('one axis per department in graph order, scores in [15, 100]', () => {
    const axes = pillarRadarAxes(departments, agents, tasks, {});
    expect(axes.map((a) => a.id)).toEqual(['dept-sales', 'dept-tech']);
    for (const a of axes) {
      expect(a.score).toBeGreaterThanOrEqual(15);
      expect(a.score).toBeLessThanOrEqual(100);
      expect(a.label.length).toBeGreaterThan(0);
    }
  });

  test('an all-active pillar with a fresh run outscores an idle one', () => {
    const axes = pillarRadarAxes(departments, agents, tasks, { s1: run('s1', 5) });
    const sales = axes.find((a) => a.id === 'dept-sales')!;
    const tech = axes.find((a) => a.id === 'dept-tech')!;
    expect(sales.score).toBeGreaterThan(tech.score);
  });

  test('recency tiers: a fresh run scores higher than a week-old one', () => {
    const fresh = pillarRadarAxes(departments, agents, tasks, { s1: run('s1', 30) });
    const stale = pillarRadarAxes(departments, agents, tasks, { s1: run('s1', 60 * 24 * 10) });
    expect(fresh.find((a) => a.id === 'dept-sales')!.score).toBeGreaterThan(
      stale.find((a) => a.id === 'dept-sales')!.score,
    );
  });

  test('exposes the three constituent layers per pillar, each in [0, 100]', () => {
    const axes = pillarRadarAxes(departments, agents, tasks, { s1: run('s1', 5) });
    const sales = axes.find((a) => a.id === 'dept-sales')!;
    const tech = axes.find((a) => a.id === 'dept-tech')!;
    expect(sales.roster).toBe(100); // both sales agents active
    expect(tech.roster).toBe(0); // both tech agents idle
    expect(sales.freshness).toBe(100); // a run 5 min ago is fresh
    expect(sales.sop).toBe(50); // 1 SOP over a 2-agent roster
    for (const a of axes) {
      for (const k of ['roster', 'freshness', 'sop'] as const) {
        expect(a[k]).toBeGreaterThanOrEqual(0);
        expect(a[k]).toBeLessThanOrEqual(100);
      }
    }
  });

  test('deterministic for identical inputs', () => {
    const runs = { s1: run('s1', 30) };
    expect(pillarRadarAxes(departments, agents, tasks, runs)).toEqual(
      pillarRadarAxes(departments, agents, tasks, runs),
    );
  });
});

describe('radar geometry — points and hover-to-sift layer picking', () => {
  const C = 260;
  const R = 172;
  // four pillars, all identical so each layer is a concentric square: the
  // hover picker becomes purely radial and easy to reason about.
  const mk = (id: string): PillarAxis => ({
    id, label: id, color: '#fff', score: 100, roster: 50, freshness: 25, sop: 10,
  });
  const axes = ['a', 'b', 'c', 'd'].map(mk);

  test('radarPoint places the first axis at the top, then clockwise', () => {
    expect(radarPoint(0, 4, R, C).map(Math.round)).toEqual([260, 88]); // top
    expect(radarPoint(1, 4, R, C).map(Math.round)).toEqual([432, 260]); // right
    expect(radarPoint(2, 4, R, C).map(Math.round)).toEqual([260, 432]); // bottom
    expect(radarPoint(3, 4, R, C).map(Math.round)).toEqual([88, 260]); // left
  });

  test('nearestPillarLayer isolates whichever layer ring the cursor is on', () => {
    // on the score ring (outer, r=172): top vertex is (260, 88)
    expect(nearestPillarLayer({ x: 260, y: 88 }, axes, R, C)).toBe('score');
    // on the freshness ring (r=43): top vertex (260, 217)
    expect(nearestPillarLayer({ x: 260, y: 217 }, axes, R, C)).toBe('freshness');
    // near the center hugs the sop ring (r≈17)
    expect(nearestPillarLayer({ x: 260, y: 245 }, axes, R, C)).toBe('sop');
    // between the roster (r=86 → y=174) and freshness rings, roster is closer
    expect(nearestPillarLayer({ x: 260, y: 168 }, axes, R, C)).toBe('roster');
  });

  test('nearestPillarLayer never throws on an empty axis set', () => {
    expect(nearestPillarLayer({ x: 0, y: 0 }, [], R, C)).toBe('score');
  });
});
