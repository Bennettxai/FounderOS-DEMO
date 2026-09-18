process.env.FOUNDER_OS_DB = ':memory:';
process.env.LLM_PROVIDER = 'stub';
import { beforeAll, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { realAgents } from '@/lib/agents/real';
import { allConnectorStatuses } from '@/lib/connectors';
import type { ConnectorStatus } from '@/lib/connectors/types';
import { compileBlueprint } from '@/lib/blueprint/compile';
import { validateGraph, type BlueprintGraph } from '@/lib/blueprint/graph';
import { NAV_OPERATE, NAV_AGENTS, NAV_INTELLIGENCE, NAV_SYSTEM, NAV_LIBRARY } from '@/lib/nav';

/**
 * Slab import, slice 4 (2026-09-17): /blueprint compiles the system map
 * from the operator's REAL registries (DB agents, departments, people, skills;
 * the runtime registry; the connector checks; the LLM gateway; the nav) so
 * the map can never drift from the system. Connector and LLM statuses are
 * injectable so this file never fans out to the network.
 */
const CONNECTORS: ConnectorStatus[] = [
  { id: 'attio', name: 'Attio', kind: 'crm', state: 'connected', detail: 'live' },
  { id: 'email', name: 'Email', kind: 'email', state: 'not_configured', detail: 'no inbox' },
  { id: 'slack', name: 'Slack', kind: 'slack', state: 'error', detail: 'HTTP 401' },
  { id: 'gbrain', name: 'G-Brain', kind: 'brain', state: 'connected', detail: 'live' },
];
const LLM_UP: ConnectorStatus = { id: 'llm', name: 'LLM (Gateway)', kind: 'orchestration', state: 'connected', detail: 'gateway' };
const LLM_DOWN: ConnectorStatus = { ...LLM_UP, state: 'not_configured', detail: 'no key' };

let db: FounderDb;
let graph: BlueprintGraph;
beforeAll(async () => {
  db = openDb(':memory:');
  seedDatabase(db);
  graph = await compileBlueprint(db, { connectors: CONNECTORS, llm: LLM_UP });
});

describe('blueprint: the map cannot drift from the system', () => {
  test('every edge lands on a real node; ids are unique', () => {
    expect(validateGraph(graph)).toEqual([]);
    expect(new Set(graph.nodes.map((n) => n.id)).size).toBe(graph.nodes.length);
  });

  test('completeness: every seeded agent appears exactly once (the Conductor as the L1 spine node)', () => {
    const ids = graph.nodes.filter((n) => n.kind === 'agent' || n.kind === 'wizard').map((n) => n.id);
    for (const a of db.agents.all()) {
      const want = a.id === 'conductor' ? 'agent-conductor' : `agent-${a.id}`;
      expect(ids.filter((id) => id === want)).toHaveLength(1);
    }
  });

  test('completeness: every connector status appears as a layer-3 connector node with an honest status', () => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    expect(byId.get('connector-attio')?.status).toBe('live');
    expect(byId.get('connector-email')?.status).toBe('not-configured');
    expect(byId.get('connector-slack')?.status).toBe('configured');
    expect(graph.nodes.filter((n) => n.kind === 'connector')).toHaveLength(CONNECTORS.length);
  });

  test('the spine exists: the operator commands the Conductor; the Conductor commands every other agent', () => {
    const conductor = graph.nodes.find((n) => n.id === 'agent-conductor');
    expect(conductor?.kind).toBe('wizard');
    expect(conductor?.name).toBe('Conductor');
    expect(graph.edges.some((e) => e.from === 'operator' && e.to === 'agent-conductor' && e.kind === 'commands')).toBe(true);
    const commanded = graph.edges.filter((e) => e.from === 'agent-conductor' && e.kind === 'commands' && e.to.startsWith('agent-')).length;
    expect(commanded).toBe(db.agents.all().length - 1);
  });

  test("'live' means wired in the runtime registry AND active on the roster; planned is 'designed'", () => {
    const runtime = new Set(realAgents.map((a) => a.id));
    for (const a of db.agents.all()) {
      if (a.id === 'conductor') continue;
      const node = graph.nodes.find((n) => n.id === `agent-${a.id}`)!;
      if (a.status === 'planned') expect(node.status).toBe('designed');
      else if (!runtime.has(a.id)) expect(node.status).toBe('designed');
      else expect(node.status).toBe(a.status === 'active' ? 'live' : 'configured');
    }
  });

  test('layers are populated 0 through 4', () => {
    for (const layer of [0, 1, 2, 3, 4]) expect(graph.nodes.some((n) => n.layer === layer), `layer ${layer}`).toBe(true);
  });

  test('completeness: every NAV surface appears as a layer-3 surface node with its route as a fact', () => {
    const all = [...NAV_OPERATE, ...NAV_AGENTS, ...NAV_INTELLIGENCE, ...NAV_SYSTEM, ...NAV_LIBRARY];
    for (const item of all) {
      const node = graph.nodes.find((n) => n.kind === 'surface' && n.facts.route === item.href);
      expect(node, item.href).toBeDefined();
      expect(node!.layer).toBe(3);
    }
  });

  test('named surface->store reads exist: brain, finances, trading, brand deals, adpilot', () => {
    const uses = (from: string, to: string) => graph.edges.some((e) => e.from === from && e.to === to && e.kind === 'uses');
    expect(uses('surface-brain', 'store-brain')).toBe(true);
    expect(uses('surface-finances', 'store-ledger')).toBe(true);
    expect(uses('surface-finances', 'store-bank')).toBe(true);
    expect(uses('surface-trading', 'store-candles')).toBe(true);
    expect(uses('surface-brand-deals', 'store-notion-deals')).toBe(true);
    expect(uses('surface-adpilot', 'store-ad-intel')).toBe(true);
  });

  test('honest agent->connector edges: only tools with a real connector behind them, and only when that connector node exists', () => {
    const ids = new Set(graph.nodes.map((n) => n.id));
    const uses = graph.edges.filter((e) => e.kind === 'uses' && e.from.startsWith('agent-') && e.to.startsWith('connector-'));
    expect(uses.length).toBeGreaterThan(0);
    for (const e of uses) expect(ids.has(e.to), e.to).toBe(true);
    expect(uses.some((e) => e.to === 'connector-attio')).toBe(true);
  });

  test('the engine node is the AI Gateway and reflects its status honestly', async () => {
    const up = graph.nodes.find((n) => n.id === 'model-claude-engine')!;
    expect(up.status).toBe('live');
    expect(graph.edges.some((e) => e.from === 'agent-conductor' && e.to === 'model-claude-engine' && e.kind === 'runs-on')).toBe(true);
    const down = await compileBlueprint(db, { connectors: CONNECTORS, llm: LLM_DOWN });
    expect(down.nodes.find((n) => n.id === 'model-claude-engine')!.status).toBe('not-configured');
  });

  test('the deal router exists and its edges resolve to real nodes', () => {
    expect(graph.nodes.find((n) => n.id === 'router-deals')?.kind).toBe('router');
    const ids = new Set(graph.nodes.map((n) => n.id));
    const edges = graph.edges.filter((e) => e.from === 'router-deals' || e.to === 'router-deals');
    expect(edges.length).toBeGreaterThanOrEqual(3);
    for (const e of edges) expect(ids.has(e.from) && ids.has(e.to)).toBe(true);
    expect(edges.some((e) => e.to === 'store-notion-deals')).toBe(true);
  });

  test('daemons and hosts: every daemon runs on a host, none claims live from here', () => {
    const daemons = graph.nodes.filter((n) => n.kind === 'daemon');
    expect(daemons.length).toBeGreaterThanOrEqual(3);
    for (const d of daemons) {
      expect(d.status).not.toBe('live');
      expect(graph.edges.some((e) => e.from === d.id && e.kind === 'runs-on' && e.to.startsWith('host-')), d.id).toBe(true);
    }
    expect(graph.nodes.some((n) => n.kind === 'host')).toBe(true);
  });

  test('nothing in the graph says Slab', () => {
    expect(JSON.stringify(graph)).not.toMatch(/slab/i);
  });

  test('the real connector registry compiles too (no injection), so a new connector shows up with zero edits here', async () => {
    const real = await allConnectorStatuses();
    const g = await compileBlueprint(db, { connectors: real, llm: LLM_UP });
    expect(g.nodes.filter((n) => n.kind === 'connector')).toHaveLength(real.length);
    expect(validateGraph(g)).toEqual([]);
  }, 60_000);
});
